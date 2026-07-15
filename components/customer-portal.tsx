"use client";

import {
  CalendarClock, CheckCircle2, ClipboardCheck, FileText, History, ImageIcon, KeyRound, LoaderCircle,
  LogOut, Paperclip, RefreshCw, ShieldCheck, Star, Wrench, XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GROUP_META, boardGroup, dateTime, fullDate, money, statusLabel } from "@/lib/workshop";
import { ServiceProgress, ServiceTimeline } from "@/components/service-progress";

type Vehicle = { id: string; plate: string; brand: string; model: string; color: string | null; mileage: number };
type OrderItem = { id: string; type: string; description: string; quantity: number; total: number; warranty_days: number | null };
type OrderEvent = { id: number; type: string; description: string; created_at: string };
type Photo = { id: string; stage: string; path: string; caption: string | null };
type Attachment = { id: string; kind: string; file_name: string; path: string };
type OrderWarranty = { id: string; description: string; starts_at: string; expires_at: string; status: string };
type Order = {
  id: string; number: string; status: string; status_label: string; complaint: string; diagnosis: string | null; customer_notes: string | null;
  entry_at: string; due_at: string | null; completed_at: string | null; delivered_at: string | null;
  parts_subtotal: number; services_subtotal: number; discount_total: number; total: number; vehicle_id: string;
  items: OrderItem[]; events: OrderEvent[]; photos: Photo[]; attachments: Attachment[]; warranties: OrderWarranty[];
};
type EstimateItem = { id: string; description: string; quantity: number; total: number; approval_status: string };
type Estimate = { id: string; number: string; status: string; valid_until: string | null; total: number; approved_at: string | null; items: EstimateItem[] };
type Warranty = { id: string; description: string; type: string; starts_at: string; expires_at: string; status: string };
type Snapshot = { customer: { name: string }; expires_at: string; vehicles: Vehicle[]; work_orders: Order[]; estimates: Estimate[]; warranties: Warranty[] };

const STAGE_LABELS: Record<string, string> = { intake: "Entrada", before: "Antes", during: "Durante", after: "Depois", delivery: "Entrega" };
const KIND_LABELS: Record<string, string> = { service_order_pdf: "PDF da Ordem de Serviço", invoice_pdf: "PDF da Nota Fiscal", estimate_pdf: "Orçamento (PDF)", document: "Documento", image: "Imagem", other: "Arquivo" };
const REFRESH_INTERVAL_MS = 20_000;

