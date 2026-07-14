"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";

const schema = z.object({
  email: z.email("Informe um e-mail válido."),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres."),
});
type Values = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    setServerError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword(values);
      if (error) throw error;
      router.replace("/");
      router.refresh();
    } catch (error) {
      setServerError(error instanceof Error && error.message === "Supabase não configurado." ? "Configure as variáveis do Supabase antes de entrar." : "E-mail ou senha inválidos.");
    }
  };

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div><label className="mb-2 block text-xs font-bold" htmlFor="email">E-mail</label><input id="email" type="email" autoComplete="email" className="h-11 w-full border border-[var(--line-strong)] bg-[var(--surface)] px-3 outline-none focus:border-[var(--brand)]" placeholder="voce@oficina.com.br" {...register("email")} />{errors.email && <p className="mt-1.5 text-xs text-[var(--danger)]">{errors.email.message}</p>}</div>
      <div><div className="mb-2 flex items-center justify-between"><label className="text-xs font-bold" htmlFor="password">Senha</label><a href="#" className="text-xs font-semibold text-[var(--brand)] hover:underline">Recuperar senha</a></div><div className="relative"><input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" className="h-11 w-full border border-[var(--line-strong)] bg-[var(--surface)] px-3 pr-11 outline-none focus:border-[var(--brand)]" {...register("password")} /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[var(--ink-muted)]" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>{errors.password && <p className="mt-1.5 text-xs text-[var(--danger)]">{errors.password.message}</p>}</div>
      {serverError && <div role="alert" className="border border-[#f0b4ae] bg-[#fff2f0] px-3 py-2.5 text-xs text-[var(--danger)]">{serverError}</div>}
      <button type="submit" disabled={isSubmitting} className="flex h-11 w-full items-center justify-center gap-2 bg-[var(--brand)] font-bold text-white transition hover:bg-[var(--brand-strong)] disabled:cursor-wait disabled:opacity-70">{isSubmitting && <LoaderCircle className="animate-spin" size={17} />}Entrar</button>
    </form>
  );
}
