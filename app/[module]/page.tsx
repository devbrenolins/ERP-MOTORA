import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { OperationalModule } from "@/components/operational-module";
import { StockModule } from "@/components/stock-module";
import { CashModule } from "@/components/cash-module";
import { FinanceDashboard } from "@/components/finance-dashboard";
import { PaymentsModule } from "@/components/payments-module";
import { phaseTwoModules } from "@/lib/phase-two-modules";
import { phaseThreeModules } from "@/lib/phase-three-modules";
import { phaseFourModules } from "@/lib/phase-four-modules";

const modules = { ...phaseTwoModules, ...phaseThreeModules, ...phaseFourModules };
const specialModules = ["estoque", "pagamentos", "fluxo-caixa", "caixa", "relatorios"];

export function generateStaticParams() {
  return [...Object.keys(modules), ...specialModules].map((module) => ({ module }));
}

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }): Promise<Metadata> {
  const { module } = await params;
  const titles: Record<string,string> = { estoque: "Estoque", pagamentos: "Pagamentos", "fluxo-caixa": "Fluxo de caixa", caixa: "Caixa", relatorios: "Relatórios financeiros" };
  return { title: titles[module] ?? modules[module]?.title ?? "Operação" };
}

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (module === "estoque") return <AppShell><StockModule /></AppShell>;
  if (module === "pagamentos") return <AppShell><PaymentsModule /></AppShell>;
  if (module === "fluxo-caixa") return <AppShell><FinanceDashboard mode="flow" /></AppShell>;
  if (module === "relatorios") return <AppShell><FinanceDashboard mode="reports" /></AppShell>;
  if (module === "caixa") return <AppShell><CashModule /></AppShell>;
  const config = modules[module];
  if (!config) notFound();
  return <AppShell><OperationalModule config={config} /></AppShell>;
}
