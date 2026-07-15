"use client";

import {
  AlertTriangle, Banknote, CalendarDays, CarFront, CheckCircle2, ChevronDown, CircleDollarSign, Clock,
  History, LoaderCircle, Mail, MessageSquare, Package, Printer, RefreshCw, Search, Settings2, Smartphone,
  TrendingUp, Wrench, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  GROUP_META, IDLE_DAYS_THRESHOLD, STATUS_OPTIONS, type WorkOrderStatus,
  boardGroup, dateTime, fullDate, idleDays, isOpenStatus, isOverdue, money, statusLabel,
} from "@/lib/workshop";
import { ServiceProgress, ServiceTimeline, type TimelineEvent } from "@/components/service-progress";
import { DocumentPrint } from "@/components/document-print";
import { WhatsAppConnect } from "@/components/whatsapp-connect";

type Context = { organizationId: string; branchId: string; userId: string };
type BoardRow = {
  id: string; number: string; status: WorkOrderStatus; priority: string;
  customer_complaint: string; internal_notes: string | null; diagnosis: string | null;
  entry_at: string; due_at: string | null; completed_at: string | null; delivered_at: string | null;
  total: number; updated_at: string; technician_id: string | null; customer_id: string; vehicle_id: string;
  customers: { name: string; primary_phone: string | null; whatsapp: string | null } | null;
  vehicles: { license_plate: string; brand: string; model: string } | null;
};
type Metrics = {
  vehicles_in_shop: number; awaiting_parts: number; in_maintenance: number; finished_today: number;
  delivered_today: number; overdue: number; open_value: number; month_revenue: number;
};
type Settings = { whatsapp_enabled: boolean; sms_enabled: boolean; email_enabled: boolean };
type SentNotification = { id: string; channel: string; recipient: string; status: string; created_at: string };

type Period = "day" | "week" | "month" | "all";
type SortKey = "entry_desc" | "due_asc" | "customer_asc" | "status" | "technician";

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "day", label: "Hoje" }, { value: "week", label: "Semana" }, { value: "month", label: "Mês" }, { value: "all", label: "Tudo" },
];
const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: "entry_desc", label: "Data de entrada" }, { value: "due_asc", label: "Data prevista" },
  { value: "customer_asc", label: "Nome do cliente" }, { value: "status", label: "Status" }, { value: "technician", label: "Mecânico" },
];

function periodStart(period: Period): Date | null {
  const now = new Date();
  if (period === "day") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "week") { const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)); return monday; }
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}

