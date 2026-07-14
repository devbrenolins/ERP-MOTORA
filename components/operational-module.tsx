"use client";

import { Archive, ChevronLeft, ChevronRight, Edit3, LoaderCircle, Plus, RefreshCw, Search, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FieldConfig, ModuleConfig } from "@/lib/phase-two-modules";

type Row = Record<string, unknown>;
type Context = { organizationId: string; branchId: string; userId: string };
type RelationLabels = Record<string, Record<string, string>>;
const PAGE_SIZE = 25;

export function OperationalModule({ config }: { config: ModuleConfig }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [context, setContext] = useState<Context | null>(null);
  const [relations, setRelations] = useState<RelationLabels>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string>>(initialForm(config));
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sua sessão expirou. Entre novamente.");
      const { data: profile, error: profileError } = await supabase.from("profiles").select("last_organization_id,last_branch_id").eq("id", user.id).single();
      if (profileError) throw profileError;
      if (!profile?.last_organization_id || !profile.last_branch_id) throw new Error("Conclua o onboarding e selecione uma filial antes de usar este módulo.");
      const active = { organizationId: profile.last_organization_id, branchId: profile.last_branch_id, userId: user.id };
      setContext(active);

      let request = supabase.from(config.table).select("*", { count: "exact" }).eq("organization_id", active.organizationId).is("deleted_at", null);
      for (const [key, value] of Object.entries(config.fixedFilters ?? {})) request = request.eq(key, value);
      const { data, error: rowsError, count } = await request.order("created_at", { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (rowsError) throw rowsError;
      setRows((data ?? []) as Row[]); setTotal(count ?? 0);

      const relationFields = config.fields.filter((field) => field.relation);
      const labelMaps: RelationLabels = {};
      await Promise.all(relationFields.map(async (field) => {
        const relation = field.relation!;
        const { data: options } = await supabase.from(relation.table).select(["id", ...relation.labelFields].join(",")).eq("organization_id", active.organizationId).is("deleted_at", null).limit(500);
        labelMaps[field.name] = Object.fromEntries(((options ?? []) as unknown as Row[]).map((option) => [String(option.id), relation.labelFields.map((key) => option[key]).filter(Boolean).join(" • ")]));
      }));
      setRelations(labelMaps);
    } catch (caught) {
      setRows([]); setTotal(0);
      setError(caught instanceof Error && caught.message === "Supabase não configurado." ? "Conecte o projeto Supabase e aplique as migrations para ativar este módulo." : caught instanceof Error ? caught.message : "Não foi possível carregar os dados.");
    } finally { setLoading(false); }
  }, [config, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return rows;
    return rows.filter((row) => config.columns.some((column) => {
      const raw = row[column.key];
      const value = column.format === "relation" ? relations[column.key]?.[String(raw)] : raw;
      return String(value ?? "").toLocaleLowerCase("pt-BR").includes(normalized);
    }));
  }, [config.columns, query, relations, rows]);

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
      const values: Record<string, unknown> = { ...(config.defaults ?? {}) };
      for (const field of config.fields) values[field.name] = serializeValue(form[field.name] ?? "", field);
      if (typeof values.tax_id === "string") values.tax_id = values.tax_id.replace(/\D/g, "") || null;
      if (typeof values.license_plate === "string") values.license_plate = values.license_plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const scope = { organization_id: context.organizationId, [config.branchColumn]: context.branchId, updated_by: context.userId };
      if (editing) {
        const { error: saveError } = await supabase.from(config.table).update({ ...values, ...scope }).eq("id", String(editing.id));
        if (saveError) throw saveError;
      } else {
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

  return (
    <main className="mx-auto max-w-[1520px] px-4 py-5 lg:px-7 lg:py-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="mb-1 text-[11px] font-bold uppercase tracking-[.14em] text-[var(--brand)]">Fase 2 • Operação principal</p><h1 className="text-2xl font-bold tracking-[-.025em]">{config.title}</h1><p className="mt-1 text-sm text-[var(--ink-muted)]">{config.subtitle}</p></div>
        <button onClick={openNew} className="inline-flex h-10 items-center justify-center gap-2 bg-[var(--brand)] px-4 text-sm font-bold text-white hover:bg-[var(--brand-strong)]"><Plus size={17} />Novo {config.singular}</button>
      </div>

      {error && <div className="mb-4 flex items-start justify-between gap-4 border border-[#e9b3ad] bg-[#fff3f1] px-4 py-3 text-xs text-[var(--danger)]" role="alert"><span>{error}</span><button onClick={() => setError(null)} aria-label="Fechar mensagem"><X size={15} /></button></div>}

      <section className="border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-sm"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 w-full border border-[var(--line)] bg-[var(--surface-muted)] pl-9 pr-3 text-xs outline-none focus:border-[var(--brand)]" placeholder={`Pesquisar em ${config.title.toLocaleLowerCase("pt-BR")}`} /></div>
          <button onClick={() => void load()} className="inline-flex h-9 items-center justify-center gap-2 border border-[var(--line)] px-3 text-xs font-semibold"><RefreshCw size={14} />Atualizar</button>
          <p className="text-xs text-[var(--ink-muted)] sm:ml-auto">{total} registro{total === 1 ? "" : "s"}</p>
        </div>
        {loading ? <div className="grid min-h-72 place-items-center"><LoaderCircle className="animate-spin text-[var(--brand)]" /></div> : config.view === "kanban" ? <Kanban config={config} rows={filteredRows} relations={relations} onEdit={openEdit} onStatus={updateStatus} /> : <DataTable config={config} rows={filteredRows} relations={relations} onEdit={openEdit} onArchive={archive} />}
        <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-3 text-xs text-[var(--ink-muted)]"><span>Página {page + 1} de {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span><div className="flex gap-1"><button disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="grid size-8 place-items-center border border-[var(--line)] disabled:opacity-40" aria-label="Página anterior"><ChevronLeft size={15} /></button><button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((value) => value + 1)} className="grid size-8 place-items-center border border-[var(--line)] disabled:opacity-40" aria-label="Próxima página"><ChevronRight size={15} /></button></div></div>
      </section>

      {dialogOpen && <div className="fixed inset-0 z-50 bg-black/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`${editing ? "Editar" : "Novo"} ${config.singular}`} onMouseDown={(event) => event.target === event.currentTarget && !saving && setDialogOpen(false)}>
        <form onSubmit={submit} className="ml-auto flex h-full w-full max-w-2xl flex-col bg-[var(--surface)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><p className="text-base font-bold">{editing ? "Editar" : "Novo"} {config.singular}</p><p className="mt-0.5 text-xs text-[var(--ink-muted)]">Campos obrigatórios estão identificados.</p></div><button type="button" disabled={saving} onClick={() => setDialogOpen(false)} className="p-2" aria-label="Fechar formulário"><X size={18} /></button></div>
          <div className="grid flex-1 auto-rows-min grid-cols-1 gap-5 overflow-y-auto p-5 sm:grid-cols-2">{config.fields.map((field) => <Field key={field.name} field={field} value={form[field.name] ?? ""} options={relations[field.name] ?? {}} onChange={(value) => setForm((current) => ({ ...current, [field.name]: value }))} />)}</div>
          <div className="flex justify-end gap-2 border-t border-[var(--line)] p-4"><button type="button" disabled={saving} onClick={() => setDialogOpen(false)} className="h-10 border border-[var(--line)] px-4 text-sm font-semibold">Cancelar</button><button type="submit" disabled={saving} className="inline-flex h-10 min-w-28 items-center justify-center gap-2 bg-[var(--brand)] px-4 text-sm font-bold text-white disabled:opacity-60">{saving && <LoaderCircle size={16} className="animate-spin" />}Salvar</button></div>
        </form>
      </div>}
    </main>
  );
}

