"use client";

import { Check, ChevronDown, LoaderCircle, Search, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { SearchableSelect } from "@/components/searchable-select";
import { createClient } from "@/lib/supabase/client";
import type { FieldConfig } from "@/lib/phase-two-modules";

type QuickTable = "customers" | "vehicles" | "suppliers" | "warehouses";
type QuickCreate = {
  context: { organizationId: string; branchId: string; userId: string };
  table: QuickTable;
  form: Record<string, string>;
  relations: Record<string, Record<string, string>>;
};

const names: Record<QuickTable, string> = { customers: "cliente", vehicles: "veículo", suppliers: "fornecedor", warehouses: "depósito" };

export function SmartRelationPicker({ field, value, options, onChange, quickCreate, onOptionCreated }: { field: FieldConfig; value: string; options: Record<string, string>; onChange: (value: string) => void; quickCreate: QuickCreate | null; onOptionCreated: (id: string, label: string) => void }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [creating, setCreating] = useState(false);
  const normalized = term.trim().toLocaleLowerCase("pt-BR");
  const matches = Object.entries(options).filter(([, label]) => !normalized || label.toLocaleLowerCase("pt-BR").includes(normalized)).slice(0, 100);

  return <div className={`${field.wide ? "sm:col-span-2" : ""} relative text-xs font-bold`}><span>{field.label}{field.required && <span className="ml-1 text-[var(--danger)]">*</span>}</span><button type="button" onClick={() => setOpen((current) => !current)} className="mt-2 flex h-10 w-full items-center gap-2 border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-left text-sm font-normal outline-none focus:border-[var(--brand)]" aria-haspopup="listbox" aria-expanded={open}><Search size={15} className="text-[var(--brand)]" /><span className={`min-w-0 flex-1 truncate ${value ? "" : "text-[var(--ink-muted)]"}`}>{value ? options[value] ?? "Cadastro selecionado" : `Buscar ${field.label.toLocaleLowerCase("pt-BR")}`}</span><ChevronDown size={15} /></button>{open && <div className="absolute inset-x-0 z-30 mt-1 border border-[var(--line-strong)] bg-[var(--surface)] p-2 shadow-xl"><div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" /><input autoFocus type="search" value={term} onChange={(event) => setTerm(event.target.value)} className="h-10 w-full border border-[var(--line)] bg-[var(--surface-muted)] pl-9 pr-3 text-sm font-normal outline-none focus:border-[var(--brand)]" placeholder="Digite para procurar" /></div><div className="mt-2 max-h-48 overflow-y-auto" role="listbox">{matches.map(([id, label]) => <button key={id} type="button" onClick={() => { onChange(id); setOpen(false); setTerm(""); }} className="flex min-h-10 w-full items-center gap-2 border-b border-[var(--line)] px-2 py-2 text-left text-xs font-normal last:border-0 hover:bg-[var(--surface-muted)]"><span className="min-w-0 flex-1">{label}</span>{value === id && <Check size={15} className="text-[var(--brand)]" />}</button>)}{!matches.length && <p className="p-4 text-center font-normal text-[var(--ink-muted)]">Nenhum cadastro encontrado.</p>}</div>{quickCreate && <button type="button" onClick={() => { setCreating(true); setOpen(false); }} className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 border border-[var(--brand)] text-xs font-bold text-[var(--brand)]"><UserPlus size={15} />Cadastrar {names[quickCreate.table]} sem sair desta tela</button>}</div>}{creating && quickCreate && <QuickCreatePanel config={quickCreate} onClose={() => setCreating(false)} onCreated={(id, label) => { onOptionCreated(id, label); setCreating(false); }} />}</div>;
}