export function CustomerPortal() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState(false);
  const tokenRef = useRef("");

  const load = useCallback(async (raw?: string, silent = false) => {
    const value = raw ?? tokenRef.current;
    if (!value) { setLoading(false); return; }
    if (!silent) { setLoading(true); setError(null); }
    try {
      const supabase = createClient();
      const { data: result, error: loadError } = await supabase.rpc("get_customer_portal", { p_token: value });
      if (loadError) throw loadError;
      setData(result as Snapshot);
      tokenRef.current = value; setToken(value);
      try { window.sessionStorage.setItem("motora_portal_token", value); } catch { /* armazenamento indisponível */ }
    } catch {
      if (!silent) { setData(null); setError("Este acesso é inválido, expirou ou foi revogado."); }
    } finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      let raw = params.get("token") ?? "";
      if (!raw) { try { raw = window.sessionStorage.getItem("motora_portal_token") ?? ""; } catch { raw = ""; } }
      if (raw) void load(raw); else setLoading(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Atualização automática: o cliente vê o status em tempo quase real, sem recarregar a página.
  useEffect(() => {
    if (!data) return;
    const interval = window.setInterval(() => void load(undefined, true), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [data, load]);

  const signOut = () => {
    tokenRef.current = ""; setToken(""); setData(null); setError(null);
    try { window.sessionStorage.removeItem("motora_portal_token"); } catch { /* sem armazenamento */ }
    window.location.hash = "";
  };

  const decide = async (estimate: Estimate, decision: "approved" | "rejected") => {
    if (!window.confirm(decision === "approved" ? "Aprovar todos os itens deste orçamento?" : "Recusar todos os itens deste orçamento?")) return;
    setAction(true); setError(null);
    const { error: rpcError } = await createClient().rpc("portal_respond_estimate", { p_token: tokenRef.current, p_estimate_id: estimate.id, p_decision: decision, p_notes: null });
    if (rpcError) setError(rpcError.message); else await load();
    setAction(false);
  };

  if (loading) return <PortalFrame><div className="grid min-h-[70vh] place-items-center"><LoaderCircle className="animate-spin text-[var(--brand)]" /></div></PortalFrame>;
  if (!data) return <PortalFrame><PortalLogin error={error} busy={action} onToken={(value) => void load(value)} onCredentials={async (taxId, plate, code) => {
    setAction(true); setError(null);
    try {
      const { data: newToken, error: loginError } = await createClient().rpc("portal_login", { p_tax_id: taxId || null, p_license_plate: plate, p_order_number: code || null });
      if (loginError || !newToken) throw loginError ?? new Error("invalid");
      await load(String(newToken));
    } catch { setError("Não encontramos um atendimento com esses dados. Confira o CPF/CNPJ, a placa e o código."); }
    finally { setAction(false); }
  }} /></PortalFrame>;

  return <PortalFrame onSignOut={signOut}>
    <main className="mx-auto max-w-6xl px-4 py-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--brand)]">Portal do cliente</p>
          <h1 className="mt-1 text-2xl font-bold">Olá, {data.customer.name}</h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">Acompanhe o serviço em tempo real. Acesso válido até {dateTime(data.expires_at)}.</p>
        </div>
        <button onClick={() => void load()} className="inline-flex h-9 items-center gap-2 border border-[var(--line)] px-3 text-xs font-bold"><RefreshCw size={14} />Atualizar agora</button>
      </div>
      {error && <div className="mt-5 border border-[#e9b3ad] bg-[#fff3f1] px-4 py-3 text-xs text-[var(--danger)]">{error}</div>}

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {data.vehicles.map((vehicle) => (
          <article key={vehicle.id} className="border border-[var(--line)] bg-[var(--surface)] p-5">
            <Wrench size={18} className="text-[var(--brand)]" />
            <p className="mt-3 text-lg font-bold tracking-wide">{vehicle.plate}</p>
            <p className="text-sm text-[var(--ink-muted)]">{vehicle.brand} {vehicle.model}{vehicle.color ? ` • ${vehicle.color}` : ""}</p>
            <p className="mt-3 text-xs">{Number(vehicle.mileage).toLocaleString("pt-BR")} km</p>
          </article>
        ))}
      </section>

      <Section title="Ordens de serviço" icon={Wrench}>
        {data.work_orders.length ? data.work_orders.map((order) => <OrderCard key={order.id} order={order} token={token} onError={setError} />) : <Empty />}
      </Section>

      <Section title="Orçamentos" icon={ClipboardCheck}>
        {data.estimates.length ? data.estimates.map((estimate) => (
          <article key={estimate.id} className="border-b border-[var(--line)] p-5 last:border-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="font-bold">Orçamento {estimate.number}</p><p className="mt-1 text-xs text-[var(--ink-muted)]">Validade: {estimate.valid_until ? fullDate(estimate.valid_until) : "não informada"}{estimate.approved_at ? ` • Aprovado em ${fullDate(estimate.approved_at)}` : ""}</p></div>
              <strong>{money(estimate.total)}</strong>
            </div>
            <div className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {estimate.items.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 py-2 text-xs"><span>{item.description} × {item.quantity}</span><span>{money(item.total)}</span></div>)}
            </div>
            {["sent", "viewed", "partially_approved"].includes(estimate.status) ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button disabled={action} onClick={() => void decide(estimate, "approved")} className="inline-flex h-9 items-center gap-2 bg-[var(--brand)] px-4 text-xs font-bold text-white"><CheckCircle2 size={15} />Aprovar itens</button>
                <button disabled={action} onClick={() => void decide(estimate, "rejected")} className="inline-flex h-9 items-center gap-2 border border-[var(--line-strong)] px-4 text-xs font-bold text-[var(--danger)]"><XCircle size={15} />Recusar</button>
              </div>
            ) : <div className="mt-4"><StatusChip value={estimate.status} /></div>}
          </article>
        )) : <Empty />}
      </Section>

      <Section title="Garantias" icon={ShieldCheck}>
        {data.warranties.length ? data.warranties.map((warranty) => (
          <article key={warranty.id} className="flex items-center gap-4 border-b border-[var(--line)] p-5 last:border-0">
            <div className="grid size-9 place-items-center bg-[var(--brand-soft)] text-[var(--brand)]"><ShieldCheck size={17} /></div>
            <div className="min-w-0 flex-1"><p className="font-bold">{warranty.description}</p><p className="mt-1 text-xs text-[var(--ink-muted)]">Válida até {fullDate(warranty.expires_at)}</p></div>
            <StatusChip value={warranty.status} />
          </article>
        )) : <Empty />}
      </Section>
    </main>
  </PortalFrame>;
}

// Cartão completo da ordem: progresso, valores, itens, timeline, fotos e anexos.
function OrderCard({ order, token, onError }: { order: Order; token: string; onError: (message: string | null) => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const group = boardGroup(order.status, order.due_at);
  const parts = order.items.filter((item) => item.type === "part" || item.type === "supply");
  const services = order.items.filter((item) => item.type === "service" || item.type === "outsourced");

  const publicUrl = (path: string) => {
    try { return createClient().storage.from("work-order-media").getPublicUrl(path).data.publicUrl; } catch { return "#"; }
  };

  const sendRating = async () => {
    setSending(true); onError(null);
    const { error: rpcError } = await createClient().rpc("portal_submit_rating", { p_token: token, p_work_order_id: order.id, p_rating: rating, p_comment: comment || null });
    if (rpcError) onError(rpcError.message); else { setComment(""); window.alert("Avaliação enviada. Obrigado!"); }
    setSending(false);
  };

  return (
    <article className="border-b border-[var(--line)] p-5 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-bold">OS {order.number}</p><p className="mt-1 text-xs text-[var(--ink-muted)]">{order.complaint}</p></div>
        <span className="rounded-full px-3 py-1 text-[10px] font-bold text-white" style={{ background: GROUP_META[group].accent }}>{order.status_label ?? statusLabel(order.status)}</span>
      </div>

      <div className="mt-4"><ServiceProgress status={order.status} /></div>

      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-4">
        <span className="inline-flex items-center gap-1.5"><CalendarClock size={13} className="text-[var(--brand)]" />Entrada: {fullDate(order.entry_at)}</span>
        <span className="inline-flex items-center gap-1.5"><CalendarClock size={13} className="text-[var(--brand)]" />Previsão: {order.due_at ? fullDate(order.due_at) : "A definir"}</span>
        <span>Peças: {money(order.parts_subtotal)} • Serviços: {money(order.services_subtotal)}</span>
        <strong>Total estimado: {money(order.total)}</strong>
      </div>

      {order.diagnosis && <p className="mt-3 text-xs"><strong>Diagnóstico:</strong> {order.diagnosis}</p>}
      {order.customer_notes && <p className="mt-1 text-xs"><strong>Observações:</strong> {order.customer_notes}</p>}

      {(services.length > 0 || parts.length > 0) && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {services.length > 0 && <div><p className="text-xs font-bold">Serviços contratados</p><div className="mt-1 divide-y divide-[var(--line)] border-y border-[var(--line)]">{services.map((item) => <div key={item.id} className="flex justify-between gap-3 py-1.5 text-xs"><span>{item.description}</span><span>{money(item.total)}</span></div>)}</div></div>}
          {parts.length > 0 && <div><p className="text-xs font-bold">Peças trocadas</p><div className="mt-1 divide-y divide-[var(--line)] border-y border-[var(--line)]">{parts.map((item) => <div key={item.id} className="flex justify-between gap-3 py-1.5 text-xs"><span>{item.description} × {item.quantity}{item.warranty_days ? ` • garantia ${item.warranty_days} dias` : ""}</span><span>{money(item.total)}</span></div>)}</div></div>}
        </div>
      )}

      {order.events.length > 0 && (
        <details className="mt-4 border border-[var(--line)]" open>
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-xs font-bold"><History size={14} className="text-[var(--brand)]" />Linha do tempo do serviço</summary>
          <div className="px-4 pb-4"><ServiceTimeline events={order.events} /></div>
        </details>
      )}

      {order.photos.length > 0 && (
        <div className="mt-4">
          <p className="flex items-center gap-2 text-xs font-bold"><ImageIcon size={14} className="text-[var(--brand)]" />Fotos do veículo (antes e depois)</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {order.photos.map((photo) => (
              <a key={photo.id} href={publicUrl(photo.path)} target="_blank" rel="noreferrer" className="group border border-[var(--line)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- mídia externa do Supabase Storage */}
                <img src={publicUrl(photo.path)} alt={photo.caption ?? `Foto ${STAGE_LABELS[photo.stage] ?? photo.stage}`} loading="lazy" className="aspect-square w-full object-cover transition group-hover:opacity-90" />
                <span className="block px-2 py-1 text-[10px] font-bold text-[var(--ink-muted)]">{STAGE_LABELS[photo.stage] ?? photo.stage}{photo.caption ? ` • ${photo.caption}` : ""}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {order.attachments.length > 0 && (
        <div className="mt-4">
          <p className="flex items-center gap-2 text-xs font-bold"><Paperclip size={14} className="text-[var(--brand)]" />Arquivos e documentos</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {order.attachments.map((attachment) => (
              <a key={attachment.id} href={publicUrl(attachment.path)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border border-[var(--line)] px-3 py-2 text-xs font-semibold transition hover:border-[var(--brand)] hover:text-[var(--brand)]">
                <FileText size={14} />{KIND_LABELS[attachment.kind] ?? attachment.kind}{attachment.kind !== "service_order_pdf" && attachment.kind !== "invoice_pdf" ? ` — ${attachment.file_name}` : ""}
              </a>
            ))}
          </div>
        </div>
      )}

      {order.warranties.length > 0 && (
        <div className="mt-4 border border-[var(--line)] bg-[var(--brand-soft)] px-4 py-3">
          {order.warranties.map((warranty) => <p key={warranty.id} className="flex items-center gap-2 text-xs font-semibold text-[var(--brand)]"><ShieldCheck size={14} />{warranty.description} — garantia válida até {fullDate(warranty.expires_at)}</p>)}
        </div>
      )}

      {order.status === "delivered" && (
        <div className="mt-4 border-t border-[var(--line)] pt-4">
          <p className="text-xs font-bold">Avalie o atendimento</p>
          <div className="mt-2 flex gap-1">{[1, 2, 3, 4, 5].map((value) => <button key={value} onClick={() => setRating(value)} aria-label={`${value} estrelas`}><Star size={20} className={value <= rating ? "fill-[#d69b20] text-[#d69b20]" : "text-[var(--line-strong)]"} /></button>)}</div>
          {rating > 0 && <div className="mt-3 flex gap-2"><input value={comment} onChange={(event) => setComment(event.target.value)} className="h-9 min-w-0 flex-1 border border-[var(--line)] px-3 text-xs" placeholder="Comentário opcional" /><button disabled={sending} onClick={() => void sendRating()} className="bg-[var(--brand)] px-4 text-xs font-bold text-white">Enviar</button></div>}
        </div>
      )}
    </article>
  );
}

// Entrada do portal: token seguro OU CPF/CNPJ + placa (+ código do atendimento).
function PortalLogin({ error, busy, onToken, onCredentials }: { error: string | null; busy: boolean; onToken: (token: string) => void; onCredentials: (taxId: string, plate: string, code: string) => Promise<void> }) {
  const [mode, setMode] = useState<"credentials" | "token">("credentials");
  const [taxId, setTaxId] = useState("");
  const [plate, setPlate] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");

  return (
    <section className="mx-auto mt-14 max-w-md border border-[var(--line)] bg-[var(--surface)] p-6">
      <ShieldCheck className="mx-auto block text-[var(--brand)]" />
      <h1 className="mt-4 text-center text-xl font-bold">Acompanhe seu veículo</h1>
      <p className="mt-2 text-center text-sm text-[var(--ink-muted)]">Veja status, fotos, orçamentos e a linha do tempo do serviço.</p>
      <div className="mt-5 grid grid-cols-2 border border-[var(--line)] p-1" role="tablist" aria-label="Forma de acesso">
        <button role="tab" aria-selected={mode === "credentials"} onClick={() => setMode("credentials")} className={`h-9 text-xs font-bold transition ${mode === "credentials" ? "bg-[var(--brand)] text-white" : "text-[var(--ink-muted)]"}`}>CPF + Placa</button>
        <button role="tab" aria-selected={mode === "token"} onClick={() => setMode("token")} className={`h-9 text-xs font-bold transition ${mode === "token" ? "bg-[var(--brand)] text-white" : "text-[var(--ink-muted)]"}`}>Código de acesso</button>
      </div>
      {error && <p className="mt-4 text-center text-xs text-[var(--danger)]">{error}</p>}
      {mode === "credentials" ? (
        <form className="mt-4" onSubmit={(event) => { event.preventDefault(); void onCredentials(taxId, plate, code); }}>
          <label className="block text-xs font-bold">CPF ou CNPJ<input value={taxId} onChange={(event) => setTaxId(event.target.value)} className="mt-1.5 h-10 w-full border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm font-normal outline-none focus:border-[var(--brand)]" placeholder="Somente números" inputMode="numeric" autoComplete="off" /></label>
          <label className="mt-3 block text-xs font-bold">Placa do veículo<input required value={plate} onChange={(event) => setPlate(event.target.value.toUpperCase())} className="mt-1.5 h-10 w-full border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm font-normal uppercase tracking-widest outline-none focus:border-[var(--brand)]" placeholder="ABC1D23" autoComplete="off" /></label>
          <label className="mt-3 block text-xs font-bold">Código do atendimento <span className="font-normal text-[var(--ink-muted)]">(opcional)</span><input value={code} onChange={(event) => setCode(event.target.value)} className="mt-1.5 h-10 w-full border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm font-normal outline-none focus:border-[var(--brand)]" placeholder="Número da OS" autoComplete="off" /></label>
          <button type="submit" disabled={busy} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 bg-[var(--brand)] text-sm font-bold text-white disabled:opacity-60">{busy && <LoaderCircle size={15} className="animate-spin" />}Acompanhar meu veículo</button>
          <p className="mt-3 text-center text-[11px] text-[var(--ink-muted)]">Informe o CPF/CNPJ do cadastro ou o código impresso na ordem de serviço.</p>
        </form>
      ) : (
        <form className="mt-4" onSubmit={(event) => { event.preventDefault(); if (token.trim()) onToken(token.trim()); }}>
          <label className="block text-xs font-bold">Código de acesso<input required value={token} onChange={(event) => setToken(event.target.value.trim())} className="mt-1.5 h-10 w-full border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm font-normal outline-none focus:border-[var(--brand)]" placeholder="Cole o código recebido da oficina" autoComplete="off" /></label>
          <button type="submit" disabled={busy} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 bg-[var(--brand)] text-sm font-bold text-white disabled:opacity-60"><KeyRound size={15} />Entrar com segurança</button>
        </form>
      )}
    </section>
  );
}

function PortalFrame({ children, onSignOut }: { children: React.ReactNode; onSignOut?: () => void }) {
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <header className="border-b border-[var(--line)] bg-[var(--sidebar)] px-5 py-4 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="grid size-9 place-items-center bg-[var(--brand)]"><Wrench size={18} /></div>
          <div className="flex-1"><p className="font-bold">MOTORA</p><p className="text-[10px] uppercase tracking-[.16em] text-white/60">Portal seguro</p></div>
          {onSignOut && <button onClick={onSignOut} className="inline-flex items-center gap-2 border border-white/20 px-3 py-1.5 text-xs font-bold text-white/80 transition hover:text-white"><LogOut size={14} />Sair</button>}
        </div>
      </header>
      {children}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Wrench; children: React.ReactNode }) {
  return <section className="mt-6 border border-[var(--line)] bg-[var(--surface)]"><div className="flex items-center gap-2 border-b border-[var(--line)] px-5 py-4"><Icon size={17} className="text-[var(--brand)]" /><h2 className="font-bold">{title}</h2></div>{children}</section>;
}

function StatusChip({ value }: { value: string }) {
  const labels: Record<string, string> = { approved: "Aprovado", rejected: "Recusado", expired: "Expirado", converted: "Convertido", cancelled: "Cancelado", draft: "Em preparação", diagnosis: "Em diagnóstico", active: "Ativa", claimed: "Acionada", voided: "Cancelada" };
  return <span className="rounded-full bg-[var(--brand-soft)] px-2.5 py-1 text-[10px] font-bold text-[var(--brand)]">{labels[value] ?? value.replaceAll("_", " ")}</span>;
}

function Empty() { return <p className="p-6 text-center text-xs text-[var(--ink-muted)]">Nenhum registro disponível neste acesso.</p>; }
