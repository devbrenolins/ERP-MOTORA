"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

export type SearchableOption = { id: string; label: string };

export function SearchableSelect({ label, value, options, onChange, required, placeholder }: { label: string; value: string; options: SearchableOption[]; onChange: (value: string) => void; required?: boolean; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.id === value);
  const matches = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    return options.filter((option) => !term || option.label.toLocaleLowerCase("pt-BR").includes(term)).slice(0, 100);
  }, [options, query]);

  return <div className="relative text-xs font-bold"><span>{label}{required && <span className="ml-1 text-[var(--danger)]">*</span>}</span><button type="button" onClick={() => setOpen((current) => !current)} className="mt-2 flex h-10 w-full items-center gap-2 border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-left text-sm font-normal" aria-haspopup="listbox" aria-expanded={open}><Search size={15} className="text-[var(--brand)]" /><span className={`min-w-0 flex-1 truncate ${selected ? "" : "text-[var(--ink-muted)]"}`}>{selected?.label ?? placeholder ?? `Buscar ${label.toLocaleLowerCase("pt-BR")}`}</span><ChevronDown size={15} /></button>{open && <div className="absolute inset-x-0 z-40 mt-1 border border-[var(--line-strong)] bg-[var(--surface)] p-2 shadow-xl"><div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" /><input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full border border-[var(--line)] bg-[var(--surface-muted)] pl-9 pr-9 text-sm font-normal outline-none focus:border-[var(--brand)]" placeholder="Digite para procurar" />{query && <button type="button" onClick={() => setQuery("")} className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center" aria-label="Limpar busca"><X size={14} /></button>}</div><div className="mt-2 max-h-52 overflow-y-auto" role="listbox">{matches.map((option) => <button key={option.id} type="button" onClick={() => { onChange(option.id); setOpen(false); setQuery(""); }} className="flex min-h-10 w-full items-center gap-2 border-b border-[var(--line)] px-2 py-2 text-left text-xs font-normal last:border-0 hover:bg-[var(--surface-muted)]"><span className="min-w-0 flex-1">{option.label}</span>{option.id === value && <Check size={15} className="text-[var(--brand)]" />}</button>)}{!matches.length && <p className="p-4 text-center font-normal text-[var(--ink-muted)]">Nenhum cadastro encontrado.</p>}</div></div>}</div>;
}
