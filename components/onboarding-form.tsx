"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";

const schema = z.object({
  organizationName: z.string().trim().min(2, "Informe o nome da empresa."),
  legalName: z.string().trim().min(2, "Informe a razão social."),
  taxId: z.string().trim().min(11, "Informe um CPF ou CNPJ válido."),
  branchName: z.string().trim().min(2, "Informe o nome da filial."),
  branchCode: z.string().trim().min(2).max(10).regex(/^[A-Za-z0-9_-]+$/, "Use apenas letras, números, _ ou -."),
  timezone: z.string().min(1),
});
type Values = z.infer<typeof schema>;

export function OnboardingForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { timezone: "America/Bahia", branchCode: "MATRIZ" } });

  const onSubmit = async (values: Values) => {
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("complete_onboarding", {
        p_organization_name: values.organizationName,
        p_legal_name: values.legalName,
        p_tax_id: values.taxId.replace(/\D/g, ""),
        p_branch_name: values.branchName,
        p_branch_code: values.branchCode.toUpperCase(),
        p_timezone: values.timezone,
      });
      if (error) throw error;
      router.replace("/");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error && error.message === "Supabase não configurado." ? "Configure o Supabase para salvar os dados." : "Não foi possível concluir o cadastro. Revise os dados e tente novamente.");
    }
  };

  const fieldClass = "mt-2 h-11 w-full border border-[var(--line-strong)] bg-[var(--surface)] px-3 outline-none focus:border-[var(--brand)]";
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-7" noValidate>
      <fieldset className="grid gap-5 sm:grid-cols-2"><legend className="sr-only">Dados da empresa</legend>
        <Field label="Nome da empresa" error={errors.organizationName?.message}><input className={fieldClass} placeholder="Oficina Central" {...register("organizationName")} /></Field>
        <Field label="Razão social" error={errors.legalName?.message}><input className={fieldClass} placeholder="Oficina Central Ltda." {...register("legalName")} /></Field>
        <Field label="CPF ou CNPJ" error={errors.taxId?.message}><input inputMode="numeric" className={fieldClass} placeholder="00.000.000/0001-00" {...register("taxId")} /></Field>
      </fieldset>
      <div className="border-t border-[var(--line)] pt-6"><h3 className="text-sm font-bold">Primeira filial</h3><div className="mt-4 grid gap-5 sm:grid-cols-2">
        <Field label="Nome da filial" error={errors.branchName?.message}><input className={fieldClass} placeholder="Matriz" {...register("branchName")} /></Field>
        <Field label="Código interno" error={errors.branchCode?.message}><input className={fieldClass} {...register("branchCode")} /></Field>
        <Field label="Fuso horário" error={errors.timezone?.message}><select className={fieldClass} {...register("timezone")}><option value="America/Bahia">Bahia</option><option value="America/Sao_Paulo">São Paulo</option><option value="America/Manaus">Manaus</option><option value="America/Belem">Belém</option></select></Field>
      </div></div>
      {message && <div role="alert" className="border border-[#f0b4ae] bg-[#fff2f0] px-3 py-2.5 text-xs text-[var(--danger)]">{message}</div>}
      <div className="flex flex-col-reverse gap-3 border-t border-[var(--line)] pt-6 sm:flex-row sm:justify-end"><Link href="/" className="inline-flex h-10 items-center justify-center border border-[var(--line-strong)] px-4 text-sm font-semibold">Cancelar</Link><button type="submit" disabled={isSubmitting} className="inline-flex h-10 items-center justify-center gap-2 bg-[var(--brand)] px-5 text-sm font-bold text-white hover:bg-[var(--brand-strong)] disabled:opacity-70">{isSubmitting && <LoaderCircle size={16} className="animate-spin" />}Criar ambiente</button></div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactElement }) { return <label className="text-xs font-bold">{label}<span className="ml-1 text-[var(--danger)]">*</span>{children}{error && <span className="mt-1.5 block font-normal text-[var(--danger)]">{error}</span>}</label>; }
