"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";

const schema=z.object({email:z.email("Informe um e-mail válido.")});type Values=z.infer<typeof schema>;
export function PasswordRecoveryForm(){const[message,setMessage]=useState<string|null>(null);const[error,setError]=useState<string|null>(null);const{register,handleSubmit,formState:{errors,isSubmitting}}=useForm<Values>({resolver:zodResolver(schema)});const submit=async(values:Values)=>{setError(null);setMessage(null);try{const{error:e}=await createClient().auth.resetPasswordForEmail(values.email,{redirectTo:`${window.location.origin}/login?mode=reset`});if(e)throw e;setMessage("Se o e-mail estiver cadastrado, enviaremos um link seguro para redefinir a senha.")}catch{setError("Não foi possível solicitar a recuperação. Tente novamente.")}};return <form onSubmit={handleSubmit(submit)} className="mt-8 space-y-5" noValidate><div><label htmlFor="recovery-email" className="mb-2 block text-xs font-bold">E-mail</label><input id="recovery-email" type="email" autoComplete="email" className="field w-full" {...register("email")}/>{errors.email&&<p className="mt-1.5 text-xs text-[var(--danger)]">{errors.email.message}</p>}</div>{error&&<div role="alert" className="border border-[#f0b4ae] bg-[#fff2f0] px-3 py-2.5 text-xs text-[var(--danger)]">{error}</div>}{message&&<div role="status" className="border border-[#aad8cf] bg-[var(--brand-soft)] px-3 py-2.5 text-xs text-[var(--brand)]">{message}</div>}<button disabled={isSubmitting} className="flex h-11 w-full items-center justify-center gap-2 bg-[var(--brand)] font-bold text-white disabled:opacity-60">{isSubmitting&&<LoaderCircle size={17} className="animate-spin"/>}Enviar link de recuperação</button><Link href="/login" className="block text-center text-xs font-bold text-[var(--brand)]">Voltar para o login</Link></form>}
