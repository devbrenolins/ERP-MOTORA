"use client";

import { Archive, Check, ChevronDown, ChevronLeft, ChevronRight, Edit3, FileOutput, LoaderCircle, Plus, Printer, RefreshCw, Search, UserPlus, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FieldConfig, ModuleConfig } from "@/lib/phase-two-modules";
import { SmartRelationPicker } from "@/components/smart-relation-picker";
import { ItemsEditor } from "@/components/items-editor";
import { DocumentPrint } from "@/components/document-print";

type Row = Record<string, unknown>;
type Context = { organizationId: string; branchId: string; userId: string };
type RelationLabels = Record<string, Record<string, string>>;
type QuickCreateConfig = { context: Context; table: "customers" | "vehicles" | "suppliers" | "warehouses"; form: Record<string, string>; relations: RelationLabels };
const PAGE_SIZE = 25;

export function OperationalModule({ config }: { config: ModuleConfig }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [context, setContext] = useState<Context | null>(null);
  const [relations, setRelations] = useState<RelationLabels>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningAction, setRunningAction] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string>>(initialForm(config));
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [printing, setPrinting] = useState<Row | null>(null);
  const [converting, setConverting] = useState(false);
  const contextCache = useRef<Context | null>(null);
  const relationsCache = useRef<RelationLabels | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const supabase = createClient();
      let active = contextCache.current;
      if (!active) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Sua sessão expirou. Entre novamente.");
        const { data: profile, error: profileError } = await supabase.from("profiles").select("last_organization_id,last_branch_id").eq("id", user.id).single();
        if (profileError) throw profileError;
        if (!profile?.last_organization_id || !profile.last_branch_id) throw new Error("Selecione uma filial antes de usar este módulo.");
        active = { organizationId: profile.last_organization_id, branchId: profile.last_branch_id, userId: user.id };
        contextCache.current = active; setContext(active);
      }
      const relationFields = config.fields.filter((field) => field.relation);
      let labelMaps = relationsCache.current;
      if (!labelMaps) {
        labelMaps = {};
        const sources = new Map<string, NonNullable<FieldConfig["relation"]>>();
        for (const field of relationFields) { const relation = field.relation!; sources.set(`${relation.table}:${relation.labelFields.join(",")}`, relation); }
        const sourceMaps: Record<string, Record<string, string>> = {};
        await Promise.all([...sources.entries()].map(async ([key, relation]) => {
          const { data: options, error: relationError } = await supabase.from(relation.table).select(["id", ...relation.labelFields].join(",")).eq("organization_id", active.organizationId).is("deleted_at", null).limit(500);
          if (relationError) throw relationError;
          sourceMaps[key] = Object.fromEntries(((options ?? []) as unknown as Row[]).map((option) => [String(option.id), relation.labelFields.map((fieldName) => option[fieldName]).filter(Boolean).join(" • ")]));
        }));
        for (const field of relationFields) { const relation = field.relation!; labelMaps[field.name] = sourceMaps[`${relation.table}:${relation.labelFields.join(",")}`] ?? {}; }
        relationsCache.current = labelMaps; setRelations(labelMaps);
      }

      let request = supabase.from(config.table).select("*", { count: "exact" }).eq("organization_id", active.organizationId).is("deleted_at", null);
      for (const [key, value] of Object.entries(config.fixedFilters ?? {})) request = request.eq(key, value);
      const term = debouncedQuery.trim().replace(/[%_,()]/g, "");
      if (term.length >= 2) {
        const clauses = config.fields
          .filter((field) => ["text", "textarea", "select"].includes(field.type))
          .map((field) => `${field.name}.ilike.%${term}%`);
        for (const field of relationFields) {
          const matchingIds = Object.entries(labelMaps[field.name] ?? {})
            .filter(([, label]) => label.toLocaleLowerCase("pt-BR").includes(term.toLocaleLowerCase("pt-BR")))
            .map(([id]) => id);
          if (matchingIds.length) clauses.push(`${field.name}.in.(${matchingIds.join(",")})`);
        }
        if (clauses.length) request = request.or(clauses.join(","));
      }
      const { data, error: rowsError, count } = await request.order("created_at", { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (rowsError) throw rowsError;
      setRows((data ?? []) as Row[]); setTotal(count ?? 0);
    } catch (caught) {
      setRows([]); setTotal(0);
      setError(caught instanceof Error && caught.message === "Supabase não configurado." ? "Conecte o projeto Supabase e aplique as migrations para ativar este módulo." : caught instanceof Error ? caught.message : "Não foi possível carregar os dados.");
    } finally { setLoading(false); }
  }, [config, debouncedQuery, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(0); setDebouncedQuery(query); }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => { relationsCache.current = relations; }, [relations]);

  const openNew = () => { setEditing(null); setForm(initialForm(config)); setDialogOpen(true); };
  const openEdit = (row: Row) => {
    setEditing(row);
    setForm(Object.fromEntries(config.fields.map((field) => [field.name, inputValue(row[field.name], field)])));
    setDialogOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!context) return;
    setSaving(true); setError(null);
    try {
      const supabase = createClient();
      // Os defaults (ex.: number vazio para o gatilho numerar) valem apenas na criação;
      // aplicá-los na edição sobrescreveria o número e o status já persistidos.
      const values: Record<string, unknown> = editing ? {} : { ...(config.defaults ?? {}) };
      for (const field of config.fields) {
        const rawValue = form[field.name] ?? "";
        if (field.required && rawValue === "") throw new Error(`Preencha o campo ${field.label.toLocaleLowerCase("pt-BR")}.`);
        values[field.name] = serializeValue(rawValue, field);
      }
      if (typeof values.tax_id === "string") values.tax_id = values.tax_id.replace(/\D/g, "") || null;
      if (typeof values.license_plate === "string") values.license_plate = values.license_plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (editing) {
        const { error: saveError } = await supabase.from(config.table).update({ ...values, updated_by: context.userId }).eq("id", String(editing.id));
        if (saveError) throw saveError;
      } else {
        const scope = { organization_id: context.organizationId, ...(config.branchColumn ? { [config.branchColumn]: context.branchId } : {}), updated_by: context.userId };
        const { error: saveError } = await supabase.from(config.table).insert({ ...values, ...scope, created_by: context.userId });
        if (saveError) throw saveError;
      }
      setDialogOpen(false); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível salvar o registro."); }
    finally { setSaving(false); }
  };

  const archive = async (row: Row) => {
    if (!context || !window.confirm(`Arquivar este ${config.singular}? O histórico será preservado.`)) return;
    try {
      const supabase = createClient();
      const { error: archiveError } = await supabase.from(config.table).update({ deleted_at: new Date().toISOString(), updated_by: context.userId }).eq("id", String(row.id));
      if (archiveError) throw archiveError;
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível arquivar."); }
  };

  const updateStatus = async (row: Row, status: string) => {
    if (!context) return;
    try {
      const supabase = createClient();
      const { error: statusError } = await supabase.from(config.table).update({ status, updated_by: context.userId }).eq("id", String(row.id));
      if (statusError) throw statusError;
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível alterar o status."); }
  };

  // Transforma um orçamento em ordem de serviço usando a rotina segura do banco.
  // Itens ainda pendentes são aprovados junto com o orçamento antes da conversão.
  const convertToOrder = async (row: Row) => {
    if (!context || converting) return;
    if (!window.confirm(`Gerar uma ordem de serviço a partir do orçamento ${String(row.number ?? "")}? Os itens pendentes serão marcados como aprovados.`)) return;
    setConverting(true); setError(null); setNotice(null);
    try {
      const supabase = createClient();
      const estimateId = String(row.id);
      const { error: itemsError } = await supabase.from("estimate_items").update({ approval_status: "approved" }).eq("estimate_id", estimateId).eq("approval_status", "pending");
      if (itemsError) throw itemsError;
      if (!["approved", "partially_approved"].includes(String(row.status))) {
        const { error: approveError } = await supabase.from("estimates").update({ status: "approved", approved_at: new Date().toISOString(), updated_by: context.userId }).eq("id", estimateId);
        if (approveError) throw approveError;
      }
      const { data: orderId, error: convertError } = await supabase.rpc("convert_estimate_to_work_order", { p_estimate_id: estimateId });
      if (convertError) throw convertError;
      const { data: order } = await supabase.from("work_orders").select("number").eq("id", String(orderId)).single();
      setNotice(`Ordem de serviço ${order?.number ?? "criada"} gerada a partir do orçamento ${String(row.number ?? "")}. Acompanhe em Ordens de serviço ou no Painel da oficina.`);
      await load();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Não foi possível gerar a ordem de serviço.";
      setError(message.includes("estimate_not_approved") ? "O orçamento precisa estar aprovado para virar OS." : message);
    } finally { setConverting(false); }
  };

  const runModuleAction = async () => {
    if (!context || !config.action || (config.action.confirm && !window.confirm(config.action.confirm))) return;
    setRunningAction(true); setError(null); setNotice(null);
    try {
      const supabase = createClient();
      const { data, error: actionError } = await supabase.rpc(config.action.rpc, { p_branch_id: context.branchId });
      if (actionError) throw actionError;
      setNotice(typeof data === "number" ? `${data} tarefa${data === 1 ? "" : "s"} adicionada${data === 1 ? "" : "s"} à fila.` : "Operação concluída com sucesso.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível executar a ação."); }
    finally { setRunningAction(false); }
  };

  return (
    <main className="mx-auto max-w-[1520px] px-4 py-5 lg:px-7 lg:py-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="mb-1 text-[11px] font-bold uppercase tracking-[.14em] text-[var(--brand)]">{moduleArea(config)}</p><h1 className="text-2xl font-bold tracking-[-.025em]">{config.title}</h1><p className="mt-1 max-w-3xl text-sm text-[var(--ink-muted)]">{config.subtitle}</p></div>
        <div className="flex flex-wrap gap-2">{config.action && <button disabled={runningAction} onClick={() => void runModuleAction()} className="inline-flex h-10 items-center justify-center gap-2 border border-[var(--brand)] px-4 text-sm font-bold text-[var(--brand)] disabled:opacity-50"><RefreshCw size={16} className={runningAction ? "animate-spin" : ""} />{config.action.label}</button>}<button onClick={openNew} className="inline-flex h-10 items-center justify-center gap-2 bg-[var(--brand)] px-4 text-sm font-bold text-white hover:bg-[var(--brand-strong)]"><Plus size={17} />Novo {config.singular}</button></div>
      </div>

      {error && <div className="mb-4 flex items-start justify-between gap-4 border border-[#e9b3ad] bg-[#fff3f1] px-4 py-3 text-xs text-[var(--danger)]" role="alert"><span>{error}</span><button onClick={() => setError(null)} aria-label="Fechar mensagem"><X size={15} /></button></div>}
      {notice && <div className="mb-4 flex items-start justify-between gap-4 border border-[#a9d8cf] bg-[var(--brand-soft)] px-4 py-3 text-xs text-[var(--brand)]" role="status"><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Fechar mensagem"><X size={15} /></button></div>}

      <section className="border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-md"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--brand)]" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full border border-[var(--line-strong)] bg-[var(--surface)] pl-9 pr-9 text-sm outline-none focus:border-[var(--brand)]" placeholder={`Buscar ${config.singular}, cliente, código ou status`} aria-label={`Buscar em ${config.title}`} />{query && <button type="button" onClick={() => setQuery("")} className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center text-[var(--ink-muted)]" aria-label="Limpar busca"><X size={15} /></button>}</div>
          <button onClick={() => void load()} className="inline-flex h-9 items-center justify-center gap-2 border border-[var(--line)] px-3 text-xs font-semibold"><RefreshCw size={14} />Atualizar</button>
          <p className="text-xs text-[var(--ink-muted)] sm:ml-auto">{total} registro{total === 1 ? "" : "s"}</p>
        </div>
        {loading ? <div className="grid min-h-72 place-items-center"><LoaderCircle className="animate-spin text-[var(--brand)]" /></div> : config.view === "kanban" ? <Kanban config={config} rows={rows} relations={relations} onEdit={openEdit} onStatus={updateStatus} onPrint={config.print ? setPrinting : undefined} /> : <DataTable config={config} rows={rows} relations={relations} onEdit={openEdit} onArchive={archive} onPrint={config.print ? setPrinting : undefined} onConvert={config.convertToWorkOrder ? (row) => void convertToOrder(row) : undefined} converting={converting} />}
        <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-3 text-xs text-[var(--ink-muted)]"><span>Página {page + 1} de {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span><div className="flex gap-1"><button disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="grid size-8 place-items-center border border-[var(--line)] disabled:opacity-40" aria-label="Página anterior"><ChevronLeft size={15} /></button><button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((value) => value + 1)} className="grid size-8 place-items-center border border-[var(--line)] disabled:opacity-40" aria-label="Próxima página"><ChevronRight size={15} /></button></div></div>
      </section>

      {dialogOpen && <div className="fixed inset-0 z-50 bg-black/50 sm:p-6" role="dialog" aria-modal="true" aria-label={`${editing ? "Editar" : "Novo"} ${config.singular}`} onMouseDown={(event) => event.target === event.currentTarget && !saving && setDialogOpen(false)}>
        <form onSubmit={submit} className="ml-auto flex h-full w-full max-w-2xl flex-col bg-[var(--surface)] shadow-2xl sm:rounded-sm">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><p className="text-base font-bold">{editing ? "Editar" : "Novo"} {config.singular}</p><p className="mt-0.5 text-xs text-[var(--ink-muted)]">Campos obrigatórios estão identificados.</p></div><button type="button" disabled={saving} onClick={() => setDialogOpen(false)} className="p-2" aria-label="Fechar formulário"><X size={18} /></button></div>
          <div className="grid flex-1 auto-rows-min grid-cols-1 gap-5 overflow-y-auto p-4 sm:grid-cols-2 sm:p-5">{config.fields.map((field) => { const relationTable = field.relation?.table; const quickCreate = context && relationTable && ["customers", "vehicles", "suppliers", "warehouses"].includes(relationTable) ? { context, table: relationTable as QuickCreateConfig["table"], form, relations } : null; return <Field key={field.name} field={field} value={form[field.name] ?? ""} options={relations[field.name] ?? {}} onChange={(value) => setForm((current) => ({ ...current, [field.name]: value }))} quickCreate={quickCreate} onOptionCreated={(id, label) => { setRelations((current) => ({ ...current, [field.name]: { ...(current[field.name] ?? {}), [id]: label } })); setForm((current) => ({ ...current, [field.name]: id })); }} />; })}
          {config.items && context && (editing ? <ItemsEditor config={config.items} recordId={String(editing.id)} organizationId={context.organizationId} onChanged={() => void load()} /> : <p className="border border-dashed border-[var(--line-strong)] p-4 text-center text-xs font-normal text-[var(--ink-muted)] sm:col-span-2">Salve este {config.singular} para lançar os serviços, as peças e os valores.</p>)}</div>
          <div className="grid grid-cols-2 gap-2 border-t border-[var(--line)] p-4 sm:flex sm:justify-end"><button type="button" disabled={saving} onClick={() => setDialogOpen(false)} className="h-11 border border-[var(--line)] px-4 text-sm font-semibold sm:h-10">Cancelar</button><button type="submit" disabled={saving} className="inline-flex h-11 min-w-28 items-center justify-center gap-2 bg-[var(--brand)] px-4 text-sm font-bold text-white disabled:opacity-60 sm:h-10">{saving && <LoaderCircle size={16} className="animate-spin" />}Salvar</button></div>
        </form>
      </div>}

      {printing && config.print && <DocumentPrint kind={config.print} id={String(printing.id)} onClose={() => setPrinting(null)} />}
    </main>
  );
}

function DataTable({ config, rows, relations, onEdit, onArchive, onPrint, onConvert, converting }: { config: ModuleConfig; rows: Row[]; relations: RelationLabels; onEdit: (row: Row) => void; onArchive: (row: Row) => void; onPrint?: (row: Row) => void; onConvert?: (row: Row) => void; converting?: boolean }) {
  if (!rows.length) return <EmptyState singular={config.singular} />;
  const convertible = (row: Row) => !["converted", "cancelled", "rejected", "expired"].includes(String(row.status));
  return <><div className="divide-y divide-[var(--line)] md:hidden">{rows.map((row) => <article key={String(row.id)} className="p-4"><div className="grid gap-3">{config.columns.map((column, index) => <div key={column.key} className={index === 0 ? "" : "grid grid-cols-[110px_1fr] gap-3"}><span className={`${index === 0 ? "mb-1 block" : ""} text-[10px] font-bold uppercase tracking-[.06em] text-[var(--ink-muted)]`}>{column.label}</span><div className={`${index === 0 ? "text-sm font-bold" : "min-w-0 text-xs"}`}>{formatValue(row[column.key], column.format, relations[column.key])}</div></div>)}</div><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => onEdit(row)} className="inline-flex h-10 items-center justify-center gap-2 border border-[var(--line)] text-xs font-bold text-[var(--brand)]"><Edit3 size={15} />Editar</button><button onClick={() => onArchive(row)} className="inline-flex h-10 items-center justify-center gap-2 border border-[var(--line)] text-xs font-bold text-[var(--danger)]"><Archive size={15} />Arquivar</button>{onPrint && <button onClick={() => onPrint(row)} className="inline-flex h-10 items-center justify-center gap-2 border border-[var(--line)] text-xs font-bold"><Printer size={15} />Imprimir PDF</button>}{onConvert && convertible(row) && <button disabled={converting} onClick={() => onConvert(row)} className="inline-flex h-10 items-center justify-center gap-2 bg-[var(--brand)] text-xs font-bold text-white disabled:opacity-60"><FileOutput size={15} />Gerar OS</button>}</div></article>)}</div><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[840px] border-collapse text-left"><thead><tr className="border-b border-[var(--line)] bg-[var(--surface-muted)]">{config.columns.map((column) => <th key={column.key} className="whitespace-nowrap px-4 py-3 text-[11px] font-bold uppercase tracking-[.06em] text-[var(--ink-muted)]">{column.label}</th>)}<th className="w-32 px-4 py-3 text-right text-[11px] font-bold uppercase text-[var(--ink-muted)]">Ações</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{rows.map((row) => <tr key={String(row.id)} className="hover:bg-[var(--surface-muted)]">{config.columns.map((column) => <td key={column.key} className="max-w-64 truncate px-4 py-3 text-xs">{formatValue(row[column.key], column.format, relations[column.key])}</td>)}<td className="px-4 py-2"><div className="flex justify-end gap-1">{onConvert && convertible(row) && <button disabled={converting} onClick={() => onConvert(row)} className="grid size-8 place-items-center text-[var(--ink-muted)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] disabled:opacity-50" aria-label="Gerar ordem de serviço" title="Gerar ordem de serviço"><FileOutput size={15} /></button>}{onPrint && <button onClick={() => onPrint(row)} className="grid size-8 place-items-center text-[var(--ink-muted)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]" aria-label="Imprimir ou salvar PDF" title="Imprimir ou salvar PDF"><Printer size={15} /></button>}<button onClick={() => onEdit(row)} className="grid size-8 place-items-center text-[var(--ink-muted)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]" aria-label="Editar" title="Editar"><Edit3 size={15} /></button><button onClick={() => onArchive(row)} className="grid size-8 place-items-center text-[var(--ink-muted)] hover:bg-[#fff0ee] hover:text-[var(--danger)]" aria-label="Arquivar" title="Arquivar"><Archive size={15} /></button></div></td></tr>)}</tbody></table></div></>;
}

function Kanban({ config, rows, relations, onEdit, onStatus, onPrint }: { config: ModuleConfig; rows: Row[]; relations: RelationLabels; onEdit: (row: Row) => void; onStatus: (row: Row, status: string) => void; onPrint?: (row: Row) => void }) {
  const options = config.fields.find((field) => field.name === "status")?.options ?? [];
  if (!rows.length) return <EmptyState singular={config.singular} />;
  return <div className="flex min-h-[460px] gap-3 overflow-x-auto bg-[var(--canvas)] p-3">{options.map((option) => { const items = rows.filter((row) => row.status === option.value); return <section key={option.value} className="w-64 shrink-0"><div className="mb-2 flex items-center justify-between px-1"><h3 className="text-xs font-bold">{option.label}</h3><span className="grid size-5 place-items-center rounded-full bg-[var(--line)] text-[10px] font-bold">{items.length}</span></div><div className="space-y-2">{items.map((row) => <article key={String(row.id)} className="border border-[var(--line)] bg-[var(--surface)] p-3 shadow-sm"><button onClick={() => onEdit(row)} className="w-full text-left"><div className="flex items-center justify-between"><p className="text-xs font-bold">OS {String(row.number ?? "")}</p><StatusBadge value={String(row.priority ?? "normal")} /></div><p className="mt-3 text-sm font-semibold">{relations.vehicle_id?.[String(row.vehicle_id)] ?? "Veículo"}</p><p className="mt-1 text-xs text-[var(--ink-muted)]">{relations.customer_id?.[String(row.customer_id)] ?? "Cliente"}</p><p className="mt-3 line-clamp-2 text-[11px] leading-4 text-[var(--ink-muted)]">{String(row.customer_complaint ?? "")}</p></button><div className="mt-3 flex gap-1.5"><select value={String(row.status)} onChange={(event) => onStatus(row, event.target.value)} className="h-8 min-w-0 flex-1 border border-[var(--line)] bg-[var(--surface-muted)] px-2 text-[11px]" aria-label="Alterar status">{options.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select>{onPrint && <button onClick={() => onPrint(row)} className="grid size-8 shrink-0 place-items-center border border-[var(--line)] text-[var(--ink-muted)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]" aria-label={`Imprimir OS ${String(row.number ?? "")}`} title="Imprimir ou salvar PDF"><Printer size={14} /></button>}</div></article>)}</div></section>; })}</div>;
}

function Field({ field, value, options, onChange, quickCreate, onOptionCreated }: { field: FieldConfig; value: string; options: Record<string, string>; onChange: (value: string) => void; quickCreate: QuickCreateConfig | null; onOptionCreated: (id: string, label: string) => void }) {
  const className = "mt-2 h-10 w-full border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm outline-none focus:border-[var(--brand)]";
  if (field.type === "relation") return <SmartRelationPicker field={field} value={value} options={options} onChange={onChange} quickCreate={quickCreate} onOptionCreated={onOptionCreated} />;
  return <label className={`text-xs font-bold ${field.wide ? "sm:col-span-2" : ""}`}>{field.type === "checkbox" ? <span className="flex min-h-10 items-center gap-3 border border-[var(--line-strong)] px-3 py-2"><input type="checkbox" checked={value === "true"} onChange={(event) => onChange(String(event.target.checked))} className="size-4 accent-[var(--brand)]" />{field.label}</span> : <>{field.label}{field.required && <span className="ml-1 text-[var(--danger)]">*</span>}{field.type === "textarea" ? <textarea required={field.required} value={value} onChange={(event) => onChange(event.target.value)} className={`${className} h-24 py-2`} placeholder={field.placeholder} /> : field.type === "select" ? <select required={field.required} value={value} onChange={(event) => onChange(event.target.value)} className={className}><option value="">Selecione</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input required={field.required} type={field.type === "datetime" ? "datetime-local" : field.type} value={value} onChange={(event) => onChange(event.target.value)} className={className} placeholder={field.placeholder} />}</>}</label>;
}

export function RelationPicker({ field, value, options, onChange, quickCustomer, onOptionCreated }: { field: FieldConfig; value: string; options: Record<string, string>; onChange: (value: string) => void; quickCustomer: Context | null; onOptionCreated: (id: string, label: string) => void }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quick, setQuick] = useState({ name: "", phone: "", taxId: "", email: "" });
  const [quickError, setQuickError] = useState<string | null>(null);
  const normalized = term.trim().toLocaleLowerCase("pt-BR");
  const matches = Object.entries(options).filter(([, label]) => !normalized || label.toLocaleLowerCase("pt-BR").includes(normalized)).slice(0, 100);

  const createCustomer = async () => {
    if (!quickCustomer || !quick.name.trim()) { setQuickError("Informe o nome do cliente."); return; }
    setSaving(true); setQuickError(null);
    try {
      const { data, error } = await createClient().from("customers").insert({ organization_id: quickCustomer.organizationId, primary_branch_id: quickCustomer.branchId, customer_type: "individual", name: quick.name.trim(), primary_phone: quick.phone.trim() || null, tax_id: quick.taxId.replace(/\D/g, "") || null, primary_email: quick.email.trim() || null, created_by: quickCustomer.userId, updated_by: quickCustomer.userId }).select("id,name,primary_phone").single();
      if (error) throw error;
      const label = [data.name, data.primary_phone].filter(Boolean).join(" • ");
      onOptionCreated(data.id, label); setCreating(false); setOpen(false); setQuick({ name: "", phone: "", taxId: "", email: "" });
    } catch (caught) { setQuickError(caught instanceof Error ? caught.message : "Não foi possível cadastrar o cliente."); }
    finally { setSaving(false); }
  };

  return <div className={`${field.wide ? "sm:col-span-2" : ""} relative text-xs font-bold`}><span>{field.label}{field.required && <span className="ml-1 text-[var(--danger)]">*</span>}</span><button type="button" onClick={() => setOpen((current) => !current)} className="mt-2 flex h-10 w-full items-center gap-2 border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-left text-sm font-normal outline-none focus:border-[var(--brand)]" aria-haspopup="listbox" aria-expanded={open}><Search size={15} className="text-[var(--brand)]" /><span className={`min-w-0 flex-1 truncate ${value ? "" : "text-[var(--ink-muted)]"}`}>{value ? options[value] ?? "Cadastro selecionado" : `Buscar ${field.label.toLocaleLowerCase("pt-BR")}`}</span><ChevronDown size={15} /></button>{open && <div className="absolute inset-x-0 z-30 mt-1 border border-[var(--line-strong)] bg-[var(--surface)] p-2 shadow-xl"><div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" /><input autoFocus value={term} onChange={(event) => setTerm(event.target.value)} className="h-10 w-full border border-[var(--line)] bg-[var(--surface-muted)] pl-9 pr-3 text-sm font-normal outline-none focus:border-[var(--brand)]" placeholder="Digite para procurar" /></div><div className="mt-2 max-h-48 overflow-y-auto" role="listbox">{matches.map(([id, label]) => <button key={id} type="button" onClick={() => { onChange(id); setOpen(false); setTerm(""); }} className="flex min-h-10 w-full items-center gap-2 border-b border-[var(--line)] px-2 py-2 text-left text-xs font-normal last:border-0 hover:bg-[var(--surface-muted)]"><span className="min-w-0 flex-1">{label}</span>{value === id && <Check size={15} className="text-[var(--brand)]" />}</button>)}{!matches.length && <p className="p-4 text-center font-normal text-[var(--ink-muted)]">Nenhum cadastro encontrado.</p>}</div>{quickCustomer && <button type="button" onClick={() => { setCreating(true); setOpen(false); }} className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 border border-[var(--brand)] text-xs font-bold text-[var(--brand)]"><UserPlus size={15} />Cadastrar cliente sem sair do orçamento</button>}</div>}{creating && <div className="mt-3 border border-[var(--brand)] bg-[var(--brand-soft)] p-3"><div className="flex items-center justify-between"><p className="font-bold">Novo cliente</p><button type="button" onClick={() => setCreating(false)} className="p-1" aria-label="Fechar cadastro rápido"><X size={15} /></button></div><p className="mt-1 font-normal text-[var(--ink-muted)]">Cadastre os dados básicos e continue o orçamento.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><input value={quick.name} onChange={(event) => setQuick((current) => ({ ...current, name: event.target.value }))} className="h-10 border border-[var(--line-strong)] bg-[var(--surface)] px-3 font-normal" placeholder="Nome completo *" /><input value={quick.phone} onChange={(event) => setQuick((current) => ({ ...current, phone: event.target.value }))} className="h-10 border border-[var(--line-strong)] bg-[var(--surface)] px-3 font-normal" placeholder="Telefone" /><input value={quick.taxId} onChange={(event) => setQuick((current) => ({ ...current, taxId: event.target.value }))} className="h-10 border border-[var(--line-strong)] bg-[var(--surface)] px-3 font-normal" placeholder="CPF ou CNPJ" /><input type="email" value={quick.email} onChange={(event) => setQuick((current) => ({ ...current, email: event.target.value }))} className="h-10 border border-[var(--line-strong)] bg-[var(--surface)] px-3 font-normal" placeholder="E-mail" /></div>{quickError && <p className="mt-2 text-[var(--danger)]">{quickError}</p>}<div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setCreating(false)} className="h-9 border border-[var(--line)] px-3">Cancelar</button><button type="button" disabled={saving} onClick={() => void createCustomer()} className="inline-flex h-9 items-center gap-2 bg-[var(--brand)] px-3 text-white disabled:opacity-60">{saving && <LoaderCircle size={14} className="animate-spin" />}Cadastrar e selecionar</button></div></div>}</div>;
}

