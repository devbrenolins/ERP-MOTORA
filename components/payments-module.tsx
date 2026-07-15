"use client";

import { CircleDollarSign, LoaderCircle, RefreshCw } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SearchableSelect } from "@/components/searchable-select";

type Title = { id: string; number: string; description: string; outstanding_amount: number; due_date: string; kind: "receivable" | "payable" };
type Option = { id: string; label: string };

export function PaymentsModule() {
  const [titles, setTitles] = useState<Title[]>([]);
  const [accounts, setAccounts] = useState<Option[]>([]);
  const [methods, setMethods] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({ kind: "receivable", title_id: "", account_id: "", method_id: "", amount: "", notes: "" });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sua sessão expirou.");
      const { data: profile } = await supabase.from("profiles").select("last_organization_id,last_branch_id").eq("id", user.id).single();
      if (!profile?.last_organization_id || !profile.last_branch_id) throw new Error("Conclua o onboarding.");
      const [receivables, payables, accountResult, methodResult] = await Promise.all([
        supabase.from("receivables").select("id,number,description,outstanding_amount,due_date").eq("organization_id", profile.last_organization_id).eq("branch_id", profile.last_branch_id).in("status", ["open", "overdue", "partial"]).is("deleted_at", null).order("due_date"),
        supabase.from("payables").select("id,number,description,outstanding_amount,due_date").eq("organization_id", profile.last_organization_id).eq("branch_id", profile.last_branch_id).in("status", ["open", "overdue", "partial", "approved"]).is("deleted_at", null).order("due_date"),
        supabase.from("financial_accounts").select("id,code,name").eq("organization_id", profile.last_organization_id).eq("branch_id", profile.last_branch_id).eq("active", true).is("deleted_at", null),
        supabase.from("payment_methods").select("id,code,name").eq("organization_id", profile.last_organization_id).eq("branch_id", profile.last_branch_id).eq("active", true).is("deleted_at", null),
      ]);
      const firstError = receivables.error ?? payables.error ?? accountResult.error ?? methodResult.error;
      if (firstError) throw firstError;
      setTitles([...(receivables.data ?? []).map((item) => ({ ...item, kind: "receivable" as const })), ...(payables.data ?? []).map((item) => ({ ...item, kind: "payable" as const }))]);
      setAccounts((accountResult.data ?? []).map((item) => ({ id: item.id, label: `${item.code} • ${item.name}` })));
      setMethods((methodResult.data ?? []).map((item) => ({ id: item.id, label: item.name })));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível carregar os pagamentos."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const filtered = useMemo(() => titles.filter((item) => item.kind === form.kind), [titles, form.kind]);
  const selected = filtered.find((item) => item.id === form.title_id);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null); setSuccess(null);
    try {
      const amount = Number(form.amount);
      if (!amount || amount <= 0) throw new Error("Informe um valor válido.");
      if (selected && amount > Number(selected.outstanding_amount)) throw new Error("O valor não pode superar o saldo do título.");
      const supabase = createClient();
      const { error: rpcError } = form.kind === "receivable"
        ? await supabase.rpc("settle_receivable", { p_receivable_id: form.title_id, p_amount: amount, p_account_id: form.account_id, p_payment_method_id: form.method_id, p_paid_at: new Date().toISOString(), p_notes: form.notes || null })
        : await supabase.rpc("settle_payable", { p_payable_id: form.title_id, p_amount: amount, p_account_id: form.account_id, p_payment_method_id: form.method_id, p_paid_at: new Date().toISOString(), p_notes: form.notes || null });
      if (rpcError) throw rpcError;
      setSuccess(form.kind === "receivable" ? "Recebimento registrado com sucesso." : "Pagamento registrado com sucesso.");
      setForm((current) => ({ ...current, title_id: "", amount: "", notes: "" })); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível registrar o pagamento."); }
    finally { setSaving(false); }
  };

  return <main className="mx-auto max-w-[1120px] px-4 py-5 lg:px-7 lg:py-6">
    <div className="mb-5 flex items-start justify-between"><div><p className="mb-1 text-[11px] font-bold uppercase tracking-[.14em] text-[var(--brand)]">Financeiro</p><h1 className="text-2xl font-bold">Pagamentos e recebimentos</h1><p className="mt-1 text-sm text-[var(--ink-muted)]">Registre o valor pago ou recebido. O caixa é atualizado automaticamente.</p></div><button onClick={() => void load()} className="grid size-10 place-items-center border border-[var(--line)]"><RefreshCw size={16} /></button></div>
    {error && <div className="mb-4 border border-[#e9b3ad] bg-[#fff3f1] px-4 py-3 text-xs text-[var(--danger)]">{error}</div>}
    {success && <div className="mb-4 border border-[#a9d8cf] bg-[var(--brand-soft)] px-4 py-3 text-xs text-[var(--brand)]">{success}</div>}
    {loading ? <div className="grid min-h-72 place-items-center"><LoaderCircle className="animate-spin text-[var(--brand)]" /></div> : <form onSubmit={submit} className="border border-[var(--line)] bg-[var(--surface)]">
      <div className="border-b border-[var(--line)] px-5 py-4"><h2 className="flex items-center gap-2 font-bold"><CircleDollarSign size={18} className="text-[var(--brand)]" />Nova baixa</h2></div>
      <div className="grid gap-5 p-5 md:grid-cols-2">
        <SearchableSelect label="Operação" value={form.kind} options={[{ id: "receivable", label: "Recebimento" }, { id: "payable", label: "Pagamento" }]} onChange={(value) => setForm({ ...form, kind: value, title_id: "", amount: "" })} />
        <SearchableSelect label="Conta a pagar ou receber" value={form.title_id} options={filtered.map((item) => ({ id: item.id, label: `${item.number} • ${item.description} • ${money(item.outstanding_amount)}` }))} onChange={(value) => { const item = filtered.find((entry) => entry.id === value); setForm({ ...form, title_id: value, amount: item ? String(item.outstanding_amount) : "" }); }} />
        <SearchableSelect label="Conta financeira" value={form.account_id} options={accounts} onChange={(value) => setForm({ ...form, account_id: value })} />
        <SearchableSelect label="Forma de pagamento" value={form.method_id} options={methods} onChange={(value) => setForm({ ...form, method_id: value })} />
        <label className="text-xs font-bold">Valor<input required min="0.01" step="0.01" type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="mt-2 h-10 w-full border border-[var(--line-strong)] px-3 text-sm" /></label>
        <label className="text-xs font-bold">Observação<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="mt-2 h-10 w-full border border-[var(--line-strong)] px-3 text-sm" /></label>
      </div>
      <div className="flex justify-end border-t border-[var(--line)] p-4"><button disabled={saving || !form.title_id || !form.account_id || !form.method_id} className="inline-flex h-10 min-w-44 items-center justify-center gap-2 bg-[var(--brand)] px-4 text-sm font-bold text-white disabled:opacity-50">{saving && <LoaderCircle size={15} className="animate-spin" />}Confirmar baixa</button></div>
    </form>}
  </main>;
}

export function Select({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  return <label className="text-xs font-bold">{label}<select required value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-10 w-full border border-[var(--line-strong)] bg-white px-3 text-sm"><option value="">Selecione</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>;
}
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
