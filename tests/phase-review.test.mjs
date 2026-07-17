import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("todas as migrations são transacionais", async () => {
  const files = [
    "supabase/migrations/20260714170000_foundation.sql",
    "supabase/migrations/20260714190000_phase_two_operations.sql",
    "supabase/migrations/20260714210000_phase_three_supply_inventory.sql",
    "supabase/migrations/20260714213000_phase_three_security_review.sql",
    "supabase/migrations/20260714214500_phase_security_definer_grants.sql",
    "supabase/migrations/20260714230000_phase_four_financial.sql",
    "supabase/migrations/20260714233000_phase_four_review.sql",
    "supabase/migrations/20260714234500_phase_four_integrity_review.sql",
    "supabase/migrations/20260714235000_phase_four_workflow_review.sql",
    "supabase/migrations/20260714240000_phase_five_advanced.sql",
    "supabase/migrations/20260714243000_phase_five_review.sql",
    "supabase/migrations/20260714250000_phase_five_completion.sql",
    "supabase/migrations/20260714253000_phase_five_completion_review.sql",
    "supabase/migrations/20260714254500_phase_five_global_privilege_review.sql",
    "supabase/migrations/20260714255000_phase_five_least_privilege_review.sql",
    "supabase/migrations/20260714260000_go_live_roles.sql",
  ];
  for (const file of files) {
    const sql = (await readFile(new URL(file, root), "utf8")).trim().toLowerCase();
    assert.ok(sql.startsWith("begin;"), `${file} deve iniciar uma transação`);
    assert.ok(sql.endsWith("commit;"), `${file} deve confirmar a transação`);
  }
});

test("a conclusão da Fase 5 cobre administração, recuperação e LGPD", async () => {
  const route = await readFile(new URL("components/module-route.tsx", root), "utf8");
  for (const slug of ["notificacoes", "auditoria", "configuracoes", "privacidade"]) assert.match(route, new RegExp(slug));
  const proxy = await readFile(new URL("proxy.ts", root), "utf8");
  assert.match(proxy, /recover-password/);
  assert.match(proxy, /reset-password/);
  const login = await readFile(new URL("components/login-form.tsx", root), "utf8");
  assert.match(login, /href="\/login\?mode=recover"/);
  const roles = await readFile(new URL("supabase/migrations/20260714260000_go_live_roles.sql", root), "utf8");
  for (const code of ["super_admin", "manager", "administrative", "service_advisor", "mechanic", "stockkeeper", "buyer", "financial", "cashier", "salesperson", "auditor"]) assert.match(roles, new RegExp(`'${code}'`));
  assert.match(roles, /enforce_exclusive_role_management/);
  assert.match(roles, /create_custom_role/);
  assert.match(roles, /'Dev Admin'/);
  assert.match(roles, /'Superadmin'/);
  const rolesModule = await readFile(new URL("components/roles-module.tsx", root), "utf8");
  assert.match(rolesModule, /Pode elevar cargos/);
  for (const slug of ["clientes", "estoque", "contas-receber", "automacoes", "perfis", "configuracoes"]) {
    const explicitRoute = await readFile(new URL(`app/${slug}/page.tsx`, root), "utf8");
    assert.match(explicitRoute, new RegExp(`module=\\"${slug}\\"`));
  }
  const shell = await readFile(new URL("components/app-shell.tsx", root), "utf8");
  assert.match(shell, /auth\.signOut/);

  const review = await readFile(new URL("supabase/migrations/20260714253000_phase_five_completion_review.sql", root), "utf8");
  assert.match(review, /revoke truncate,references,trigger/);
  assert.match(review, /consume_work_order_reservations/);
  assert.match(review, /high_discount_reason_required/);
  const grants = await readFile(new URL("supabase/migrations/20260714254500_phase_five_global_privilege_review.sql", root), "utf8");
  assert.match(grants, /revoke all on table/);
  assert.match(grants, /from public,anon,authenticated/);
  const leastPrivilege = await readFile(new URL("supabase/migrations/20260714255000_phase_five_least_privilege_review.sql", root), "utf8");
  assert.match(leastPrivilege, /revoke delete on all tables/);
  assert.match(leastPrivilege, /grant update \(read_at\)/);
  const seed = (await readFile(new URL("supabase/demo_seed.sql", root), "utf8")).trim().toLowerCase();
  assert.ok(seed.startsWith("begin;"));
  assert.ok(seed.endsWith("commit;"));
});

