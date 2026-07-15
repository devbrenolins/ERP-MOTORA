import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { OperationalModule } from "@/components/operational-module";
import { StockModule } from "@/components/stock-module";
import { CashModule } from "@/components/cash-module";
import { FinanceDashboard } from "@/components/finance-dashboard";
import { PaymentsModule } from "@/components/payments-module";
import { BiDashboard, CrmDashboard } from "@/components/advanced-dashboard";
import { PortalAccessManager } from "@/components/portal-access-manager";
import { WarrantyClaims } from "@/components/warranty-claims";
import { AuditModule } from "@/components/audit-module";
import { NotificationsModule } from "@/components/notification-center";
import { PrivacyModule } from "@/components/privacy-module";
import { SettingsModule } from "@/components/settings-module";
import { RolesModule } from "@/components/roles-module";
import { phaseTwoModules } from "@/lib/phase-two-modules";
import { phaseThreeModules } from "@/lib/phase-three-modules";
import { phaseFourModules } from "@/lib/phase-four-modules";
import { phaseFiveModules } from "@/lib/phase-five-modules";

const modules = { ...phaseTwoModules, ...phaseThreeModules, ...phaseFourModules, ...phaseFiveModules };

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }): Promise<Metadata> {
  const { module } = await params;
  const titles: Record<string,string> = { estoque: "Estoque", pagamentos: "Pagamentos", "fluxo-caixa": "Fluxo de caixa", caixa: "Caixa", relatorios: "Relatórios financeiros", crm:"CRM", bi:"BI da oficina", "portal-acessos":"Portal do cliente", "retornos-garantia":"Retornos em garantia", notificacoes:"Notificações", auditoria:"Auditoria", configuracoes:"Configurações", privacidade:"Privacidade e LGPD", perfis:"Cargos e acessos" };
  return { title: titles[module] ?? modules[module]?.title ?? "Operação" };
}

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (module === "estoque") return <AppShell><StockModule /></AppShell>;
  if (module === "pagamentos") return <AppShell><PaymentsModule /></AppShell>;
  if (module === "fluxo-caixa") return <AppShell><FinanceDashboard mode="flow" /></AppShell>;
  if (module === "relatorios") return <AppShell><FinanceDashboard mode="reports" /></AppShell>;
  if (module === "caixa") return <AppShell><CashModule /></AppShell>;
  if (module === "crm") return <AppShell><CrmDashboard /></AppShell>;
  if (module === "bi") return <AppShell><BiDashboard /></AppShell>;
  if (module === "portal-acessos") return <AppShell><PortalAccessManager /></AppShell>;
  if (module === "retornos-garantia") return <AppShell><WarrantyClaims /></AppShell>;
  if (module === "notificacoes") return <AppShell><NotificationsModule /></AppShell>;
  if (module === "auditoria") return <AppShell><AuditModule /></AppShell>;
  if (module === "configuracoes") return <AppShell><SettingsModule /></AppShell>;
  if (module === "privacidade") return <AppShell><PrivacyModule /></AppShell>;
  if (module === "perfis") return <AppShell><RolesModule /></AppShell>;
  const config = modules[module];
  if (!config) notFound();
  return <AppShell><OperationalModule config={config} /></AppShell>;
}
