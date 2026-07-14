import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { OperationalModule } from "@/components/operational-module";
import { phaseTwoModules } from "@/lib/phase-two-modules";

export function generateStaticParams() {
  return Object.keys(phaseTwoModules).map((module) => ({ module }));
}

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }): Promise<Metadata> {
  const { module } = await params;
  return { title: phaseTwoModules[module]?.title ?? "Operação" };
}

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const config = phaseTwoModules[module];
  if (!config) notFound();
  return <AppShell><OperationalModule config={config} /></AppShell>;
}
