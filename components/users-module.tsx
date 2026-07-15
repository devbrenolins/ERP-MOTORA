"use client";

import { LoaderCircle, MailPlus, Plus, Search, ShieldCheck, UserRoundCheck, Users } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Branch = { id: string; name: string; code: string };
type Role = { id: string; code: string; name: string; description: string | null };
type UserItem = { id: string; fullName: string; email: string; phone: string; status: string; joinedAt: string | null; roleId: string | null; branchId: string | null };
type Payload = { organization: { id: string; name: string } | null; users: UserItem[]; branches: Branch[]; roles: Role[]; platformAdmin: boolean };

export function UsersModule() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({ fullName: "", email: "", branchId: "", roleId: "" });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setData(payload);
      setForm((current) => ({ ...current, branchId: current.branchId || payload.branches?.[0]?.id || "", roleId: current.roleId || payload.roles?.[0]?.id || "" }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar os usuários."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const rolesById = useMemo(() => new Map((data?.roles ?? []).map((role) => [role.id, role])), [data]);
  const branchesById = useMemo(() => new Map((data?.branches ?? []).map((branch) => [branch.id, branch])), [data]);
  const filtered = useMemo(() => { const term = query.trim().toLocaleLowerCase("pt-BR"); return (data?.users ?? []).filter((user) => !term || [user.fullName, user.email, rolesById.get(user.roleId ?? "")?.name].some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(term))); }, [data, query, rolesById]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null); setSuccess(null);
    try {
      const response = await fetch("/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setForm((current) => ({ ...current, fullName: "", email: "" })); setOpen(false); setSuccess(payload.message); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar o usuário."); }
    finally { setSaving(false); }
  };

  if (loading) return <main className="grid min-h-[60vh] place-items-center"><LoaderCircle className="animate-spin text-[var(--brand)]" /></main>;
  return <main className="p-4 sm:p-6 lg:p-8"><div className="mx-auto max-w-6xl">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[var(--brand)]">Administração</p><h1 className="mt-1 text-2xl font-bold">Usuários</h1><p className="mt-2 text-sm text-[var(--ink-muted)]">{data?.organization ? `Equipe de ${data.organization.name}.` : "Convide a equipe e defina filial e cargo."}</p></div>{data && <button onClick={() => setOpen((value) => !value)} className="flex h-10 items-center gap-2 bg-[var(--brand)] px-4 text-sm font-bold text-white"><Plus size={17} />Novo usuário</button>}</div>
    <div className="relative mt-5 max-w-md"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--brand)]" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full border border-[var(--line-strong)] bg-[var(--surface)] pl-9 pr-3 text-sm outline-none focus:border-[var(--brand)]" placeholder="Buscar por nome, e-mail ou cargo" aria-label="Buscar usuários" /></div>
    {error && <div role="alert" className="mt-5 border border-[#f0b4ae] bg-[#fff2f0] px-4 py-3 text-sm text-[var(--danger)]">{error}</div>}
    {success && <div role="status" className="mt-5 border border-[#aad8cf] bg-[var(--brand-soft)] px-4 py-3 text-sm text-[var(--brand)]">{success}</div>}
    {open && data && <form onSubmit={submit} className="mt-6 border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center bg-[var(--brand-soft)] text-[var(--brand)]"><MailPlus size={19} /></span><div><h2 className="font-bold">Convidar usuário</h2><p className="text-xs text-[var(--ink-muted)]">A pessoa receberá um link para criar a senha.</p></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2">
      <Field label="Nome completo"><input required className="field" value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} /></Field>
      <Field label="E-mail"><input required type="email" className="field" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="pessoa@empresa.com.br" /></Field>
      <Field label="Filial"><select required className="field" value={form.branchId} onChange={(event) => setForm((current) => ({ ...current, branchId: event.target.value }))}>{data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} · {branch.code}</option>)}</select></Field>
      <Field label="Cargo"><select required className="field" value={form.roleId} onChange={(event) => setForm((current) => ({ ...current, roleId: event.target.value }))}>{data.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></Field>
    </div><div className="mt-6 flex flex-col-reverse gap-3 border-t border-[var(--line)] pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={() => setOpen(false)} className="h-10 border border-[var(--line-strong)] px-4 text-sm font-semibold">Cancelar</button><button disabled={saving || !form.branchId || !form.roleId} className="flex h-10 items-center justify-center gap-2 bg-[var(--brand)] px-5 text-sm font-bold text-white disabled:opacity-60">{saving && <LoaderCircle size={16} className="animate-spin" />}Criar usuário e enviar convite</button></div></form>}
    <section className="mt-6 overflow-hidden border border-[var(--line)] bg-[var(--surface)]"><div className="hidden grid-cols-[1.4fr_1.4fr_1fr_1fr_.7fr] gap-4 border-b border-[var(--line)] bg-[var(--surface-muted)] px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)] md:grid"><span>Usuário</span><span>E-mail</span><span>Cargo</span><span>Filial</span><span>Situação</span></div>{filtered.map((user) => <article key={user.id} className="grid gap-3 border-b border-[var(--line)] px-5 py-4 last:border-0 md:grid-cols-[1.4fr_1.4fr_1fr_1fr_.7fr] md:items-center md:gap-4"><div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><UserRoundCheck size={17} /></span><div><p className="font-semibold">{user.fullName}</p><p className="text-[11px] text-[var(--ink-muted)] md:hidden">{user.email}</p></div></div><p className="hidden truncate text-xs md:block">{user.email}</p><p className="flex items-center gap-1.5 text-xs"><ShieldCheck size={14} className="text-[var(--brand)]" />{rolesById.get(user.roleId ?? "")?.name ?? "Sem cargo"}</p><p className="text-xs">{branchesById.get(user.branchId ?? "")?.name ?? "Todas"}</p><span className={`w-fit px-2 py-1 text-[11px] font-bold ${user.status === "active" ? "bg-[#e8f7f1] text-[var(--success)]" : "bg-[var(--surface-muted)] text-[var(--ink-muted)]"}`}>{user.status === "active" ? "Ativo" : user.status}</span></article>)}</section>
    {!filtered.length && !error && <div className="mt-6 border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-10 text-center"><Users className="mx-auto text-[var(--ink-muted)]" /><p className="mt-3 text-sm text-[var(--ink-muted)]">Nenhum usuário encontrado.</p></div>}
  </div></main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="text-xs font-bold">{label}<span className="ml-1 text-[var(--danger)]">*</span>{children}</label>; }