export function WorkshopBoard() {
  const [context, setContext] = useState<Context | null>(null);
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [team, setTeam] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [sort, setSort] = useState<SortKey>("entry_desc");
  const [statusMenu, setStatusMenu] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  const [selected, setSelected] = useState<BoardRow | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [live, setLive] = useState(false);
  const contextCache = useRef<Context | null>(null);
  const reloadTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const supabase = createClient();
      let active = contextCache.current;
      if (!active) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Sua sessão expirou. Entre novamente.");
        const { data: profile, error: profileError } = await supabase.from("profiles").select("last_organization_id,last_branch_id").eq("id", user.id).single();
        if (profileError) throw profileError;
        if (!profile?.last_organization_id || !profile.last_branch_id) throw new Error("Selecione uma filial antes de usar o painel.");
        active = { organizationId: profile.last_organization_id, branchId: profile.last_branch_id, userId: user.id };
        contextCache.current = active; setContext(active);
        const { data: directory } = await supabase.rpc("get_team_directory", { p_organization_id: active.organizationId });
        setTeam(Object.fromEntries(((directory ?? []) as Array<{ user_id: string; full_name: string }>).map((member) => [member.user_id, member.full_name])));
      }
      const start = periodStart(period);
      let request = supabase.from("work_orders")
        .select("id,number,status,priority,customer_complaint,internal_notes,diagnosis,entry_at,due_at,completed_at,delivered_at,total,updated_at,technician_id,customer_id,vehicle_id,customers(name,primary_phone,whatsapp),vehicles(license_plate,brand,model)")
        .eq("organization_id", active.organizationId).eq("branch_id", active.branchId).is("deleted_at", null);
      if (start) request = request.gte("entry_at", start.toISOString());
      const [orders, board] = await Promise.all([
        request.order("entry_at", { ascending: false }).limit(500),
        supabase.from("workshop_board_metrics").select("*").eq("organization_id", active.organizationId).eq("branch_id", active.branchId).maybeSingle(),
      ]);
      if (orders.error) throw orders.error;
      setRows((orders.data ?? []) as unknown as BoardRow[]);
      setMetrics((board.data as Metrics | null) ?? { vehicles_in_shop: 0, awaiting_parts: 0, in_maintenance: 0, finished_today: 0, delivered_today: 0, overdue: 0, open_value: 0, month_revenue: 0 });
    } catch (caught) {
      setError(caught instanceof Error && caught.message === "Supabase não configurado." ? "Conecte o projeto Supabase e aplique as migrations para ativar o painel." : caught instanceof Error ? caught.message : "Não foi possível carregar o painel.");
    } finally { setLoading(false); }
  }, [period]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Tempo real: qualquer alteração nas ordens da filial atualiza o quadro sem recarregar.
  useEffect(() => {
    if (!context) return;
    let supabase: ReturnType<typeof createClient>;
    try { supabase = createClient(); } catch { return; }
    const channel = supabase
      .channel(`workshop-board-${context.branchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders", filter: `branch_id=eq.${context.branchId}` }, () => {
        if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
        reloadTimer.current = window.setTimeout(() => void load(), 350);
      })
      .subscribe((state) => setLive(state === "SUBSCRIBED"));
    return () => { if (reloadTimer.current) window.clearTimeout(reloadTimer.current); void supabase.removeChannel(channel); };
  }, [context, load]);

  const changeStatus = async (row: BoardRow, status: WorkOrderStatus) => {
    if (!context || row.status === status) { setStatusMenu(null); return; }
    setStatusMenu(null); setSavingStatus(row.id);
    const previous = rows;
    // Atualização otimista: a cor da linha muda na hora; o gatilho no banco registra data, hora e usuário.
    setRows((current) => current.map((item) => item.id === row.id ? { ...item, status, updated_at: new Date().toISOString() } : item));
    try {
      const supabase = createClient();
      const patch: Record<string, unknown> = { status, updated_by: context.userId };
      if (status === "ready" || status === "awaiting_payment") patch.completed_at = row.completed_at ?? new Date().toISOString();
      if (status === "delivered") patch.delivered_at = new Date().toISOString();
      const { error: statusError } = await supabase.from("work_orders").update(patch).eq("id", row.id);
      if (statusError) throw statusError;
      setSelected((current) => current && current.id === row.id ? { ...current, status } : current);
      // Dispara o worker de avisos em segundo plano: mensagens enfileiradas pelo
      // gatilho de status saem na hora, sem esperar o próximo ciclo agendado.
      void fetch("/api/notifications/process", { method: "POST" }).catch(() => undefined);
    } catch (caught) {
      setRows(previous);
      setError(caught instanceof Error ? caught.message : "Não foi possível alterar o status.");
    } finally { setSavingStatus(null); }
  };

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    let result = rows;
    if (term) {
      result = rows.filter((row) => [
        row.vehicles?.license_plate, row.customers?.name, row.customers?.primary_phone, row.customers?.whatsapp,
        row.vehicles ? `${row.vehicles.brand} ${row.vehicles.model}` : "", row.number,
      ].some((value) => (value ?? "").toLocaleLowerCase("pt-BR").includes(term)));
    }
    const technicianName = (row: BoardRow) => row.technician_id ? team[row.technician_id] ?? "" : "";
    const sorted = [...result];
    if (sort === "entry_desc") sorted.sort((a, b) => b.entry_at.localeCompare(a.entry_at));
    if (sort === "due_asc") sorted.sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"));
    if (sort === "customer_asc") sorted.sort((a, b) => (a.customers?.name ?? "").localeCompare(b.customers?.name ?? "", "pt-BR"));
    if (sort === "status") sorted.sort((a, b) => STATUS_OPTIONS.findIndex((option) => option.value === a.status) - STATUS_OPTIONS.findIndex((option) => option.value === b.status));
    if (sort === "technician") sorted.sort((a, b) => technicianName(a).localeCompare(technicianName(b), "pt-BR"));
    return sorted;
  }, [rows, query, sort, team]);

  const tiles = metrics ? [
    { icon: CarFront, label: "Na oficina", value: String(metrics.vehicles_in_shop), accent: "var(--row-blue-strong)" },
    { icon: Package, label: "Aguardando peças", value: String(metrics.awaiting_parts), accent: "var(--row-orange-strong)" },
    { icon: Wrench, label: "Em manutenção", value: String(metrics.in_maintenance), accent: "var(--row-purple-strong)" },
    { icon: CheckCircle2, label: "Finalizados hoje", value: String(metrics.finished_today), accent: "var(--row-green-strong)" },
    { icon: CarFront, label: "Entregues hoje", value: String(metrics.delivered_today), accent: "var(--row-dark-strong)" },
    { icon: AlertTriangle, label: "Atrasados", value: String(metrics.overdue), accent: "var(--row-red-strong)" },
    { icon: Banknote, label: "Valor em serviços", value: money(metrics.open_value), accent: "var(--brand)" },
    { icon: TrendingUp, label: "Faturamento do mês", value: money(metrics.month_revenue), accent: "var(--brand)" },
  ] : [];

  return (
    <main className="mx-auto max-w-[1680px] px-4 py-5 lg:px-7 lg:py-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[.14em] text-[var(--brand)]">Operação em tempo real</p>
          <h1 className="text-2xl font-bold tracking-[-.025em]">Agenda da oficina</h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">Todos os veículos organizados por data, status e prioridade — altere o andamento em um clique.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-2 border px-3 py-1.5 text-[11px] font-bold ${live ? "border-[var(--row-green-strong)] text-[var(--row-green-strong)]" : "border-[var(--line)] text-[var(--ink-muted)]"}`}>
            <span className={`size-2 rounded-full ${live ? "animate-pulse bg-[var(--row-green-strong)]" : "bg-[var(--line-strong)]"}`} />{live ? "Ao vivo" : "Atualização manual"}
          </span>
          <button onClick={() => setSettingsOpen(true)} className="inline-flex h-10 items-center gap-2 border border-[var(--line)] px-3 text-xs font-bold transition hover:border-[var(--brand)] hover:text-[var(--brand)]"><Settings2 size={15} />Notificações</button>
          <button onClick={() => { setLoading(true); void load(); }} className="inline-flex h-10 items-center gap-2 border border-[var(--line)] px-3 text-xs font-bold transition hover:border-[var(--brand)] hover:text-[var(--brand)]"><RefreshCw size={15} />Atualizar</button>
        </div>
      </div>

      {error && <div className="mb-4 flex items-start justify-between gap-4 border border-[#e9b3ad] bg-[#fff3f1] px-4 py-3 text-xs text-[var(--danger)]" role="alert"><span>{error}</span><button onClick={() => setError(null)} aria-label="Fechar mensagem"><X size={15} /></button></div>}

      <section aria-label="Indicadores da oficina" className="grid grid-cols-2 gap-px border border-[var(--line)] bg-[var(--line)] sm:grid-cols-4 xl:grid-cols-8">
        {tiles.map((tile) => { const Icon = tile.icon; return (
          <article key={tile.label} className="bg-[var(--surface)] p-3.5 transition hover:bg-[var(--surface-muted)]">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--ink-muted)]"><Icon size={14} style={{ color: tile.accent }} />{tile.label}</div>
            <p className="mt-2 truncate text-lg font-bold" style={{ color: tile.accent }}>{tile.value}</p>
          </article>
        ); })}
        {!metrics && Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-[74px] animate-pulse bg-[var(--surface)]" />)}
      </section>

      <section className="mt-5 border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] p-3 lg:flex-row lg:items-center">
          <div className="relative flex-1 lg:max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--brand)]" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full border border-[var(--line-strong)] bg-[var(--surface)] pl-9 pr-9 text-sm outline-none transition focus:border-[var(--brand)]" placeholder="Placa, cliente, telefone ou modelo" aria-label="Buscar veículo no painel" />
            {query && <button type="button" onClick={() => setQuery("")} className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center text-[var(--ink-muted)]" aria-label="Limpar busca"><X size={15} /></button>}
          </div>
          <div className="flex items-center gap-1 border border-[var(--line)] p-1" role="group" aria-label="Filtrar por período de entrada">
            <CalendarDays size={15} className="ml-1.5 shrink-0 text-[var(--ink-muted)]" />
            {PERIODS.map((option) => <button key={option.value} onClick={() => { setLoading(true); setPeriod(option.value); }} className={`h-8 px-3 text-xs font-bold transition ${period === option.value ? "bg-[var(--brand)] text-white" : "text-[var(--ink-muted)] hover:bg-[var(--surface-muted)]"}`} aria-pressed={period === option.value}>{option.label}</button>)}
          </div>
          <label className="flex items-center gap-2 text-xs font-bold text-[var(--ink-muted)]">Ordenar por
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="h-10 border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-xs font-semibold text-[var(--ink)] outline-none focus:border-[var(--brand)]">
              {SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <p className="text-xs text-[var(--ink-muted)] lg:ml-auto">{filtered.length} veículo{filtered.length === 1 ? "" : "s"}</p>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-b border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2" aria-hidden="true">
          {(["scheduled", "diagnosis", "parts", "maintenance", "finished", "delivered", "overdue", "cancelled"] as const).map((group) => (
            <span key={group} className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[var(--ink-muted)]"><span className="size-2.5 rounded-full" style={{ background: GROUP_META[group].accent }} />{GROUP_META[group].label}</span>
          ))}
        </div>

        {loading ? <div className="grid min-h-80 place-items-center"><LoaderCircle className="animate-spin text-[var(--brand)]" /></div> : !filtered.length ? (
          <div className="grid min-h-80 place-items-center px-5 py-10 text-center"><div><div className="mx-auto grid size-10 place-items-center rounded-full bg-[var(--surface-muted)] text-[var(--ink-muted)]"><CarFront size={18} /></div><h3 className="mt-3 text-sm font-bold">Nenhum veículo neste período</h3><p className="mt-1 text-xs text-[var(--ink-muted)]">Ajuste o filtro de datas ou a busca para ver outros atendimentos.</p></div></div>
        ) : (
          <>
            {/* Planilha (desktop) */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1180px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--line)] bg-[var(--surface-muted)]">
                    {["", "Placa", "Cliente", "Modelo", "Telefone", "Entrada", "Previsão", "Mecânico", "Serviço", "Status", "Observações"].map((label, index) => (
                      <th key={index} scope="col" className="whitespace-nowrap px-3 py-2.5 text-[10px] font-bold uppercase tracking-[.08em] text-[var(--ink-muted)]">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const group = boardGroup(row.status, row.due_at);
                    return (
                      <tr key={row.id} className="cursor-pointer border-b border-black/[.06] text-xs transition-colors hover:brightness-[.97] dark:border-white/[.06] dark:hover:brightness-125" style={{ background: GROUP_META[group].row }} onClick={() => setSelected(row)}>
                        <td className="w-14 px-3 py-2.5"><div className="flex items-center gap-1"><span className="grid size-7 shrink-0 place-items-center rounded-full text-white" style={{ background: GROUP_META[group].accent }}><CarFront size={14} /></span><RowIndicators row={row} /></div></td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-bold tracking-wide">{row.vehicles?.license_plate ?? "—"}</td>
                        <td className="max-w-44 truncate px-3 py-2.5 font-semibold">{row.customers?.name ?? "—"}</td>
                        <td className="max-w-40 truncate px-3 py-2.5">{row.vehicles ? `${row.vehicles.brand} ${row.vehicles.model}` : "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">{row.customers?.whatsapp ?? row.customers?.primary_phone ?? "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">{dateTime(row.entry_at)}</td>
                        <td className={`whitespace-nowrap px-3 py-2.5 ${isOverdue(row.status, row.due_at) ? "font-bold text-[var(--row-red-strong)]" : ""}`}>{row.due_at ? dateTime(row.due_at) : "A definir"}</td>
                        <td className="max-w-36 truncate px-3 py-2.5">{row.technician_id ? team[row.technician_id] ?? "Equipe" : "—"}</td>
                        <td className="max-w-56 truncate px-3 py-2.5">{row.customer_complaint}</td>
                        <td className="relative whitespace-nowrap px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                          <StatusCell row={row} open={statusMenu === row.id} saving={savingStatus === row.id} onToggle={() => setStatusMenu((current) => current === row.id ? null : row.id)} onSelect={(status) => void changeStatus(row, status)} />
                        </td>
                        <td className="max-w-52 truncate px-3 py-2.5 text-[var(--ink-muted)]">{row.internal_notes ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Cartões (mobile) */}
            <div className="divide-y divide-[var(--line)] lg:hidden">
              {filtered.map((row) => {
                const group = boardGroup(row.status, row.due_at);
                return (
                  <article key={row.id} className="p-4" style={{ background: GROUP_META[group].row }}>
                    <button onClick={() => setSelected(row)} className="flex w-full items-start gap-3 text-left">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full text-white" style={{ background: GROUP_META[group].accent }}><CarFront size={16} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2"><span className="text-sm font-bold tracking-wide">{row.vehicles?.license_plate ?? "—"}</span><RowIndicators row={row} /></span>
                        <span className="mt-0.5 block truncate text-xs">{row.customers?.name ?? "—"} • {row.vehicles ? `${row.vehicles.brand} ${row.vehicles.model}` : "—"}</span>
                        <span className="mt-1 block text-[11px] text-[var(--ink-muted)]">Entrada {shortDateTime(row.entry_at)} • Previsão {row.due_at ? shortDateTime(row.due_at) : "a definir"}</span>
                      </span>
                    </button>
                    <div className="relative mt-3">
                      <StatusCell row={row} open={statusMenu === row.id} saving={savingStatus === row.id} onToggle={() => setStatusMenu((current) => current === row.id ? null : row.id)} onSelect={(status) => void changeStatus(row, status)} />
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      {selected && context && <OrderDrawer row={selected} team={team} context={context} onClose={() => setSelected(null)} onStatus={(status) => void changeStatus(selected, status)} />}
      {settingsOpen && context && <NotificationSettingsDialog context={context} onClose={() => setSettingsOpen(false)} />}
      {statusMenu && <button className="fixed inset-0 z-20 cursor-default" aria-label="Fechar menu de status" onClick={() => setStatusMenu(null)} tabIndex={-1} />}
    </main>
  );
}

const shortDateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

// Indicadores rápidos ao lado do ícone do carro.
function RowIndicators({ row }: { row: BoardRow }) {
  const items: Array<{ icon: typeof Clock; label: string; color: string }> = [];
  if (isOverdue(row.status, row.due_at)) items.push({ icon: AlertTriangle, label: "Atrasado", color: "var(--row-red-strong)" });
  if (isOpenStatus(row.status) && idleDays(row.updated_at) >= IDLE_DAYS_THRESHOLD) items.push({ icon: Clock, label: `Parado há ${idleDays(row.updated_at)} dias`, color: "var(--row-yellow-strong)" });
  if (row.status === "awaiting_parts") items.push({ icon: Package, label: "Esperando peça", color: "var(--row-orange-strong)" });
  if (row.status === "awaiting_approval" || row.status === "awaiting_estimate") items.push({ icon: CircleDollarSign, label: "Aguardando aprovação", color: "var(--row-yellow-strong)" });
  if (["in_progress", "testing", "washing", "outsourced"].includes(row.status)) items.push({ icon: Wrench, label: "Serviço em andamento", color: "var(--row-purple-strong)" });
  if (row.status === "awaiting_payment" || row.status === "delivered") items.push({ icon: CheckCircle2, label: "Finalizado", color: "var(--row-green-strong)" });
  if (row.status === "ready") items.push({ icon: CarFront, label: "Pronto para retirada", color: "var(--row-green-strong)" });
  return <span className="inline-flex items-center gap-1">{items.slice(0, 3).map((item) => { const Icon = item.icon; return <Icon key={item.label} size={13} style={{ color: item.color }} aria-label={item.label} role="img" />; })}</span>;
}

// Célula de status com menu de alteração rápida (sem recarregar a página).
function StatusCell({ row, open, saving, onToggle, onSelect }: { row: BoardRow; open: boolean; saving: boolean; onToggle: () => void; onSelect: (status: WorkOrderStatus) => void }) {
  const group = boardGroup(row.status, row.due_at);
  return (
    <>
      <button onClick={onToggle} disabled={saving} className="inline-flex h-8 w-full min-w-44 items-center justify-between gap-2 border px-2.5 text-[11px] font-bold text-white transition hover:opacity-90 disabled:opacity-60 lg:w-auto" style={{ background: GROUP_META[group].accent, borderColor: GROUP_META[group].accent }} aria-haspopup="listbox" aria-expanded={open} aria-label={`Status atual: ${statusLabel(row.status)}. Clique para alterar.`}>
        <span className="truncate">{statusLabel(row.status)}</span>
        {saving ? <LoaderCircle size={13} className="shrink-0 animate-spin" /> : <ChevronDown size={13} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-30 max-h-72 w-56 overflow-y-auto border border-[var(--line-strong)] bg-[var(--surface)] py-1 shadow-2xl" role="listbox" aria-label="Escolher novo status">
          {STATUS_OPTIONS.map((option) => (
            <button key={option.value} role="option" aria-selected={option.value === row.status} onClick={() => onSelect(option.value)} className={`flex h-9 w-full items-center gap-2.5 px-3 text-left text-xs transition hover:bg-[var(--surface-muted)] ${option.value === row.status ? "font-bold" : ""}`}>
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: GROUP_META[boardGroup(option.value, null)].accent }} />{option.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// Painel lateral com detalhes, progresso, timeline permanente e avisos enviados.
function OrderDrawer({ row, team, context, onClose, onStatus }: { row: BoardRow; team: Record<string, string>; context: Context; onClose: () => void; onStatus: (status: WorkOrderStatus) => void }) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [sent, setSent] = useState<SentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const group = boardGroup(row.status, row.due_at);

  const loadDetails = useCallback(async () => {
    try {
      const supabase = createClient();
      const [eventsResult, sentResult] = await Promise.all([
        supabase.from("work_order_events").select("id,event_type,description,created_at,created_by").eq("work_order_id", row.id).order("created_at", { ascending: true }).limit(200),
        supabase.from("customer_notifications").select("id,channel,recipient,status,created_at").eq("work_order_id", row.id).order("created_at", { ascending: false }).limit(20),
      ]);
      if (eventsResult.error) throw eventsResult.error;
      setEvents((eventsResult.data ?? []).map((event) => ({ id: event.id, type: event.event_type, description: event.description, created_at: event.created_at, author: event.created_by ? team[event.created_by] ?? null : null })));
      setSent((sentResult.data ?? []) as SentNotification[]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível carregar o histórico."); }
    finally { setLoading(false); }
  }, [row.id, team]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDetails(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDetails, row.status]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const addNote = async () => {
    const body = note.trim();
    if (!body) return;
    setSavingNote(true); setError(null);
    try {
      const supabase = createClient();
      const { error: noteError } = await supabase.from("work_order_events").insert({ organization_id: context.organizationId, work_order_id: row.id, event_type: "note", description: body, visible_to_customer: false, created_by: context.userId });
      if (noteError) throw noteError;
      setNote(""); await loadDetails();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível registrar a observação."); }
    finally { setSavingNote(false); }
  };

  const channelIcon = (channel: string) => channel === "email" ? Mail : channel === "sms" ? Smartphone : MessageSquare;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 sm:p-6" role="dialog" aria-modal="true" aria-label={`Detalhes da OS ${row.number}`} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="ml-auto flex h-full w-full max-w-xl flex-col bg-[var(--surface)] shadow-2xl">
        <header className="border-b border-[var(--line)] px-5 py-4" style={{ background: GROUP_META[group].row }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full text-white" style={{ background: GROUP_META[group].accent }}><CarFront size={18} /></span>
              <div>
                <p className="text-base font-bold tracking-wide">{row.vehicles?.license_plate ?? "—"} <span className="font-normal text-[var(--ink-muted)]">• OS {row.number}</span></p>
                <p className="text-xs text-[var(--ink-muted)]">{row.vehicles ? `${row.vehicles.brand} ${row.vehicles.model}` : "—"} • {row.customers?.name ?? "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPrintOpen(true)} className="p-2 text-[var(--ink-muted)] transition hover:text-[var(--brand)]" aria-label="Imprimir ou salvar PDF da OS" title="Imprimir ou salvar PDF"><Printer size={17} /></button>
              <button onClick={onClose} className="p-2" aria-label="Fechar detalhes"><X size={18} /></button>
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <ServiceProgress status={row.status} />
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-[var(--line)] py-4 text-xs sm:grid-cols-3">
            <div><dt className="font-bold text-[var(--ink-muted)]">Entrada</dt><dd className="mt-0.5">{dateTime(row.entry_at)}</dd></div>
            <div><dt className="font-bold text-[var(--ink-muted)]">Previsão</dt><dd className={`mt-0.5 ${isOverdue(row.status, row.due_at) ? "font-bold text-[var(--row-red-strong)]" : ""}`}>{row.due_at ? dateTime(row.due_at) : "A definir"}</dd></div>
            <div><dt className="font-bold text-[var(--ink-muted)]">Mecânico</dt><dd className="mt-0.5">{row.technician_id ? team[row.technician_id] ?? "Equipe" : "Não atribuído"}</dd></div>
            <div><dt className="font-bold text-[var(--ink-muted)]">Telefone</dt><dd className="mt-0.5">{row.customers?.whatsapp ?? row.customers?.primary_phone ?? "—"}</dd></div>
            <div><dt className="font-bold text-[var(--ink-muted)]">Valor</dt><dd className="mt-0.5 font-bold">{money(row.total)}</dd></div>
            <div><dt className="font-bold text-[var(--ink-muted)]">Entregue em</dt><dd className="mt-0.5">{row.delivered_at ? fullDate(row.delivered_at) : "—"}</dd></div>
          </dl>
          <div className="mt-4">
            <p className="text-xs font-bold text-[var(--ink-muted)]">Serviço solicitado</p>
            <p className="mt-1 text-sm">{row.customer_complaint}</p>
            {row.diagnosis && <><p className="mt-3 text-xs font-bold text-[var(--ink-muted)]">Diagnóstico</p><p className="mt-1 text-sm">{row.diagnosis}</p></>}
            {row.internal_notes && <><p className="mt-3 text-xs font-bold text-[var(--ink-muted)]">Observações</p><p className="mt-1 text-sm">{row.internal_notes}</p></>}
          </div>
          <label className="mt-5 block text-xs font-bold">Alterar status
            <select value={row.status} onChange={(event) => onStatus(event.target.value as WorkOrderStatus)} className="mt-2 h-10 w-full border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm font-normal outline-none focus:border-[var(--brand)]">
              {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          <div className="mt-6 flex items-center gap-2"><History size={15} className="text-[var(--brand)]" /><h2 className="text-sm font-bold">Linha do tempo</h2></div>
          {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}
          {loading ? <div className="grid h-32 place-items-center"><LoaderCircle className="animate-spin text-[var(--brand)]" /></div> : <div className="mt-3"><ServiceTimeline events={events} /></div>}
          <div className="mt-3 flex gap-2">
            <input value={note} onChange={(event) => setNote(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void addNote()} className="h-10 min-w-0 flex-1 border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-xs outline-none focus:border-[var(--brand)]" placeholder="Registrar observação interna na timeline" aria-label="Nova observação" />
            <button disabled={savingNote || !note.trim()} onClick={() => void addNote()} className="inline-flex h-10 items-center gap-2 bg-[var(--brand)] px-4 text-xs font-bold text-white disabled:opacity-50">{savingNote ? <LoaderCircle size={14} className="animate-spin" /> : "Registrar"}</button>
          </div>

          {sent.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-bold">Avisos ao cliente</h2>
              <ul className="mt-2 divide-y divide-[var(--line)] border border-[var(--line)]">
                {sent.map((item) => { const Icon = channelIcon(item.channel); return (
                  <li key={item.id} className="flex items-center gap-3 px-3 py-2.5 text-xs">
                    <Icon size={15} className="shrink-0 text-[var(--brand)]" />
                    <span className="min-w-0 flex-1"><span className="font-semibold uppercase">{item.channel}</span> para {item.recipient}<span className="block text-[10px] text-[var(--ink-muted)]">{dateTime(item.created_at)}</span></span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.status === "sent" ? "bg-[var(--row-green)] text-[var(--row-green-strong)]" : item.status === "failed" ? "bg-[var(--row-red)] text-[var(--row-red-strong)]" : "bg-[var(--row-yellow)] text-[var(--row-yellow-strong)]"}`}>{item.status === "pending" ? "Na fila" : item.status === "sent" ? "Enviado" : item.status === "failed" ? "Falhou" : "Cancelado"}</span>
                  </li>
                ); })}
              </ul>
            </div>
          )}
        </div>
      </aside>
      {printOpen && <DocumentPrint kind="work_order" id={row.id} onClose={() => setPrintOpen(false)} />}
    </div>
  );
}

// Escolha dos canais de aviso automático (WhatsApp, SMS e e-mail) por filial.
function NotificationSettingsDialog({ context, onClose }: { context: Context; onClose: () => void }) {
  const [settings, setSettings] = useState<Settings>({ whatsapp_enabled: false, sms_enabled: false, email_enabled: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const { data, error: loadError } = await createClient().from("notification_settings").select("whatsapp_enabled,sms_enabled,email_enabled").eq("organization_id", context.organizationId).eq("branch_id", context.branchId).maybeSingle();
        if (loadError) throw loadError;
        if (data) setSettings(data as Settings);
      } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível carregar as preferências."); }
      finally { setLoading(false); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [context]);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const { error: saveError } = await createClient().from("notification_settings").upsert({ organization_id: context.organizationId, branch_id: context.branchId, ...settings, updated_by: context.userId }, { onConflict: "organization_id,branch_id" });
      if (saveError) throw saveError;
      onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível salvar. Verifique se você tem permissão de administrador."); }
    finally { setSaving(false); }
  };

  const channels = [
    { key: "whatsapp_enabled" as const, icon: MessageSquare, label: "WhatsApp", helper: "Mensagem no número de WhatsApp do cliente" },
    { key: "sms_enabled" as const, icon: Smartphone, label: "SMS", helper: "Estrutura preparada — envio via integração" },
    { key: "email_enabled" as const, icon: Mail, label: "E-mail", helper: "Aviso no e-mail principal do cliente" },
  ];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Notificações automáticas" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div className="w-full max-w-md border border-[var(--line)] bg-[var(--surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <div><p className="text-base font-bold">Notificações automáticas</p><p className="mt-0.5 text-xs text-[var(--ink-muted)]">Avise o cliente sempre que o status do veículo mudar.</p></div>
          <button onClick={onClose} className="p-2" aria-label="Fechar"><X size={18} /></button>
        </div>
        {loading ? <div className="grid h-40 place-items-center"><LoaderCircle className="animate-spin text-[var(--brand)]" /></div> : (
          <div className="p-5">
            {error && <p className="mb-3 text-xs text-[var(--danger)]">{error}</p>}
            <div className="space-y-2">
              {channels.map((channel) => { const Icon = channel.icon; return (
                <label key={channel.key} className="flex cursor-pointer items-center gap-3 border border-[var(--line)] px-4 py-3 transition hover:border-[var(--brand)]">
                  <Icon size={17} className="shrink-0 text-[var(--brand)]" />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{channel.label}</span><span className="block text-[11px] text-[var(--ink-muted)]">{channel.helper}</span></span>
                  <input type="checkbox" checked={settings[channel.key]} onChange={(event) => setSettings((current) => ({ ...current, [channel.key]: event.target.checked }))} className="size-4 accent-[var(--brand)]" />
                </label>
              ); })}
            </div>
            <WhatsAppConnect />
            <p className="mt-3 text-[11px] text-[var(--ink-muted)]">Os avisos entram em uma fila de envio auditável. Somente administradores alteram estas preferências.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button disabled={saving} onClick={onClose} className="h-10 border border-[var(--line)] px-4 text-sm font-semibold">Cancelar</button>
              <button disabled={saving} onClick={() => void save()} className="inline-flex h-10 items-center gap-2 bg-[var(--brand)] px-4 text-sm font-bold text-white disabled:opacity-60">{saving && <LoaderCircle size={15} className="animate-spin" />}Salvar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
