"use client";

import { KeyRound, LoaderCircle, Plus, ShieldCheck } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Role = { id: string; code: string; name: string; description: string | null; is_system: boolean };
type Permission = { id: string; code: string; module: string; action: string; description: string };
type Grant = { role_id: string; permission_id: string };

const roleKeywords: Record<string, string[]> = {
  super_admin: ["Acesso total", "Desenvolvimento", "Testes", "Cargos", "Usuários"],
  owner: ["Empresa", "Cargos", "Usuários", "Financeiro", "Relatórios"],
  administrator: ["Operação", "Usuários", "Configurações", "Relatórios"],
  manager: ["Equipe", "Operação", "Indicadores", "Aprovações"],
  administrative: ["Atendimento", "Cadastros", "Documentos", "Relatórios"],
  service_advisor: ["Recepção", "Inspeção", "Orçamentos", "Clientes"],
  mechanic: ["Ordens", "Inspeções", "Execução", "Estoque"],
  stockkeeper: ["Produtos", "Estoque", "Contagens", "Transferências"],
  buyer: ["Fornecedores", "Compras", "Recebimentos"],
  financial: ["Contas", "Pagamentos", "Comissões", "Relatórios"],
  cashier: ["Caixa", "Recebimentos", "Fechamento"],
  salesperson: ["Clientes", "Orçamentos", "CRM", "Frotas"],
  auditor: ["Consulta", "Auditoria", "Exportação", "LGPD"],
  read_only: ["Somente consulta", "Sem alterações"],
};

const moduleNames: Record<string, string> = {
  dashboard: "Dashboard", customers: "Clientes", vehicles: "Veículos", appointments: "Agenda",
  reception: "Recepção", inspections: "Inspeções", estimates: "Orçamentos", work_orders: "Ordens",
  products: "Produtos", suppliers: "Fornecedores", purchases: "Compras", inventory: "Estoque",
  financial: "Financeiro", cash: "Caixa", commissions: "Comissões", reports: "Relatórios",
  crm: "CRM", warranties: "Garantias", fleets: "Frotas", automations: "Automações", portal: "Portal",
  bi: "BI", integrations: "Integrações", notifications: "Notificações", privacy: "LGPD",
  audit: "Auditoria", settings: "Configurações", users: "Usuários", roles: "Cargos",
  branches: "Filiais", organizations: "Empresa",
};