function EmptyState({ singular }: { singular: string }) { return <div className="grid min-h-72 place-items-center px-5 py-10 text-center"><div><div className="mx-auto grid size-10 place-items-center rounded-full bg-[var(--surface-muted)] text-[var(--ink-muted)]"><Plus size={18} /></div><h3 className="mt-3 text-sm font-bold">Nenhum {singular} cadastrado</h3><p className="mt-1 text-xs text-[var(--ink-muted)]">Use a ação principal para criar o primeiro registro.</p></div></div>; }
function StatusBadge({ value }: { value: string }) { return <span className="inline-flex rounded-full bg-[var(--brand-soft)] px-2 py-1 text-[10px] font-bold text-[var(--brand)]">{statusLabel(value)}</span>; }

function initialForm(config: ModuleConfig) { return Object.fromEntries(config.fields.map((field) => [field.name, String(field.defaultValue ?? "")])); }
function inputValue(value: unknown, field: FieldConfig) { if (value == null) return ""; if (field.type === "datetime") return new Date(String(value)).toISOString().slice(0, 16); return String(value); }
function serializeValue(value: string, field: FieldConfig): unknown { if (field.type === "checkbox") return value === "true"; if (value === "") return null; if (field.type === "number") return Number(value); if (field.type === "datetime") return new Date(value).toISOString(); return value; }
function formatValue(value: unknown, format?: string, relation?: Record<string, string>) { if (value == null || value === "") return "—"; if (format === "relation") return relation?.[String(value)] ?? "—"; if (format === "currency") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value)); if (format === "date") return new Intl.DateTimeFormat("pt-BR").format(new Date(String(value))); if (format === "datetime") return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(String(value))); if (format === "status") return <StatusBadge value={String(value)} />; return String(value); }
function statusLabel(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function moduleArea(config: ModuleConfig) { return (config.phaseLabel ?? "Operação principal").replace(/^Fase\s+\d+\s*•?\s*/i, "") || "Operação"; }
