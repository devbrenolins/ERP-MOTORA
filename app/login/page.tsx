import type { Metadata } from "next";
import { Wrench } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";
import { PasswordResetForm } from "@/components/password-reset-form";

type LoginPageProps = { searchParams: Promise<{ mode?: string }> };

export async function generateMetadata({ searchParams }: LoginPageProps): Promise<Metadata> {
  const mode = (await searchParams).mode;
  return { title: mode === "recover" ? "Recuperar senha" : mode === "reset" ? "Redefinir senha" : "Entrar" };
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const mode = (await searchParams).mode;
  const isRecovery = mode === "recover";
  const isReset = mode === "reset";
  return (
    <main className="grid min-h-screen bg-[var(--surface)] lg:grid-cols-[1fr_1.12fr]">
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[390px]">
          <div className="mb-10 flex items-center gap-3"><span className="grid size-10 place-items-center bg-[var(--brand)] text-white"><Wrench size={19} /></span><div><p className="text-base font-bold tracking-tight">MOTORA</p><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[var(--ink-muted)]">ERP Automotivo</p></div></div>
          <h1 className="text-2xl font-bold tracking-[-.03em]">{isRecovery ? "Recuperar senha" : isReset ? "Criar nova senha" : "Acesse sua oficina"}</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">{isRecovery ? "Enviaremos um link temporário para o e-mail cadastrado." : isReset ? "Use uma senha exclusiva com pelo menos oito caracteres." : "Entre com as credenciais vinculadas à sua empresa."}</p>
          {isRecovery ? <PasswordRecoveryForm /> : isReset ? <PasswordResetForm /> : <LoginForm />}
          <p className="mt-8 text-center text-xs text-[var(--ink-muted)]">O acesso é protegido e todas as ações relevantes são auditadas.</p>
        </div>
      </section>
      <aside className="hidden min-h-screen bg-[var(--sidebar)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#94aaa5]"><span className="size-2 rounded-full bg-[#5bc6b6]" />Ambiente seguro e isolado por empresa</div>
        <div className="max-w-xl"><p className="text-sm font-semibold uppercase tracking-[.15em] text-[#72c3b6]">Operação integrada</p><h2 className="mt-4 text-4xl font-bold leading-tight tracking-[-.035em]">Da recepção do veículo ao fechamento financeiro.</h2><p className="mt-5 max-w-lg text-base leading-7 text-[#a9bab6]">Uma base única para atendimento, equipe, ordens, estoque, caixa e relacionamento com o cliente.</p></div>
        <div className="grid grid-cols-3 gap-px border border-white/10 bg-white/10"><Feature title="Multiempresa" text="Dados isolados" /><Feature title="RBAC" text="Acesso por ação" /><Feature title="Auditoria" text="Histórico imutável" /></div>
      </aside>
    </main>
  );
}

function Feature({ title, text }: { title: string; text: string }) { return <div className="bg-[var(--sidebar)] p-4"><p className="text-xs font-bold">{title}</p><p className="mt-1 text-[11px] text-[#94aaa5]">{text}</p></div>; }