function DataTable({ config, rows, relations, onEdit, onArchive }: { config: ModuleConfig; rows: Row[]; relations: RelationLabels; onEdit: (row: Row) => void; onArchive: (row: Row) => void }) {
  if (!rows.length) return <EmptyState singular={config.singular} />;
  return <div className="overflow-x-auto"><table className="w-full min-w-[840px] border-collapse text-left"><thead><tr className="border-b border-[var(--line)] bg-[var(--surface-muted)]">{config.columns.map((column) => <th key={column.key} className="whitespace-nowrap px-4 py-3 text-[11px] font-bold uppercase tracking-[.06em] text-[var(--ink-muted)]">{column.label}</th>)}<th className="w-24 px-4 py-3 text-right text-[11px] font-bold uppercase text-[var(--ink-muted)]">Ações</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{rows.map((row) => <tr key={String(row.id)} className="hover:bg-[var(--surface-muted)]">{config.columns.map((column) => <td key={column.key} className="max-w-64 truncate px-4 py-3 text-xs">{formatValue(row[column.key], column.format, relations[column.key])}</td>)}<td className="px-4 py-2"><div className="flex justify-end gap-1"><button onClick={() => onEdit(row)} className="grid size-8 place-items-center text-[var(--ink-muted)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]" aria-label="Editar"><Edit3 size={15} /></button><button onClick={() => onArchive(row)} className="grid size-8 place-items-center text-[var(--ink-muted)] hover:bg-[#fff0ee] hover:text-[var(--danger)]" aria-label="Arquivar"><Archive size={15} /></button></div></td></tr>)}</tbody></table></div>;
}

