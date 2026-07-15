"use client";

import { ArrowDown, ArrowUp, BarChart3, LoaderCircle, RefreshCw, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Overview = { receivable_open: number; receivable_overdue: number; payable_open: number; account_balance: number };
type Day = { movement_date: string; inflow: number; outflow: number; net: number };
type Profit = { work_order_id: string; number: string; revenue: number; cost: number; gross_profit: number };

export function FinanceDashboard({ mode }: { mode: "flow" | "reports" }) {
  const [overview, setOverview] = useState<Overview | null>(null); const [days, setDays] = useState<Day[]>([]); const [profits, setProfits] = useState<Profit[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const supabase=createClient(); const { data:{user} }=await supabase.auth.getUser(); if(!user) throw new Error("Sua sessão expirou.");
      const {data:profile}=await supabase.from("profiles").select("last_organization_id,last_branch_id").eq("id",user.id).single();
      if(!profile?.last_organization_id||!profile.last_branch_id) throw new Error("Conclua o onboarding antes de usar o financeiro.");
      const [summary,flow,profit]=await Promise.all([
        supabase.from("financial_overview").select("*").eq("organization_id",profile.last_organization_id).eq("branch_id",profile.last_branch_id).single(),
        supabase.from("cash_flow_daily").select("*").eq("organization_id",profile.last_organization_id).eq("branch_id",profile.last_branch_id).order("movement_date",{ascending:false}).limit(31),
        supabase.from("work_order_profitability").select("work_order_id,number,revenue,cost,gross_profit").eq("organization_id",profile.last_organization_id).eq("branch_id",profile.last_branch_id).order("gross_profit",{ascending:false}).limit(25),
      ]);
      const first=summary.error??flow.error??profit.error; if(first) throw first;
      setOverview(summary.data as Overview); setDays(((flow.data??[]) as Day[]).reverse()); setProfits((profit.data??[]) as Profit[]);
    } catch(caught){setError(caught instanceof Error?caught.message:"Não foi possível carregar o financeiro.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[load]);
  const totals=useMemo(()=>({inflow:days.reduce((s,d)=>s+Number(d.inflow),0),outflow:days.reduce((s,d)=>s+Number(d.outflow),0)}),[days]);
  const max=Math.max(1,...days.map((day)=>Math.max(Number(day.inflow),Number(day.outflow))));
  return <main className="mx-auto max-w-[1520px] px-4 py-5 lg:px-7 lg:py-6">
    <div className="mb-5 flex items-start justify-between gap-4"><div><p className="mb-1 text-[11px] font-bold uppercase tracking-[.14em] text-[var(--brand)]">Financeiro</p><h1 className="text-2xl font-bold">{mode==="flow"?"Fluxo de caixa":"Relatórios financeiros"}</h1><p className="mt-1 text-sm text-[var(--ink-muted)]">{mode==="flow"?"Veja as entradas e saídas de cada filial.":"Compare vendas, custos e lucro de cada ordem de serviço."}</p></div><button onClick={()=>void load()} className="inline-flex h-10 items-center gap-2 border border-[var(--line)] px-4 text-sm font-semibold"><RefreshCw size={16}/>Atualizar</button></div>
    {error&&<div className="mb-4 border border-[#e9b3ad] bg-[#fff3f1] px-4 py-3 text-xs text-[var(--danger)]">{error}</div>}
    <section className="grid gap-px border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-4"><Metric label="Saldo das contas" value={money(overview?.account_balance)} icon={WalletCards}/><Metric label="A receber" value={money(overview?.receivable_open)} icon={ArrowDown}/><Metric label="Vencido" value={money(overview?.receivable_overdue)} icon={ArrowDown} danger/><Metric label="A pagar" value={money(overview?.payable_open)} icon={ArrowUp}/></section>
    {loading?<div className="grid min-h-80 place-items-center"><LoaderCircle className="animate-spin text-[var(--brand)]"/></div>:mode==="flow"?<>
      <section className="mt-5 border border-[var(--line)] bg-[var(--surface)]"><div className="border-b border-[var(--line)] px-5 py-4"><h2 className="font-bold">Movimento dos últimos 31 dias</h2><p className="mt-0.5 text-xs text-[var(--ink-muted)]">Entradas {money(totals.inflow)} • Saídas {money(totals.outflow)}</p></div><div className="flex h-64 items-end gap-1 overflow-x-auto p-5">{days.length?days.map((day)=><div key={day.movement_date} className="group flex min-w-8 flex-1 items-end justify-center gap-1" title={`${date(day.movement_date)} • Entradas ${money(day.inflow)} • Saídas ${money(day.outflow)}`}><div className="w-2 bg-[var(--brand)]" style={{height:`${Math.max(2,Number(day.inflow)/max*190)}px`}}/><div className="w-2 bg-[#d0685b]" style={{height:`${Math.max(2,Number(day.outflow)/max*190)}px`}}/></div>):<p className="m-auto text-xs text-[var(--ink-muted)]">Nenhuma movimentação no período.</p>}</div><div className="flex gap-5 border-t border-[var(--line)] px-5 py-3 text-xs"><span className="flex items-center gap-2"><i className="size-2 bg-[var(--brand)]"/>Entradas</span><span className="flex items-center gap-2"><i className="size-2 bg-[#d0685b]"/>Saídas</span></div></section>
      <Ledger days={days}/>
    </>:<ProfitTable rows={profits}/>}
  </main>;
}

function Metric({label,value,icon:Icon,danger}:{label:string;value:string;icon:typeof BarChart3;danger?:boolean}){return <article className="bg-[var(--surface)] p-5"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-[var(--ink-muted)]">{label}</p><Icon size={17} className={danger?"text-[var(--danger)]":"text-[var(--brand)]"}/></div><p className={`mt-3 text-2xl font-bold ${danger?"text-[var(--danger)]":""}`}>{value}</p></article>}
function Ledger({days}:{days:Day[]}){return <section className="mt-5 border border-[var(--line)] bg-[var(--surface)]"><div className="border-b border-[var(--line)] px-5 py-4"><h2 className="font-bold">Fluxo diário</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-xs"><thead className="bg-[var(--surface-muted)]"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3 text-right">Entradas</th><th className="px-4 py-3 text-right">Saídas</th><th className="px-4 py-3 text-right">Resultado</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{[...days].reverse().map(d=><tr key={d.movement_date}><td className="px-4 py-3 font-semibold">{date(d.movement_date)}</td><td className="px-4 py-3 text-right text-[var(--brand)]">{money(d.inflow)}</td><td className="px-4 py-3 text-right text-[var(--danger)]">{money(d.outflow)}</td><td className="px-4 py-3 text-right font-bold">{money(d.net)}</td></tr>)}</tbody></table></div></section>}
function ProfitTable({rows}:{rows:Profit[]}){return <section className="mt-5 border border-[var(--line)] bg-[var(--surface)]"><div className="border-b border-[var(--line)] px-5 py-4"><h2 className="font-bold">Lucratividade por ordem de serviço</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-[var(--surface-muted)]"><tr><th className="px-4 py-3">OS</th><th className="px-4 py-3 text-right">Receita</th><th className="px-4 py-3 text-right">Custo</th><th className="px-4 py-3 text-right">Lucro bruto</th><th className="px-4 py-3 text-right">Margem</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{rows.length?rows.map(r=><tr key={r.work_order_id}><td className="px-4 py-3 font-bold">OS {r.number}</td><td className="px-4 py-3 text-right">{money(r.revenue)}</td><td className="px-4 py-3 text-right">{money(r.cost)}</td><td className="px-4 py-3 text-right font-bold text-[var(--brand)]">{money(r.gross_profit)}</td><td className="px-4 py-3 text-right">{Number(r.revenue)?new Intl.NumberFormat("pt-BR",{style:"percent",maximumFractionDigits:1}).format(Number(r.gross_profit)/Number(r.revenue)):"—"}</td></tr>):<tr><td colSpan={5} className="p-8 text-center text-[var(--ink-muted)]">Nenhuma ordem com valores registrada.</td></tr>}</tbody></table></div></section>}
const money=(value?:number|null)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value)||0);
const date=(value:string)=>new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
