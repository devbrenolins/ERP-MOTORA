"use client";

import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Boxes, LoaderCircle, RefreshCw, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Position = {
  warehouse_id: string; warehouse_name: string; product_id: string; sku: string; product_name: string; unit: string;
  on_hand: number; reserved: number; available: number; average_cost: number; stock_value: number; minimum_stock: number; reorder_point: number; suggested_purchase: number;
};
type Movement = { id: string; movement_type: string; direction: number; quantity: number; balance_after: number; created_at: string; product_id: string; warehouse_id: string; notes: string | null };
type Option = { id: string; label: string };

const movementOptions = [
  ["adjustment_in", "Ajuste de entrada"], ["adjustment_out", "Ajuste de saída"], ["customer_return", "Devolução de cliente"],
  ["supplier_return", "Devolução ao fornecedor"], ["loss", "Perda"], ["damage", "Avaria"],
] as const;

export function StockModule() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [warehouses, setWarehouses] = useState<Option[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ product_id: "", warehouse_id: "", movement_type: "adjustment_in", quantity: "", unit_cost: "", notes: "" });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sua sessão expirou. Entre novamente.");
      const { data: profile, error: profileError } = await supabase.from("profiles").select("last_organization_id,last_branch_id").eq("id", user.id).single();
      if (profileError) throw profileError;
      if (!profile?.last_organization_id || !profile.last_branch_id) throw new Error("Conclua o onboarding antes de movimentar o estoque.");
      setOrganizationId(profile.last_organization_id);
      const [positionResult, movementResult, productResult, warehouseResult] = await Promise.all([
        supabase.from("inventory_position").select("*").eq("organization_id", profile.last_organization_id).order("product_name").limit(500),
        supabase.from("stock_movements").select("id,movement_type,direction,quantity,balance_after,created_at,product_id,warehouse_id,notes").eq("organization_id", profile.last_organization_id).order("created_at", { ascending: false }).limit(12),
        supabase.from("products").select("id,sku,name").eq("organization_id", profile.last_organization_id).is("deleted_at", null).eq("active", true).order("name").limit(500),
        supabase.from("warehouses").select("id,code,name").eq("organization_id", profile.last_organization_id).is("deleted_at", null).eq("active", true).order("name").limit(100),
      ]);
      const firstError = positionResult.error ?? movementResult.error ?? productResult.error ?? warehouseResult.error;
      if (firstError) throw firstError;
      setPositions((positionResult.data ?? []) as Position[]); setMovements((movementResult.data ?? []) as Movement[]);
      setProducts((productResult.data ?? []).map((item) => ({ id: item.id, label: `${item.sku} • ${item.name}` })));
      setWarehouses((warehouseResult.data ?? []).map((item) => ({ id: item.id, label: `${item.code} • ${item.name}` })));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível carregar o estoque."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const metrics = useMemo(() => ({
    value: positions.reduce((sum, item) => sum + Number(item.stock_value), 0),
    units: positions.reduce((sum, item) => sum + Number(item.on_hand), 0),
    reserved: positions.reduce((sum, item) => sum + Number(item.reserved), 0),
    low: positions.filter((item) => Number(item.available) <= Number(item.reorder_point ?? item.minimum_stock)).length,
  }), [positions]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null);
    try {
      const quantity = Number(form.quantity); if (!quantity || quantity <= 0) throw new Error("Informe uma quantidade maior que zero.");
      const supabase = createClient();
      const { error: movementError } = await supabase.rpc("post_stock_movement", {
        p_product_id: form.product_id, p_warehouse_id: form.warehouse_id, p_movement_type: form.movement_type,
        p_quantity: quantity, p_unit_cost: form.unit_cost ? Number(form.unit_cost) : null,
        p_reference_type: "manual_adjustment", p_reference_id: null, p_notes: form.notes || null,
        p_idempotency_key: `manual:${organizationId}:${crypto.randomUUID()}`,
      });
      if (movementError) throw movementError;
      setForm((current) => ({ ...current, quantity: "", unit_cost: "", notes: "" })); await load();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Não foi possível registrar a movimentação.";
      setError(message.includes("insufficient_stock") ? "Saldo insuficiente. O estoque negativo está bloqueado pelas regras da empresa." : message);
    } finally { setSaving(false); }
  };

  const productLabel = Object.fromEntries(products.map((item) => [item.id, item.label]));
  const warehouseLabel = Object.fromEntries(warehouses.map((item) => [item.id, item.label]));

  return <main className="mx-auto max-w-[1520px] px-4 py-5 lg:px-7 lg:py-6">
    <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="mb-1 text-[11px] font-bold uppercase tracking-[.14em] text-[var(--brand)]">Fase 3 • Suprimentos e estoque</p><h1 className="text-2xl font-bold tracking-[-.025em]">Estoque em tempo real</h1><p className="mt-1 text-sm text-[var(--ink-muted)]">Saldos, reservas, custo médio e razão imutável de movimentações.</p></div>
      <button onClick={() => void load()} className="inline-flex h-10 items-center justify-center gap-2 border border-[var(--line)] px-4 text-sm font-semibold"><RefreshCw size={16} />Atualizar saldos</button>
    </div>
    {error && <div className="mb-4 flex items-start justify-between gap-4 border border-[#e9b3ad] bg-[#fff3f1] px-4 py-3 text-xs text-[var(--danger)]" role="alert"><span>{error}</span><button onClick={() => setError(null)}><X size={15} /></button></div>}
    <section className="grid gap-px border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Valor em estoque" value={currency(metrics.value)} helper="Quantidade × custo médio" />
      <Metric label="Saldo físico" value={number(metrics.units)} helper="Em todas as unidades" />
      <Metric label="Reservado para OS" value={number(metrics.reserved)} helper="Não disponível para venda" />
      <Metric label="Abaixo da reposição" value={String(metrics.low)} helper="Itens que exigem atenção" danger={metrics.low > 0} />
    </section>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_360px]">
      <section className="min-w-0 border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><h2 className="font-bold">Posição por depósito</h2><p className="mt-0.5 text-xs text-[var(--ink-muted)]">Disponível = saldo físico − reservas ativas</p></div><Boxes size={19} className="text-[var(--brand)]" /></div>
        {loading ? <div className="grid min-h-72 place-items-center"><LoaderCircle className="animate-spin text-[var(--brand)]" /></div> : positions.length ? <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-xs"><thead className="bg-[var(--surface-muted)] text-[10px] uppercase tracking-[.06em] text-[var(--ink-muted)]"><tr><th className="px-4 py-3">Produto</th><th className="px-4 py-3">Depósito</th><th className="px-4 py-3 text-right">Físico</th><th className="px-4 py-3 text-right">Reservado</th><th className="px-4 py-3 text-right">Disponível</th><th className="px-4 py-3 text-right">Custo médio</th><th className="px-4 py-3 text-right">Sugestão</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{positions.map((item) => <tr key={`${item.warehouse_id}:${item.product_id}`} className="hover:bg-[var(--surface-muted)]"><td className="px-4 py-3"><span className="font-bold">{item.product_name}</span><span className="mt-0.5 block text-[10px] text-[var(--ink-muted)]">{item.sku}</span></td><td className="px-4 py-3">{item.warehouse_name}</td><td className="px-4 py-3 text-right">{number(item.on_hand)} {item.unit}</td><td className="px-4 py-3 text-right">{number(item.reserved)}</td><td className={`px-4 py-3 text-right font-bold ${Number(item.available) <= Number(item.minimum_stock) ? "text-[var(--danger)]" : "text-[var(--brand)]"}`}>{number(item.available)}</td><td className="px-4 py-3 text-right">{currency(item.average_cost)}</td><td className="px-4 py-3 text-right">{Number(item.suggested_purchase) > 0 ? number(item.suggested_purchase) : "—"}</td></tr>)}</tbody></table></div> : <div className="grid min-h-72 place-items-center px-6 text-center"><div><Boxes className="mx-auto text-[var(--ink-muted)]" /><p className="mt-3 text-sm font-bold">Nenhum saldo registrado</p><p className="mt-1 text-xs text-[var(--ink-muted)]">Cadastre um produto e registre a primeira entrada.</p></div></div>}
      </section>
      <form onSubmit={submit} className="h-fit border border-[var(--line)] bg-[var(--surface)]">
        <div className="border-b border-[var(--line)] px-5 py-4"><h2 className="font-bold">Movimentação manual</h2><p className="mt-0.5 text-xs text-[var(--ink-muted)]">A operação é transacional e auditada.</p></div>
        <div className="space-y-4 p-5"><Select label="Produto" value={form.product_id} required options={products} onChange={(value) => setForm({ ...form, product_id: value })} /><Select label="Depósito" value={form.warehouse_id} required options={warehouses} onChange={(value) => setForm({ ...form, warehouse_id: value })} /><label className="block text-xs font-bold">Tipo<select value={form.movement_type} onChange={(event) => setForm({ ...form, movement_type: event.target.value })} className="mt-2 h-10 w-full border border-[var(--line-strong)] bg-white px-3 text-sm">{movementOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><Input label="Quantidade" type="number" value={form.quantity} required onChange={(value) => setForm({ ...form, quantity: value })} /><Input label="Custo unitário" type="number" value={form.unit_cost} onChange={(value) => setForm({ ...form, unit_cost: value })} /></div><label className="block text-xs font-bold">Observação<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="mt-2 h-20 w-full border border-[var(--line-strong)] p-3 text-sm" /></label><button disabled={saving || !form.product_id || !form.warehouse_id} className="inline-flex h-10 w-full items-center justify-center gap-2 bg-[var(--brand)] px-4 text-sm font-bold text-white disabled:opacity-50">{saving ? <LoaderCircle size={16} className="animate-spin" /> : form.movement_type.endsWith("in") || form.movement_type === "customer_return" ? <ArrowDownToLine size={16} /> : <ArrowUpFromLine size={16} />}Registrar movimentação</button></div>
      </form>
    </div>
    <section className="mt-5 border border-[var(--line)] bg-[var(--surface)]"><div className="border-b border-[var(--line)] px-5 py-4"><h2 className="font-bold">Últimas movimentações</h2></div><div className="divide-y divide-[var(--line)]">{movements.length ? movements.map((item) => <article key={item.id} className="grid gap-2 px-5 py-3 text-xs sm:grid-cols-[1fr_180px_110px_130px] sm:items-center"><div><p className="font-bold">{productLabel[item.product_id] ?? "Produto"}</p><p className="mt-0.5 text-[10px] text-[var(--ink-muted)]">{item.notes || item.movement_type.replaceAll("_", " ")}</p></div><span className="text-[var(--ink-muted)]">{warehouseLabel[item.warehouse_id] ?? "Depósito"}</span><span className={`font-bold ${item.direction > 0 ? "text-[var(--brand)]" : "text-[var(--danger)]"}`}>{item.direction > 0 ? "+" : "−"}{number(item.quantity)}</span><time className="text-[var(--ink-muted)]">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.created_at))}</time></article>) : <p className="p-6 text-center text-xs text-[var(--ink-muted)]">Nenhuma movimentação registrada.</p>}</div></section>
  </main>;
}

function Metric({ label, value, helper, danger }: { label: string; value: string; helper: string; danger?: boolean }) { return <article className="bg-[var(--surface)] p-5"><p className="text-xs font-semibold text-[var(--ink-muted)]">{label}</p><p className={`mt-3 text-2xl font-bold ${danger ? "text-[var(--danger)]" : ""}`}>{value}</p><p className="mt-2 flex items-center gap-1 text-[11px] text-[var(--ink-muted)]">{danger && <AlertTriangle size={12} />}{helper}</p></article>; }
function Select({ label, value, options, onChange, required }: { label: string; value: string; options: Option[]; onChange: (value: string) => void; required?: boolean }) { return <label className="block text-xs font-bold">{label}<select required={required} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-10 w-full border border-[var(--line-strong)] bg-white px-3 text-sm"><option value="">Selecione</option>{options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>; }
function Input({ label, value, onChange, type, required }: { label: string; value: string; onChange: (value: string) => void; type: string; required?: boolean }) { return <label className="block text-xs font-bold">{label}<input required={required} min="0" step="0.001" type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-10 w-full border border-[var(--line-strong)] px-3 text-sm" /></label>; }
function currency(value: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0); }
function number(value: number) { return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(Number(value) || 0); }
