"use client";

import { Download, LoaderCircle, ShieldAlert } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Customer = { id:string; name:string; tax_id:string|null; primary_phone:string|null };

export function PrivacyModule() {
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [selected,setSelected]=useState("");
  const [reason,setReason]=useState("");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [message,setMessage]=useState<string|null>(null);

  const load=useCallback(async()=>{
    setLoading(true); setError(null);
    try {
      const s=createClient();
      const {data:{user}}=await s.auth.getUser();
      if(!user) throw new Error("Sua sessão expirou.");
      const {data:p}=await s.from("profiles").select("last_organization_id").eq("id",user.id).single();
      if(!p?.last_organization_id) throw new Error("Selecione uma empresa.");
      const {data,error:e}=await s.from("customers").select("id,name,tax_id,primary_phone").eq("organization_id",p.last_organization_id).is("deleted_at",null).order("name").limit(1000);
      if(e) throw e;
      setCustomers((data??[]) as Customer[]);
    } catch(c) { setError(c instanceof Error?c.message:"Não foi possível carregar os clientes."); }
    finally { setLoading(false); }
  },[]);

  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer)},[load]);

  const exportData=async()=>{
    if(!selected)return; setSaving(true); setError(null); setMessage(null);
    try {
      const {data,error:e}=await createClient().rpc("export_customer_data",{p_customer_id:selected});
      if(e) throw e;
      const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob); const link=document.createElement("a");
      link.href=url; link.download=`dados-cliente-${selected.slice(0,8)}.json`; link.click(); URL.revokeObjectURL(url);
      setMessage("Exportação gerada e registrada na auditoria.");
    } catch(c) { setError(c instanceof Error?c.message:"Não foi possível exportar."); }
    finally { setSaving(false); }
  };

  const anonymize=async(event:FormEvent)=>{
    event.preventDefault();
    if(!selected||reason.trim().length<10)return;
    if(!window.confirm("Esta ação remove dados pessoais e não pode ser desfeita. Confirmar anonimização?"))return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const {error:e}=await createClient().rpc("anonymize_customer",{p_customer_id:selected,p_reason:reason.trim()});
      if(e) throw e;
      setReason(""); setSelected(""); setMessage("Cliente anonimizado com sucesso."); await load();
    } catch(c) { setError(c instanceof Error?c.message:"Não foi possível anonimizar o cliente."); }
    finally { setSaving(false); }
  };

  return <main className="mx-auto max-w-[900px] px-4 py-5 lg:px-7 lg:py-6">
    <div className="mb-5"><p className="mb-1 text-[11px] font-bold uppercase tracking-[.14em] text-[var(--brand)]">LGPD</p><h1 className="text-2xl font-bold">Privacidade do cliente</h1><p className="mt-1 text-sm text-[var(--ink-muted)]">Exporte ou anonimize dados pessoais com permissão e trilha de auditoria.</p></div>
    {error&&<div className="mb-4 border border-[#e9b3ad] bg-[#fff3f1] px-4 py-3 text-xs text-[var(--danger)]">{error}</div>}
    {message&&<div className="mb-4 border border-[#aad8cf] bg-[var(--brand-soft)] px-4 py-3 text-xs text-[var(--brand)]">{message}</div>}
    {loading?<div className="grid min-h-72 place-items-center"><LoaderCircle className="animate-spin text-[var(--brand)]"/></div>:<>
      <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
        <label className="text-xs font-bold">Cliente<select className="field mt-2 w-full" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Selecione...</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}{customer.tax_id?` • ${customer.tax_id}`:""}</option>)}</select></label>
        <div className="mt-5 flex items-center justify-between gap-4 border-t border-[var(--line)] pt-5"><div><h2 className="text-sm font-bold">Portabilidade</h2><p className="mt-1 text-xs text-[var(--ink-muted)]">Gera um JSON com cadastro, contatos, veículos e histórico operacional.</p></div><button type="button" disabled={!selected||saving} onClick={()=>void exportData()} className="inline-flex h-10 shrink-0 items-center gap-2 border border-[var(--line)] px-4 text-xs font-bold disabled:opacity-40"><Download size={15}/>Exportar dados</button></div>
      </section>
      <form onSubmit={anonymize} className="mt-5 border border-[#e9b3ad] bg-[#fffaf9] p-5">
        <div className="flex gap-3"><ShieldAlert className="shrink-0 text-[var(--danger)]" size={20}/><div><h2 className="text-sm font-bold">Anonimização irreversível</h2><p className="mt-1 text-xs text-[var(--ink-muted)]">Bloqueada enquanto houver OS ativa ou valor a receber. O histórico contábil e operacional permanece sem identificadores pessoais.</p></div></div>
        <label className="mt-5 block text-xs font-bold">Justificativa obrigatória<textarea value={reason} onChange={e=>setReason(e.target.value)} className="field mt-2 min-h-24 w-full py-3" placeholder="Informe a base legal e o motivo da solicitação"/></label>
        <div className="mt-4 flex justify-end"><button disabled={!selected||reason.trim().length<10||saving} className="inline-flex h-10 items-center gap-2 bg-[var(--danger)] px-4 text-xs font-bold text-white disabled:opacity-40">{saving&&<LoaderCircle size={15} className="animate-spin"/>}Anonimizar cliente</button></div>
      </form>
    </>}
  </main>;
}
