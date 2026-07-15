"use client";

import { Building2, LoaderCircle, Mail, Plus, Search, Store } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Organization = { id: string; name: string; legal_name: string; tax_id: string; status: string; created_at: string; branchCount: number };
type CompanyForm = { name: string; legalName: string; taxId: string; branchName: string; branchCode: string; ownerName: string; ownerEmail: string };
const initialForm: CompanyForm = { name: "", legalName: "", taxId: "", branchName: "Matriz", branchCode: "MATRIZ", ownerName: "", ownerEmail: "" };

export function CompanyAdminModule() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<CompanyForm>(initialForm);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/admin/companies", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setOrganizations(payload.organizations ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar as empresas."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    return organizations.filter((organization) => !term || [organization.name, organization.legal_name, organization.tax_id].some((value) => value.toLocaleLowerCase("pt-BR").includes(term)));
  }, [organizations, query]);

  const update = (field: keyof CompanyForm, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null); setSuccess(null);
    try {
      const response = await fetch("/api/admin/companies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setForm(initialForm); setOpen(false); setSuccess(payload.message); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar a empresa."); }
    finally { setSaving(false); }
  };

  if (loading) return <main className="grid min-h-[60vh] place-items-center"><LoaderCircle className="animate-spin text-[var(--brand)]" /></main>;
  return <main className="p-4 sm:p-6 lg:p-8"><div className="mx-auto max-w-6xl">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[var(--brand)]">Dev Admin</p><h1 className="mt-1 text-2xl font-bold">Empresas clientes</h1><p className="mt-2 text-sm text-[var(--ink-muted)]">Cadastre uma empresa e envie o primeiro acesso ao Superadmin.</p></div><button onClick={() => setOpen((value) => !value)} className="flex h-10 items-center gap-2 bg-[var(--brand)] px-4 text-sm font-bold text-white"><Plus size={17} />Nova empresa</button></div>
    <div className="relative mt-5 max-w-md"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--brand)]" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full border border-[var(--line-strong)] bg-[var(--surface)] pl-9 pr-3 text-sm outline-none focus:border-[var(--brand)]" placeholder="Buscar por empresa, razão social ou CNPJ" aria-label="Buscar empresas" /></div>
    {error && <div role="alert" className="mt-5 border border-[#f0b4ae] bg-[#fff2f0] px-4 py-3 text-sm text-[var(--danger)]">{error}</div>}
    {success && <div role="status" className="mt-5 border border-[#aad8cf] bg-[var(--brand-soft)] px-4 py-3 text-sm text-[var(--brand)]">{success}</div>}
    {open && <form onSubmit={submit} className="mt-6 border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center bg-[var(--brand-soft)] text-[var(--brand)]"><Building2 size={19} /></span><div><h2 className="font-bold">Cadastrar empresa cliente</h2><p className="text-xs text-[var(--ink-muted)]">O responsável receberá um convite para criar a senha.</p></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2">
      <Field label="Nome da empresa"><input required value={form.name} onChange={(event) => update("name", event.target.value)} className="field" placeholder="Oficina Central" /></Field>
      <Field label="Razão social"><input required value={form.legalName} onChange={(event) => update("legalName", event.target.value)} className="field" placeholder="Oficina Central Ltda." /></Field>
      <Field label="CPF ou CNPJ"><input required inputMode="numeric" value={form.taxId} onChange={(event) => update("taxId", event.target.value)} className="field" placeholder="00.000.000/0001-00" /></Field>
      <Field label="Primeira filial"><input required value={form.branchName} onChange={(event) => update("branchName", event.target.value)} className="field" /></Field>
      <Field label="Código da filial"><input required value={form.branchCode} onChange={(event) => update("branchCode", event.target.value.toUpperCase())} className="field" maxLength={10} /></Field>
    </div><div className="mt-6 border-t border-[var(--line)] pt-5"><div className="mb-4 flex items-center gap-2"><Mail size={17} className="text-[var(--brand)]" /><h3 className="text-sm font-bold">Primeiro Superadmin</h3></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Nome completo"><input required value={form.ownerName} onChange={(event) => update("ownerName", event.target.value)} className="field" /></Field><Field label="E-mail"><input required type="email" value={form.ownerEmail} onChange={(event) => update("ownerEmail", event.target.value)} className="field" placeholder="responsavel@empresa.com.br" /></Field></div></div>
    <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[var(--line)] pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={() => setOpen(false)} className="h-10 border border-[var(--line-strong)] px-4 text-sm font-semibold">Cancelar</button><button disabled={saving} className="flex h-10 items-center justify-center gap-2 bg-[var(--brand)] px-5 text-sm font-bold text-white disabled:opacity-60">{saving && <LoaderCircle size={16} className="animate-spin" />}Criar empresa e enviar convite</button></div></form>}
    <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((organization) => <article key={organization.id} className="border border-[var(--line)] bg-[var(--surface)] p-5"><div className="flex items-start gap-3"><span className="grid size-10 place-items-center bg-[var(--brand-soft)] text-[var(--brand)]"><Store size={18} /></span><div className="min-w-0"><h2 className="truncate font-bold">{organization.name}</h2><p className="mt-1 truncate text-xs text-[var(--ink-muted)]">{organization.legal_name}</p></div></div><dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-4 text-xs"><div><dt className="text-[var(--ink-muted)]">CPF/CNPJ</dt><dd className="mt-1 font-semibold">{organization.tax_id}</dd></div><div><dt className="text-[var(--ink-muted)]">Filiais</dt><dd className="mt-1 font-semibold">{organization.branchCount}</dd></div><div><dt className="text-[var(--ink-muted)]">Situação</dt><dd className="mt-1 font-semibold text-[var(--success)]">{organization.status === "active" ? "Ativa" : organization.status}</dd></div><div><dt className="text-[var(--ink-muted)]">Criada em</dt><dd className="mt-1 font-semibold">{new Intl.DateTimeFormat("pt-BR").format(new Date(organization.created_at))}</dd></div></dl></article>)}</section>
    {!filtered.length && !error && <div className="mt-6 border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--ink-muted)]">Nenhuma empresa encontrada.</div>}
  </div></main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="text-xs font-bold">{label}<span className="ml-1 text-[var(--danger)]">*</span>{children}</label>; }
