import type { Metadata } from "next";
import Link from "next/link";
import { OnboardingForm } from "@/components/onboarding-form";

export const metadata: Metadata = { title: "Configuração inicial" };

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-[var(--canvas)]">
      <header className="border-b border-[var(--line)] bg-[var(--surface)]"><div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5"><Link href="/" className="text-sm font-bold tracking-tight">MOTORA <span className="font-normal text-[var(--ink-muted)]">ERP</span></Link><span className="text-xs font-semibold text-[var(--ink-muted)]">Configuração inicial</span></div></header>
      <div className="mx-auto grid max-w-5xl gap-8 px-5 py-8 lg:grid-cols-[220px_1fr] lg:py-12">
        <aside><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[var(--brand)]">Etapa 1 de 5</p><h1 className="mt-2 text-2xl font-bold tracking-[-.03em]">Cadastre a operação</h1><p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">Crie a empresa e a primeira filial. A separação de dados e permissões será aplicada automaticamente.</p><ol className="mt-8 space-y-4 text-xs"><Step current number="01" label="Empresa e filial" /><Step number="02" label="Horários" /><Step number="03" label="Equipe" /><Step number="04" label="Serviços" /><Step number="05" label="Revisão" /></ol></aside>
        <section className="border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-8"><div className="border-b border-[var(--line)] pb-5"><h2 className="text-base font-bold">Dados principais</h2><p className="mt-1 text-xs text-[var(--ink-muted)]">Campos obrigatórios para criar o ambiente multiempresa.</p></div><OnboardingForm /></section>
      </div>
    </main>
  );
}

function Step({ number, label, current = false }: { number: string; label: string; current?: boolean }) { return <li className={`flex items-center gap-3 ${current ? "font-bold text-[var(--ink)]" : "text-[var(--ink-muted)]"}`}><span className={`grid size-7 place-items-center rounded-full border ${current ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-[var(--line-strong)]"}`}>{number}</span>{label}</li>; }
