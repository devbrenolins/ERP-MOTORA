import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { OperationalModule } from "@/components/operational-module";
import { StockModule } from "@/components/stock-module";
import { phaseTwoModules } from "@/lib/phase-two-modules";
import { phaseThreeModules } from "@/lib/phase-three-modules";

const modules = { ...phaseTwoModules, ...phaseThreeModules };

export function generateStaticParams() {
  return [...Object.keys(modules), "estoque"].map((module) => ({ module }));
}

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }): Promise<Metadata> {
  const { module } = await params;
  return { title: module === "estoque" ? "Estoque" : modules[module]?.title ?? "Operação" };
}

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (module === "estoque") return <AppShell><StockModule /></AppShell>;
  const config = modules[module];
  if (!config) notFound();
  return <AppShell><OperationalModule config={config} /></AppShell>;
}
