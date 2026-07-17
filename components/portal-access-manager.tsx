"use client";

import { Check, Copy, ExternalLink, KeyRound, LoaderCircle, RefreshCw, ShieldOff } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { SearchableSelect, type SearchableOption } from "@/components/searchable-select";
import { createClient } from "@/lib/supabase/client";

type Customer = { id: string; name: string; primary_phone: string | null };
type Order = { id: string; customer_id: string; number: string; status: string };
type Access = {
  id: string;
  customer_id: string;
  work_order_id: string | null;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

const statusName = (status: string) => status.replaceAll("_", " ");
const formatDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

export function PortalAccessManager() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [accesses, setAccesses] = useState<Access[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ customer_id: "", work_order_id: "", hours: "72" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sua sessão expirou.");

      const { data: profile } = await supabase
        .from("profiles")
        .select("last_organization_id,last_branch_id")
        .eq("id", user.id)
        .single();
      if (!profile?.last_organization_id || !profile.last_branch_id) throw new Error("Conclua o onboarding.");

      const [customerResult, orderResult, accessResult, settingResult] = await Promise.all([
        supabase.from("customers").select("id,name,primary_phone").eq("organization_id", profile.last_organization_id).eq("primary_branch_id", profile.last_branch_id).is("deleted_at", null).order("name").limit(500),
        supabase.from("work_orders").select("id,customer_id,number,status").eq("organization_id", profile.last_organization_id).eq("branch_id", profile.last_branch_id).is("deleted_at", null).order("entry_at", { ascending: false }).limit(300),
        supabase.from("portal_access_tokens").select("id,customer_id,work_order_id,expires_at,revoked_at,last_used_at,created_at").eq("organization_id", profile.last_organization_id).eq("branch_id", profile.last_branch_id).order("created_at", { ascending: false }).limit(100),
        supabase.from("application_settings").select("value").eq("organization_id", profile.last_organization_id).eq("branch_id", profile.last_branch_id).eq("key", "portal_token_hours").maybeSingle(),
      ]);
      const firstError = customerResult.error ?? orderResult.error ?? accessResult.error ?? settingResult.error;
      if (firstError) throw firstError;

      setCustomers((customerResult.data ?? []) as Customer[]);
      setOrders((orderResult.data ?? []) as Order[]);
      setAccesses((accessResult.data ?? []) as Access[]);
      const configured = Number((settingResult.data?.value as { value?: unknown } | undefined)?.value);
      if (Number.isInteger(configured) && configured >= 1 && configured <= 720) {
        setForm((current) => ({ ...current, hours: String(configured) }));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível carregar os acessos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const customerMap = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const orderMap = useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders]);
  const targetOptions = useMemo<SearchableOption[]>(() => {
    const options: SearchableOption[] = [];
    for (const customer of customers) {
      const phone = customer.primary_phone ? ` • ${customer.primary_phone}` : "";
      options.push({ id: `customer:${customer.id}`, label: `Cliente • ${customer.name}${phone} • histórico permitido` });
    }
    for (const order of orders) {
      const customer = customerMap.get(order.customer_id);
      options.push({ id: `order:${order.id}`, label: `OS ${order.number} • ${customer?.name ?? "Cliente"} • ${statusName(order.status)}` });
    }
    return options;
  }, [customerMap, customers, orders]);

  const selectedTarget = form.work_order_id
    ? `order:${form.work_order_id}`
    : form.customer_id ? `customer:${form.customer_id}` : "";

  const selectTarget = (value: string) => {
    const [kind, id] = value.split(":", 2);
    if (kind === "order") {
      const order = orderMap.get(id);
      if (order) setForm((current) => ({ ...current, customer_id: order.customer_id, work_order_id: order.id }));
      return;
    }
    if (kind === "customer" && customerMap.has(id)) {
      setForm((current) => ({ ...current, customer_id: id, work_order_id: "" }));
    }
  };

  const issue = async (event: FormEvent) => {
    event.preventDefault();
    const hours = Number(form.hours);
    if (!form.customer_id || !Number.isInteger(hours) || hours < 1 || hours > 720) {
      setError("Selecione um cliente ou OS e informe uma validade entre 1 e 720 horas.");
      return;
    }
    setSaving(true);
    setError(null);
    setLink("");
    try {
      const { data, error: rpcError } = await createClient().rpc("create_portal_access", {
        p_customer_id: form.customer_id,
        p_work_order_id: form.work_order_id || null,
        p_hours: hours,
      });
      if (rpcError) throw rpcError;
      setLink(`${window.location.origin}/portal#token=${String(data)}`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível emitir o acesso.");
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (id: string) => {
    if (!window.confirm("Revogar este acesso imediatamente?")) return;
    setError(null);
    const { error: revokeError } = await createClient().from("portal_access_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    if (revokeError) setError("Não foi possível revogar o acesso.");
    else await load();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione o link e copie manualmente.");
    }
  };

  return <main className="mx-auto max-w-[1200px] px-4 py-5 lg:px-7 lg:py-6">
    <div className="mb-5 flex items-start justify-between gap-4"><div><p className="mb-1 text-[11px] font-bold uppercase tracking-[.14em] text-[var(--brand)]">Portal do cliente</p><h1 className="text-2xl font-bold">Acessos temporários</h1><p className="mt-1 text-sm text-[var(--ink-muted)]">Crie links seguros, com prazo de validade e acesso apenas ao serviço escolhido.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="grid size-10 shrink-0 place-items-center border border-[var(--line)] disabled:opacity-50" aria-label="Atualizar acessos"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button></div>
    {error && <div role="alert" className="mb-4 border border-[#e9b3ad] bg-[#fff3f1] px-4 py-3 text-xs text-[var(--danger)]">{error}</div>}
    <section className="grid gap-5 lg:grid-cols-[420px_1fr]">
      <form onSubmit={issue} className="border border-[var(--line)] bg-[var(--surface)] p-5"><div className="grid size-10 place-items-center bg-[var(--brand-soft)] text-[var(--brand)]"><KeyRound size={19} /></div><h2 className="mt-4 font-bold">Novo acesso</h2><p className="mt-1 text-xs text-[var(--ink-muted)]">Pesquise pelo nome do cliente ou pelo número da ordem de serviço.</p><div className="mt-4"><SearchableSelect label="Cliente ou ordem de serviço" required value={selectedTarget} options={targetOptions} onChange={selectTarget} placeholder={loading ? "Carregando cadastros..." : "Buscar cliente ou OS"} /></div>
        {selectedTarget && <div className="mt-3 border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2.5 text-xs"><p className="font-bold">Acesso selecionado</p><p className="mt-1 text-[var(--ink-muted)]">{form.work_order_id ? `Somente a OS ${orderMap.get(form.work_order_id)?.number ?? "selecionada"}` : "Histórico permitido do cliente"}</p></div>}
        <label className="mt-4 block text-xs font-bold">Validade em horas<input required min="1" max="720" type="number" inputMode="numeric" value={form.hours} onChange={(event) => setForm((current) => ({ ...current, hours: event.target.value }))} className="mt-2 h-10 w-full border border-[var(--line-strong)] bg-[var(--surface)] px-3" /></label><button disabled={saving || loading || !form.customer_id} className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 bg-[var(--brand)] text-sm font-bold text-white disabled:opacity-50">{saving && <LoaderCircle size={15} className="animate-spin" />}Emitir link seguro</button>
        {link && <div aria-live="polite" className="mt-5 border border-[#a9d8cf] bg-[var(--brand-soft)] p-3"><p className="text-xs font-bold text-[var(--brand)]">Link emitido — copie agora</p><p className="mt-2 break-all text-[11px] text-[var(--ink-muted)]">{link}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void copy()} className="inline-flex h-9 items-center gap-2 bg-[var(--brand)] px-3 text-xs font-bold text-white">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copiado" : "Copiar"}</button><a href={link} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 border border-[var(--line-strong)] px-3 text-xs font-bold"><ExternalLink size={14} />Abrir</a></div></div>}
      </form>
      <section className="border border-[var(--line)] bg-[var(--surface)]"><div className="border-b border-[var(--line)] px-5 py-4"><h2 className="font-bold">Histórico de acessos</h2><p className="mt-1 text-xs text-[var(--ink-muted)]">O token bruto nunca é armazenado e não pode ser recuperado depois.</p></div>{loading ? <div className="grid min-h-64 place-items-center"><LoaderCircle className="animate-spin text-[var(--brand)]" /></div> : <div className="divide-y divide-[var(--line)]">{accesses.length ? accesses.map((access) => { const expired = new Date(access.expires_at) <= new Date(); const active = !access.revoked_at && !expired; const order = access.work_order_id ? orderMap.get(access.work_order_id) : null; return <article key={access.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:flex-nowrap sm:gap-4 sm:px-5"><div className={`grid size-9 shrink-0 place-items-center ${active ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "bg-[var(--surface-muted)] text-[var(--ink-muted)]"}`}><KeyRound size={16} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{customerMap.get(access.customer_id)?.name ?? "Cliente"}{order ? ` • OS ${order.number}` : ""}</p><p className="mt-1 text-[11px] text-[var(--ink-muted)]">{active ? `Válido até ${formatDate(access.expires_at)}` : access.revoked_at ? "Revogado" : "Expirado"}{access.last_used_at ? ` • usado em ${formatDate(access.last_used_at)}` : " • ainda não utilizado"}</p></div>{active && <button type="button" onClick={() => void revoke(access.id)} className="ml-12 inline-flex h-9 items-center gap-2 border border-[var(--line)] px-3 text-xs font-bold text-[var(--danger)] sm:ml-0"><ShieldOff size={14} />Revogar</button>}</article>; }) : <p className="p-8 text-center text-xs text-[var(--ink-muted)]">Nenhum acesso emitido.</p>}</div>}</section>
    </section>
  </main>;
}
