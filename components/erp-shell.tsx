"use client";

import { Banknote, BarChart3, Bot, Boxes, Building2, CalendarDays, CarFront, ClipboardCheck, FileText, KeyRound, Landmark, PackageSearch, Plus, ReceiptText, ShieldCheck, ShoppingCart, Target, Truck, Users, WalletCards, Wrench } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/client";

const modules = [
  { href: "/painel-oficina", label: "Painel da oficina", description: "Quadro em tempo real por status", icon: Wrench },
  { href: "/clientes", label: "Clientes", description: "Cadastro e relacionamento", icon: Users },
  { href: "/veiculos", label: "Veículos", description: "Histórico e quilometragem", icon: CarFront },
  { href: "/agenda", label: "Agenda", description: "Compromissos da oficina", icon: CalendarDays },
  { href: "/recepcao", label: "Recepção", description: "Check-in do veículo", icon: ClipboardCheck },
  { href: "/inspecoes", label: "Inspeções", description: "Checklists técnicos", icon: ShieldCheck },
  { href: "/orcamentos", label: "Orçamentos", description: "Propostas e aprovações", icon: FileText },
  { href: "/ordens", label: "Ordens de serviço", description: "Kanban operacional", icon: Wrench },
  { href: "/produtos", label: "Produtos e peças", description: "Catálogo, preço e reposição", icon: PackageSearch },
  { href: "/estoque", label: "Estoque", description: "Saldos, reservas e movimentos", icon: Boxes },
  { href: "/fornecedores", label: "Fornecedores", description: "Condições e prazos", icon: Truck },
  { href: "/compras", label: "Compras", description: "Pedidos e recebimentos", icon: ShoppingCart },
  { href: "/contas-receber", label: "Contas a receber", description: "Títulos, parcelas e vencimentos", icon: ReceiptText },
  { href: "/contas-pagar", label: "Contas a pagar", description: "Despesas e fornecedores", icon: Banknote },
  { href: "/fluxo-caixa", label: "Fluxo de caixa", description: "Entradas, saídas e projeção", icon: Landmark },
  { href: "/caixa", label: "Caixa", description: "Abertura, sangria e fechamento", icon: WalletCards },
  { href: "/crm", label: "CRM avançado", description: "Recorrência, inatividade e relacionamento", icon: Target },
  { href: "/garantias", label: "Garantias", description: "Cobertura e retornos controlados", icon: ShieldCheck },
  { href: "/frotas", label: "Frotas", description: "Contratos, limites e fechamento", icon: Building2 },
  { href: "/automacoes", label: "Automações", description: "Pós-venda com consentimento", icon: Bot },
  { href: "/portal-acessos", label: "Portal do cliente", description: "Links temporários e seguros", icon: KeyRound },
  { href: "/bi", label: "BI", description: "Indicadores consolidados da oficina", icon: BarChart3 },
];

type Metrics = {
  customers: number | null;
  appointments: number | null;
  workOrders: number | null;
  estimates: number | null;
  lowStock: number | null;
  purchases: number | null;
  receivableOpen: number | null;
  payableOpen: number | null;
  accountBalance: number | null;
};