export function RolesModule() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sua sessão expirou.");
      const { data: profile } = await supabase.from("profiles").select("last_organization_id").eq("id", user.id).single();
      if (!profile?.last_organization_id) throw new Error("Conclua o onboarding.");
      const organizationId = profile.last_organization_id;
      const [roleResult, permissionResult, userRoleResult] = await Promise.all([
        supabase.from("roles").select("id,code,name,description,is_system").eq("organization_id", organizationId).is("deleted_at", null).order("is_system", { ascending: false }).order("name"),
        supabase.from("permissions").select("id,code,module,action,description").order("module").order("action"),
        supabase.from("user_roles").select("role_id").eq("organization_id", organizationId).eq("user_id", user.id),
      ]);
      const firstError = roleResult.error ?? permissionResult.error ?? userRoleResult.error;
      if (firstError) throw firstError;
      const loadedRoles = (roleResult.data ?? []) as Role[];
      const roleIds = loadedRoles.map((role) => role.id);
      const grantResult = roleIds.length
        ? await supabase.from("role_permissions").select("role_id,permission_id").in("role_id", roleIds)
        : { data: [], error: null };
      if (grantResult.error) throw grantResult.error;
      setRoles(loadedRoles);
      setPermissions((permissionResult.data ?? []) as Permission[]);
      setGrants((grantResult.data ?? []) as Grant[]);
      const ownRoleIds = new Set((userRoleResult.data ?? []).map((row) => row.role_id));
      setCanManage(loadedRoles.some((role) => ownRoleIds.has(role.id) && ["super_admin", "owner"].includes(role.code)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os cargos.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const permissionById = useMemo(() => new Map(permissions.map((permission) => [permission.id, permission])), [permissions]);
  const grantsByRole = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const grant of grants) {
      const permission = permissionById.get(grant.permission_id);
      if (permission) map.set(grant.role_id, [...(map.get(grant.role_id) ?? []), permission]);
    }
    return map;
  }, [grants, permissionById]);

  const toggle = (code: string) => setSelected((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(null);
    if (name.trim().length < 3 || selected.length === 0) { setError("Informe o nome e selecione ao menos uma permissão."); return; }
    setSaving(true);
    try {
      const { error: rpcError } = await createClient().rpc("create_custom_role", { p_name: name, p_description: description, p_permission_codes: selected });
      if (rpcError) throw rpcError;
      setName(""); setDescription(""); setSelected([]); setOpen(false); await load();
    } catch { setError("Não foi possível criar o cargo. Verifique suas permissões."); }
    finally { setSaving(false); }
  };

  if (loading) return <main className="grid min-h-[60vh] place-items-center"><LoaderCircle className="animate-spin text-[var(--brand)]" /></main>;
  return <main className="p-4 sm:p-6 lg:p-8"><div className="mx-auto max-w-6xl">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[var(--brand)]">Administração</p><h1 className="mt-1 text-2xl font-bold">Cargos e acessos</h1><p className="mt-2 text-sm text-[var(--ink-muted)]">Resumo em palavras-chave e quantidade de permissões por cargo.</p></div>{canManage && <button onClick={() => setOpen(!open)} className="flex h-10 items-center gap-2 bg-[var(--brand)] px-4 text-sm font-bold text-white"><Plus size={17} />Novo cargo</button>}</div>
    {error && <div role="alert" className="mt-5 border border-[#f0b4ae] bg-[#fff2f0] px-4 py-3 text-sm text-[var(--danger)]">{error}</div>}
    {open && canManage && <form onSubmit={submit} className="mt-6 border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="font-bold">Criar cargo personalizado</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold">Nome<input value={name} onChange={(event) => setName(event.target.value)} className="field mt-2 w-full" placeholder="Ex.: Líder de oficina" /></label><label className="text-xs font-bold">Descrição<input value={description} onChange={(event) => setDescription(event.target.value)} className="field mt-2 w-full" placeholder="Resumo da responsabilidade" /></label></div><p className="mt-5 text-xs font-bold">Permissões</p><div className="mt-2 grid max-h-72 gap-2 overflow-y-auto border border-[var(--line)] p-3 sm:grid-cols-2 lg:grid-cols-3">{permissions.filter((permission) => permission.code !== "roles.manage").map((permission) => <label key={permission.id} className="flex gap-2 text-xs"><input type="checkbox" checked={selected.includes(permission.code)} onChange={() => toggle(permission.code)} /><span><strong>{moduleNames[permission.module] ?? permission.module}</strong><br /><span className="text-[var(--ink-muted)]">{permission.description}</span></span></label>)}</div><button disabled={saving} className="mt-4 flex h-10 items-center gap-2 bg-[var(--brand)] px-4 text-sm font-bold text-white disabled:opacity-60">{saving && <LoaderCircle size={16} className="animate-spin" />}Criar cargo</button></form>}
    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{roles.map((role) => { const rolePermissions = grantsByRole.get(role.id) ?? []; const derived = [...new Set(rolePermissions.map((permission) => moduleNames[permission.module] ?? permission.module))].slice(0, 5); const keywords = roleKeywords[role.code] ?? derived; const elevated = ["super_admin", "owner"].includes(role.code); return <article key={role.id} className="border border-[var(--line)] bg-[var(--surface)] p-5"><div className="flex items-start gap-3"><span className={`grid size-10 place-items-center ${elevated ? "bg-[var(--brand)] text-white" : "bg-[var(--brand-soft)] text-[var(--brand)]"}`}>{elevated ? <KeyRound size={18} /> : <ShieldCheck size={18} />}</span><div><h2 className="font-bold">{role.name}</h2><p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">{role.description}</p></div></div><div className="mt-4 flex flex-wrap gap-1.5">{keywords.map((keyword) => <span key={keyword} className="bg-[var(--surface-muted)] px-2 py-1 text-[11px] font-semibold">{keyword}</span>)}</div><div className="mt-4 flex items-center justify-between border-t border-[var(--line)] pt-3 text-[11px] text-[var(--ink-muted)]"><span>{rolePermissions.length} permissões</span><span>{elevated ? "Pode elevar cargos" : role.is_system ? "Cargo padrão" : "Cargo personalizado"}</span></div></article>; })}</div>
  </div></main>;
}