function Kanban({ config, rows, relations, onEdit, onStatus }: { config: ModuleConfig; rows: Row[]; relations: RelationLabels; onEdit: (row: Row) => void; onStatus: (row: Row, status: string) => void }) {
  const options = config.fields.find((field) => field.name === "status")?.options ?? [];
  if (!rows.length) return <EmptyState singular={config.singular} />;
  return <div className="flex min-h-[460px] gap-3 overflow-x-auto bg-[var(--canvas)] p-3">{options.map((option) => { const items = rows.filter((row) => row.status === option.value); return <section key={option.value} className="w-64 shrink-0"><div className="mb-2 flex items-center justify-between px-1"><h3 className="text-xs font-bold">{option.label}</h3><span className="grid size-5 place-items-center rounded-full bg-[var(--line)] text-[10px] font-bold">{items.length}</span></div><div className="space-y-2">{items.map((row) => <article key={String(row.id)} className="border border-[var(--line)] bg-[var(--surface)] p-3 shadow-sm"><button onClick={() => onEdit(row)} className="w-full text-left"><div className="flex items-center justify-between"><p className="text-xs font-bold">OS {String(row.number ?? "")}</p><StatusBadge value={String(row.priority ?? "normal")} /></div><p className="mt-3 text-sm font-semibold">{relations.vehicle_id?.[String(row.vehicle_id)] ?? "Veículo"}</p><p className="mt-1 text-xs text-[var(--ink-muted)]">{relations.customer_id?.[String(row.customer_id)] ?? "Cliente"}</p><p className="mt-3 line-clamp-2 text-[11px] leading-4 text-[var(--ink-muted)]">{String(row.customer_complaint ?? "")}</p></button><select value={String(row.status)} onChange={(event) => onStatus(row, event.target.value)} className="mt-3 h-8 w-full border border-[var(--line)] bg-[var(--surface-muted)] px-2 text-[11px]" aria-label="Alterar status">{options.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></article>)}</div></section>; })}</div>;
}

function Field({ field, value, options, onChange }: { field: FieldConfig; value: string; options: Record<string, string>; onChange: (value: string) => void }) {
  const className = "mt-2 h-10 w-full border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm outline-none focus:border-[var(--brand)]";
  return <label className={`text-xs font-bold ${field.wide ? "sm:col-span-2" : ""}`}>{field.label}{field.required && <span className="ml-1 text-[var(--danger)]">*</span>}{field.type === "textarea" ? <textarea required={field.required} value={value} onChange={(event) => onChange(event.target.value)} className={`${className} h-24 py-2`} placeholder={field.placeholder} /> : field.type === "select" ? <select required={field.required} value={value} onChange={(event) => onChange(event.target.value)} className={className}><option value="">Selecione</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === "relation" ? <select required={field.required} value={value} onChange={(event) => onChange(event.target.value)} className={className}><option value="">Selecione</option>{Object.entries(options).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select> : <input required={field.required} type={field.type === "datetime" ? "datetime-local" : field.type} value={value} onChange={(event) => onChange(event.target.value)} className={className} placeholder={field.placeholder} />}</label>;
}

function EmptyState({ singular }: { singular: string }) { return <div className="grid min-h-72 place-items-center px-5 py-10 text-center"><div><div className="mx-auto grid size-10 place-items-center rounded-full bg-[var(--surface-muted)] text-[var(--ink-muted)]"><Plus size={18} /></div><h3 className="mt-3 text-sm font-bold">Nenhum {singular} cadastrado</h3><p className="mt-1 text-xs text-[var(--ink-muted)]">Use a ação principal para criar o primeiro registro.</p></div></div>; }
function StatusBadge({ value }: { value: string }) { return <span className="inline-flex rounded-full bg-[var(--brand-soft)] px-2 py-1 text-[10px] font-bold text-[var(--brand)]">{statusLabel(value)}</span>; }

function initialForm(config: ModuleConfig) { return Object.fromEntries(config.fields.map((field) => [field.name, String(field.defaultValue ?? "")])); }
function inputValue(value: unknown, field: FieldConfig) { if (value == null) return ""; if (field.type === "datetime") return new Date(String(value)).toISOString().slice(0, 16); return String(value); }
function serializeValue(value: string, field: FieldConfig): unknown { if (value === "") return null; if (field.type === "number") return Number(value); if (field.type === "datetime") return new Date(value).toISOString(); return value; }
function formatValue(value: unknown, format?: string, relation?: Record<string, string>) { if (value == null || value === "") return "—"; if (format === "relation") return relation?.[String(value)] ?? "—"; if (format === "currency") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value)); if (format === "date") return new Intl.DateTimeFormat("pt-BR").format(new Date(String(value))); if (format === "datetime") return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(String(value))); if (format === "status") return <StatusBadge value={String(value)} />; return String(value); }
function statusLabel(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
