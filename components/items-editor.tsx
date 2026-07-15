"use client";

import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ItemsConfig } from "@/lib/phase-two-modules";
import { money } from "@/lib/workshop";

type Item = { id: string; item_type: string; description: string; quantity: number; unit_price: number; discount: number; total: number };

const TYPE_OPTIONS = [
  { value: "service", label: "Serviço" },
  { value: "part", label: "Peça" },
  { value: "supply", label: "Insumo" },
  { value: "outsourced", label: "Terceirizado" },
];
const typeLabel = (value: string) => TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
const emptyDraft = { item_type: "service", description: "", quantity: "1", unit_price: "", discount: "" };

// Itens (serviços e peças) do orçamento ou da ordem de serviço. O total do
// documento é recalculado automaticamente pelos gatilhos do banco.
export function ItemsEditor({ config, recordId, organizationId, onChanged }: { config: ItemsConfig; recordId: string; organizationId: string; onChanged: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);

  const load = useCallback(async () => {
    try {
      const { data, error: loadError } = await createClient().from(config.table)
        .select("id,item_type,description,quantity,unit_price,discount,total")
        .eq(config.foreignKey, recordId).order("created_at", { ascending: true });
      if (loadError) throw loadError;
      setItems((data ?? []) as Item[]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível carregar os itens."); }
    finally { setLoading(false); }
  }, [config, recordId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const add = async () => {
    const description = draft.description.trim();
    const quantity = Number(draft.quantity.replace(",", "."));
    const unitPrice = Number(draft.unit_price.replace(",", "."));
    const discount = Number(draft.discount.replace(",", ".")) || 0;
    if (!description) { setError("Descreva o item antes de adicionar."); return; }
    if (!(quantity > 0)) { setError("Informe uma quantidade maior que zero."); return; }
    if (!(unitPrice >= 0)) { setError("Informe o valor unitário do item."); return; }
    setSaving(true); setError(null);
    try {
      const { error: insertError } = await createClient().from(config.table).insert({
        organization_id: organizationId, [config.foreignKey]: recordId,
        item_type: draft.item_type, description, quantity, unit_price: unitPrice, discount,
      });
      if (insertError) throw insertError;
      setDraft(emptyDraft); await load(); onChanged();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível adicionar o item."); }
    finally { setSaving(false); }
  };

  const remove = async (item: Item) => {
    if (!window.confirm(`Remover "${item.description}" do documento?`)) return;
    setSaving(true); setError(null);
    try {
      const { error: deleteError } = await createClient().from(config.table).delete().eq("id", item.id);
      if (deleteError) throw deleteError;
      await load(); onChanged();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível remover o item."); }
    finally { setSaving(false); }
  };

  const total = items.reduce((sum, item) => sum + Number(item.total), 0);
  const inputClass = "h-10 w-full border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 text-sm font-normal outline-none focus:border-[var(--brand)]";

  return (
    <section className="sm:col-span-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold">Itens e valores</p>
        <p className="text-xs font-bold text-[var(--brand)]">Total: {money(total)}</p>
      </div>
      {error && <p className="mt-2 text-xs text-[var(--danger)]" role="alert">{error}</p>}
      {loading ? <div className="mt-2 grid h-16 place-items-center border border-[var(--line)]"><LoaderCircle size={18} className="animate-spin text-[var(--brand)]" /></div> : (
        <div className="mt-2 border border-[var(--line)]">
          {items.length > 0 && (
            <div className="divide-y divide-[var(--line)]">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                  <span className="w-20 shrink-0 font-bold text-[var(--ink-muted)]">{typeLabel(item.item_type)}</span>
                  <span className="min-w-0 flex-1 truncate font-normal">{item.description} × {Number(item.quantity).toLocaleString("pt-BR")}{Number(item.discount) > 0 ? ` (desc. ${money(item.discount)})` : ""}</span>
                  <span className="shrink-0 font-bold">{money(item.total)}</span>
                  <button type="button" disabled={saving} onClick={() => void remove(item)} className="grid size-8 shrink-0 place-items-center text-[var(--ink-muted)] transition hover:text-[var(--danger)]" aria-label={`Remover ${item.description}`}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-2 border-t border-[var(--line)] bg-[var(--surface-muted)] p-3 sm:grid-cols-[110px_1fr_70px_110px_100px_auto]">
            <select value={draft.item_type} onChange={(event) => setDraft((current) => ({ ...current, item_type: event.target.value }))} className={inputClass} aria-label="Tipo do item">
              {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <input value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} className={inputClass} placeholder="Descrição do serviço ou peça" aria-label="Descrição do item" />
            <input inputMode="decimal" value={draft.quantity} onChange={(event) => setDraft((current) => ({ ...current, quantity: event.target.value }))} className={inputClass} placeholder="Qtd" aria-label="Quantidade" />
            <input inputMode="decimal" value={draft.unit_price} onChange={(event) => setDraft((current) => ({ ...current, unit_price: event.target.value }))} className={inputClass} placeholder="Valor unit." aria-label="Valor unitário" />
            <input inputMode="decimal" value={draft.discount} onChange={(event) => setDraft((current) => ({ ...current, discount: event.target.value }))} className={inputClass} placeholder="Desconto" aria-label="Desconto" />
            <button type="button" disabled={saving} onClick={() => void add()} className="inline-flex h-10 items-center justify-center gap-1.5 bg-[var(--brand)] px-3 text-xs font-bold text-white disabled:opacity-60">{saving ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />}Adicionar</button>
          </div>
        </div>
      )}
      <p className="mt-1.5 text-[11px] font-normal text-[var(--ink-muted)]">O valor total do documento é calculado automaticamente pela soma dos itens.</p>
    </section>
  );
}