export function ErpShell() {
  const [metrics, setMetrics] = useState<Metrics>({ customers: null, appointments: null, workOrders: null, estimates: null, lowStock: null, purchases: null, receivableOpen: null, payableOpen: null, accountBalance: null });
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase.from("profiles").select("last_organization_id,last_branch_id").eq("id", user.id).single();
        if (!profile?.last_organization_id || !profile.last_branch_id) return;
        const org = profile.last_organization_id; const branch = profile.last_branch_id;
        const [customers, appointments, orders, estimates, stock, purchases, financial] = await Promise.all([
          supabase.from("customers").select("id", { count: "exact", head: true }).eq("organization_id", org).is("deleted_at", null),
          supabase.from("appointments").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("branch_id", branch).gte("starts_at", new Date().toISOString()).is("deleted_at", null),
          supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("branch_id", branch).not("status", "in", "(delivered,cancelled)").is("deleted_at", null),
          supabase.from("estimates").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("branch_id", branch).in("status", ["sent", "viewed", "partially_approved"]).is("deleted_at", null),
          supabase.from("inventory_position").select("available,reorder_point").eq("organization_id", org).eq("branch_id", branch),
          supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("branch_id", branch).in("status", ["pending_approval", "approved", "sent", "partial"]).is("deleted_at", null),
          supabase.from("financial_overview").select("receivable_open,payable_open,account_balance").eq("organization_id", org).eq("branch_id", branch).maybeSingle(),
        ]);
        setMetrics({
          customers: customers.count ?? 0,
          appointments: appointments.count ?? 0,
          workOrders: orders.count ?? 0,
          estimates: estimates.count ?? 0,
          lowStock: (stock.data ?? []).filter((item) => Number(item.available) <= Number(item.reorder_point)).length,
          purchases: purchases.count ?? 0,
          receivableOpen: Number(financial.data?.receivable_open ?? 0),
          payableOpen: Number(financial.data?.payable_open ?? 0),
          accountBalance: Number(financial.data?.account_balance ?? 0),
        });
        setConnected(true);
      } catch { setConnected(false); }
    };
    void load();
  }, []);

  const cards = [
    ["Clientes ativos", metrics.customers, "Base da empresa"],
    ["Próximos agendamentos", metrics.appointments, "A partir de agora"],
    ["Ordens em andamento", metrics.workOrders, "Exceto entregues e canceladas"],
    ["Aprovações pendentes", metrics.estimates, "Orçamentos enviados"],
    ["Reposições necessárias", metrics.lowStock, "Disponível abaixo do ponto"],
    ["Compras em aberto", metrics.purchases, "Aprovação, envio ou recebimento"],
  ] as const;

  const financialCards = [
    ["Recebimentos em aberto", metrics.receivableOpen, "Saldo restante de clientes"],
    ["Pagamentos em aberto", metrics.payableOpen, "Saldo restante de fornecedores"],
    ["Saldo das contas", metrics.accountBalance, "Disponibilidade financeira atual"],
  ] as const;

  const formatCurrency = (value: number | null) => value === null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  return <AppShell><main className="mx-auto max-w-[1520px] px-4 py-5 lg:px-7 lg:py-6">
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="mb-1 text-[11px] font-bold uppercase tracking-[.14em] text-[var(--brand)]">Oficina em operação</p><h1 className="text-2xl font-bold tracking-[-.025em]">Visão geral da oficina</h1><p className="mt-1 text-sm text-[var(--ink-muted)]">Veja atendimento, estoque, financeiro e clientes em um só lugar.</p></div><Link href="/recepcao" className="inline-flex h-11 items-center justify-center gap-2 bg-[var(--brand)] px-4 text-sm font-bold text-white sm:h-10"><Plus size={17} />Nova entrada</Link></div>

    {!connected && <div className="mb-5 border border-[#d9c48c] bg-[#fff9e8] px-4 py-3 text-xs text-[#7b5a00]"><strong>Configuração necessária:</strong> conecte o Supabase para carregar indicadores e persistir os registros.</div>}

    <section className="grid gap-px border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-6">{cards.map(([label, value, helper]) => <article key={label} className="bg-[var(--surface)] p-5"><p className="text-xs font-semibold text-[var(--ink-muted)]">{label}</p><p className="mt-3 text-2xl font-bold">{value ?? "—"}</p><p className="mt-2 text-[11px] text-[var(--ink-muted)]">{helper}</p></article>)}</section>

    <section className="mt-5 grid gap-px border border-[var(--line)] bg-[var(--line)] md:grid-cols-3">{financialCards.map(([label, value, helper]) => <article key={label} className="bg-[var(--surface)] p-5"><p className="text-xs font-semibold text-[var(--ink-muted)]">{label}</p><p className="mt-3 text-2xl font-bold">{formatCurrency(value)}</p><p className="mt-2 text-[11px] text-[var(--ink-muted)]">{helper}</p></article>)}</section>

    <section className="mt-5 border border-[var(--line)] bg-[var(--surface)]"><div className="border-b border-[var(--line)] px-5 py-4"><h2 className="font-bold">Operação integrada</h2><p className="mt-0.5 text-xs text-[var(--ink-muted)]">Atendimento, oficina, suprimentos, financeiro e pós-venda no mesmo fluxo</p></div><div className="grid sm:grid-cols-2 xl:grid-cols-4">{modules.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className="group border-b border-r border-[var(--line)] p-5 transition hover:bg-[var(--surface-muted)]"><div className="grid size-9 place-items-center bg-[var(--brand-soft)] text-[var(--brand)]"><Icon size={18} /></div><h3 className="mt-4 text-sm font-bold group-hover:text-[var(--brand)]">{item.label}</h3><p className="mt-1 text-xs text-[var(--ink-muted)]">{item.description}</p></Link>; })}</div></section>
  </main></AppShell>;
}