test("a Fase 5 expõe CRM, garantias, frotas, automações, portal, BI e integrações", async () => {
  const source = await readFile(new URL("lib/phase-five-modules.ts", root), "utf8");
  for (const slug of ["segmentos", "garantias", "frotas", "motoristas-frota", "veiculos-frota", "modelos-mensagem", "automacoes", "integracoes"]) {
    assert.match(source, new RegExp(`slug:\\s*"${slug}"`));
  }
  const route = await readFile(new URL("components/module-route.tsx", root), "utf8");
  for (const slug of ["crm", "bi", "portal-acessos", "retornos-garantia"]) assert.match(route, new RegExp(slug));

  const proxy = await readFile(new URL("proxy.ts", root), "utf8");
  assert.match(proxy, /pathname\.startsWith\("\/portal"\)/);
  const portal = await readFile(new URL("components/customer-portal.tsx", root), "utf8");
  assert.match(portal, /get_customer_portal/);
  assert.match(portal, /portal_respond_estimate/);
  assert.doesNotMatch(portal, /SERVICE_ROLE|DB_PASSWORD|ACCESS_TOKEN/);
});

test("a Fase 4 expõe contas, pagamentos, caixa, comissões e relatórios", async () => {
  const source = await readFile(new URL("lib/phase-four-modules.ts", root), "utf8");
  for (const slug of ["contas-receber", "contas-pagar", "comissoes"]) assert.match(source, new RegExp(slug));
  const route = await readFile(new URL("components/module-route.tsx", root), "utf8");
  for (const slug of ["pagamentos", "fluxo-caixa", "caixa", "relatorios"]) assert.match(route, new RegExp(slug));
});

test("a Fase 3 expõe todos os módulos previstos", async () => {
  const source = await readFile(new URL("lib/phase-three-modules.ts", root), "utf8");
  for (const slug of ["produtos", "fornecedores", "compras", "inventario", "transferencias"]) {
    assert.match(source, new RegExp(`\\b${slug}:`));
  }
  const route = await readFile(new URL("components/module-route.tsx", root), "utf8");
  assert.match(route, /module === "estoque"/);
});

test("segredos permanecem fora do cliente e do versionamento", async () => {
  const client = await readFile(new URL("lib/supabase/client.ts", root), "utf8");
  const ignore = await readFile(new URL(".gitignore", root), "utf8");
  assert.doesNotMatch(client, /SERVICE_ROLE|DB_PASSWORD|ACCESS_TOKEN/);
  assert.match(ignore, /^\.env\*/m);
});

test("a revisão de usabilidade oferece busca, cadastro rápido e mobile", async () => {
  const operational = await readFile(new URL("components/operational-module.tsx", root), "utf8");
  assert.match(operational, /debouncedQuery/);
  assert.match(operational, /SmartRelationPicker/);
  assert.match(operational, /md:hidden/);
  assert.doesNotMatch(operational, />Fase\s+\d/);
  const quick = await readFile(new URL("components/smart-relation-picker.tsx", root), "utf8");
  for (const table of ["customers", "vehicles", "suppliers", "warehouses"]) assert.match(quick, new RegExp(table));
  assert.match(quick, /Cadastrar e selecionar/);
  const searchable = await readFile(new URL("components/searchable-select.tsx", root), "utf8");
  assert.match(searchable, /Digite para procurar/);
  const portalAccess = await readFile(new URL("components/portal-access-manager.tsx", root), "utf8");
  assert.match(portalAccess, /SearchableSelect/);
  assert.match(portalAccess, /Buscar cliente ou OS/);
  assert.match(portalAccess, /order:/);
  const shell = await readFile(new URL("components/app-shell.tsx", root), "utf8");
  assert.match(shell, /bg-\[var\(--sidebar\)\].*shadow-/);
});
