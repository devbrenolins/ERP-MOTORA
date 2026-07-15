import type { Metadata } from "next";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";

export const metadata:Metadata={title:"Recuperar senha"};
export default function RecoverPasswordPage(){return <main className="grid min-h-screen place-items-center bg-[var(--canvas)] px-4 py-10"><section className="w-full max-w-md border border-[var(--line)] bg-[var(--surface)] p-7 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[var(--brand)]">Acesso seguro</p><h1 className="mt-2 text-2xl font-bold">Recuperar senha</h1><p className="mt-2 text-sm text-[var(--ink-muted)]">Enviaremos um link temporário para o e-mail cadastrado.</p><PasswordRecoveryForm/></section></main>}