function QuickCreatePanel({ config, onClose, onCreated }: { config: QuickCreate; onClose: () => void; onCreated: (id: string, label: string) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState(() => ({ name: "", phone: "", taxId: "", email: "", customerId: config.form.customer_id ?? "", plate: "", brand: "", model: "", mileage: "0", legalName: "", tradeName: "", code: "" }));
  const ownerOptions = Object.entries(config.relations.customer_id ?? {}).map(([id, label]) => ({ id, label }));

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const base = { organization_id: config.context.organizationId, created_by: config.context.userId, updated_by: config.context.userId };
      let payload: Record<string, unknown>; let select: string;
      if (config.table === "customers") {
        if (data.name.trim().length < 2) throw new Error("Informe o nome do cliente.");
        payload = { ...base, primary_branch_id: config.context.branchId, customer_type: "individual", name: data.name.trim(), primary_phone: data.phone.trim() || null, tax_id: data.taxId.replace(/\D/g, "") || null, primary_email: data.email.trim() || null }; select = "id,name,primary_phone";
      } else if (config.table === "vehicles") {
        if (!data.customerId) throw new Error("Selecione o proprietário.");
        if (!data.plate.trim() || !data.brand.trim() || !data.model.trim()) throw new Error("Informe placa, marca e modelo.");
        payload = { ...base, branch_id: config.context.branchId, customer_id: data.customerId, license_plate: data.plate.toUpperCase().replace(/[^A-Z0-9]/g, ""), brand: data.brand.trim(), model: data.model.trim(), mileage: Number(data.mileage) || 0 }; select = "id,license_plate,brand,model";
      } else if (config.table === "suppliers") {
        if (data.legalName.trim().length < 2) throw new Error("Informe o nome ou a razão social.");
        payload = { ...base, branch_id: config.context.branchId, supplier_type: "company", legal_name: data.legalName.trim(), trade_name: data.tradeName.trim() || null, tax_id: data.taxId.replace(/\D/g, "") || null, phone: data.phone.trim() || null, email: data.email.trim() || null }; select = "id,trade_name,legal_name";
      } else {
        if (!data.code.trim() || data.name.trim().length < 2) throw new Error("Informe o código e o nome do depósito.");
        payload = { ...base, branch_id: config.context.branchId, code: data.code.trim().toUpperCase(), name: data.name.trim(), active: true }; select = "id,code,name";
      }
      const { data: created, error: insertError } = await createClient().from(config.table).insert(payload).select(select).single();
      if (insertError) throw insertError;
      const row = created as unknown as Record<string, unknown>;
      const labelFields: Record<QuickTable, string[]> = { customers: ["name", "primary_phone"], vehicles: ["license_plate", "brand", "model"], suppliers: ["trade_name", "legal_name"], warehouses: ["code", "name"] };
      const label = labelFields[config.table].map((key) => row[key]).filter(Boolean).join(" • ");
      onCreated(String(row.id), label);
    } catch (caught) { setError(caught instanceof Error ? caught.message : `Não foi possível cadastrar o ${names[config.table]}.`); }
    finally { setSaving(false); }
  };

  return <section className="mt-3 border border-[var(--brand)] bg-[var(--brand-soft)] p-3"><div className="flex items-center justify-between"><div><p className="font-bold">Novo {names[config.table]}</p><p className="mt-1 font-normal text-[var(--ink-muted)]">Preencha os dados básicos. Você poderá completar o cadastro depois.</p></div><button type="button" onClick={onClose} className="p-2" aria-label="Fechar cadastro rápido"><X size={15} /></button></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{config.table === "customers" && <><Input value={data.name} onChange={(name) => setData((current) => ({ ...current, name }))} placeholder="Nome completo *" /><Input value={data.phone} onChange={(phone) => setData((current) => ({ ...current, phone }))} placeholder="Telefone" /><Input value={data.taxId} onChange={(taxId) => setData((current) => ({ ...current, taxId }))} placeholder="CPF ou CNPJ" /><Input type="email" value={data.email} onChange={(email) => setData((current) => ({ ...current, email }))} placeholder="E-mail" /></>}{config.table === "vehicles" && <><div className="sm:col-span-2"><SearchableSelect label="Proprietário" required value={data.customerId} options={ownerOptions} onChange={(customerId) => setData((current) => ({ ...current, customerId }))} /></div><Input value={data.plate} onChange={(plate) => setData((current) => ({ ...current, plate }))} placeholder="Placa *" /><Input value={data.brand} onChange={(brand) => setData((current) => ({ ...current, brand }))} placeholder="Marca *" /><Input value={data.model} onChange={(model) => setData((current) => ({ ...current, model }))} placeholder="Modelo *" /><Input type="number" value={data.mileage} onChange={(mileage) => setData((current) => ({ ...current, mileage }))} placeholder="Quilometragem" /></>}{config.table === "suppliers" && <><Input value={data.legalName} onChange={(legalName) => setData((current) => ({ ...current, legalName }))} placeholder="Razão social ou nome *" /><Input value={data.tradeName} onChange={(tradeName) => setData((current) => ({ ...current, tradeName }))} placeholder="Nome fantasia" /><Input value={data.taxId} onChange={(taxId) => setData((current) => ({ ...current, taxId }))} placeholder="CPF ou CNPJ" /><Input value={data.phone} onChange={(phone) => setData((current) => ({ ...current, phone }))} placeholder="Telefone" /><Input type="email" value={data.email} onChange={(email) => setData((current) => ({ ...current, email }))} placeholder="E-mail" /></>}{config.table === "warehouses" && <><Input value={data.code} onChange={(code) => setData((current) => ({ ...current, code }))} placeholder="Código *" /><Input value={data.name} onChange={(name) => setData((current) => ({ ...current, name }))} placeholder="Nome do depósito *" /></>}</div>{error && <p className="mt-2 text-[var(--danger)]">{error}</p>}<div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end"><button type="button" onClick={onClose} className="h-10 border border-[var(--line)] px-3">Cancelar</button><button type="button" disabled={saving} onClick={() => void save()} className="inline-flex h-10 items-center justify-center gap-2 bg-[var(--brand)] px-3 text-white disabled:opacity-60">{saving && <LoaderCircle size={14} className="animate-spin" />}Cadastrar e selecionar</button></div></section>;
}

function Input({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (value: string) => void; placeholder: string; type?: string }) { return <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 min-w-0 border border-[var(--line-strong)] bg-[var(--surface)] px-3 font-normal" placeholder={placeholder} />; }
