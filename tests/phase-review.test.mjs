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
  ];
  for (const file of files) {
    const sql = (await readFile(new URL(file, root), "utf8")).trim().toLowerCase();
    assert.ok(sql.startsWith("begin;"), `${file} deve iniciar uma transação`);
    assert.ok(sql.endsWith("commit;"), `${file} deve confirmar a transação`);
  }
});

test("a Fase 4 expõe contas, pagamentos, caixa, comissões e relatórios", async () => {
  const source = await readFile(new URL("lib/phase-four-modules.ts", root), "utf8");
  for (const slug of ["contas-receber", "contas-pagar", "comissoes"]) assert.match(source, new RegExp(slug));
  const route = await readFile(new URL("app/[module]/page.tsx", root), "utf8");
  for (const slug of ["pagamentos", "fluxo-caixa", "caixa", "relatorios"]) assert.match(route, new RegExp(slug));
});

test("a Fase 3 expõe todos os módulos previstos", async () => {
  const source = await readFile(new URL("lib/phase-three-modules.ts", root), "utf8");
  for (const slug of ["produtos", "fornecedores", "compras", "inventario", "transferencias"]) {
    assert.match(source, new RegExp(`\\b${slug}:`));
  }
  const route = await readFile(new URL("app/[module]/page.tsx", root), "utf8");
  assert.match(route, /module === "estoque"/);
});

test("segredos permanecem fora do cliente e do versionamento", async () => {
  const client = await readFile(new URL("lib/supabase/client.ts", root), "utf8");
  const ignore = await readFile(new URL(".gitignore", root), "utf8");
  assert.doesNotMatch(client, /SERVICE_ROLE|DB_PASSWORD|ACCESS_TOKEN/);
  assert.match(ignore, /^\.env\*/m);
});
