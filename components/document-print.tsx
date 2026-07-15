"use client";

import { LoaderCircle, Printer, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { dateTime, fullDate, money, statusLabel } from "@/lib/workshop";

type PrintKind = "estimate" | "work_order";
type PrintItem = { id: string; item_type: string; description: string; quantity: number; unit_price: number; discount: number; total: number };
type PrintData = {
  organization: { name: string; legal_name: string; tax_id: string };
  branch: { name: string };
  customer: { name: string; tax_id: string | null; primary_phone: string | null; primary_email: string | null };
  vehicle: { license_plate: string; brand: string; model: string; model_year: number | null; color: string | null; mileage: number };
  header: Record<string, unknown>;
  items: PrintItem[];
};

const ESTIMATE_STATUS: Record<string, string> = {
  draft: "Rascunho", diagnosis: "Em diagnóstico", sent: "Enviado", viewed: "Visualizado",
  partially_approved: "Parcialmente aprovado", approved: "Aprovado", rejected: "Recusado",
  expired: "Expirado", converted: "Convertido em OS", cancelled: "Cancelado",
};
const TYPE_LABELS: Record<string, string> = { service: "Serviço", part: "Peça", supply: "Insumo", outsourced: "Terceirizado" };
const formatTaxId = (value: string | null) => {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return value ?? "—";
};

// Documento imprimível (orçamento ou ordem de serviço). O botão usa a impressão
// do navegador, que também permite salvar em PDF.
export function DocumentPrint({ kind, id, onClose }: { kind: PrintKind; id: string; onClose: () => void }) {
  const [data, setData] = useState<PrintData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const supabase = createClient();
        const table = kind === "estimate" ? "estimates" : "work_orders";
        const itemsTable = kind === "estimate" ? "estimate_items" : "work_order_items";
        const foreignKey = kind === "estimate" ? "estimate_id" : "work_order_id";
        const { data: header, error: headerError } = await supabase.from(table).select("*").eq("id", id).single();
        if (headerError) throw headerError;
        const record = header as Record<string, unknown>;
        const [organization, branch, customer, vehicle, items] = await Promise.all([
          supabase.from("organizations").select("name,legal_name,tax_id").eq("id", String(record.organization_id)).single(),
          supabase.from("branches").select("name").eq("id", String(record.branch_id)).single(),
          supabase.from("customers").select("name,tax_id,primary_phone,primary_email").eq("id", String(record.customer_id)).single(),
          supabase.from("vehicles").select("license_plate,brand,model,model_year,color,mileage").eq("id", String(record.vehicle_id)).single(),
          supabase.from(itemsTable).select("id,item_type,description,quantity,unit_price,discount,total").eq(foreignKey, id).order("created_at", { ascending: true }),
        ]);
        if (organization.error || branch.error || customer.error || vehicle.error || items.error) throw organization.error ?? branch.error ?? customer.error ?? vehicle.error ?? items.error;
        setData({
          organization: organization.data as PrintData["organization"],
          branch: branch.data as PrintData["branch"],
          customer: customer.data as PrintData["customer"],
          vehicle: vehicle.data as PrintData["vehicle"],
          header: record,
          items: (items.data ?? []) as PrintItem[],
        });
      } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível montar o documento."); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [kind, id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const title = kind === "estimate" ? "ORÇAMENTO" : "ORDEM DE SERVIÇO";
  const header = data?.header ?? {};
  const status = String(header.status ?? "");
  const cell = "border border-[#c9d2d0] px-2 py-1.5 text-left align-top";

  // Renderizado direto no body: na impressão, o CSS esconde o restante da aplicação
  // e deixa o documento fluir por várias páginas.
  return createPortal(
    <div className="print-overlay fixed inset-0 z-[60] overflow-y-auto bg-black/55 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Impressão de ${kind === "estimate" ? "orçamento" : "ordem de serviço"}`} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="mx-auto max-w-3xl">
        <div className="print-hidden mb-3 flex items-center justify-between gap-2 bg-[var(--surface)] px-4 py-3">
          <p className="text-sm font-bold">Visualização de impressão</p>
          <div className="flex gap-2">
            <button onClick={() => window.print()} disabled={!data} className="inline-flex h-10 items-center gap-2 bg-[var(--brand)] px-4 text-sm font-bold text-white disabled:opacity-50"><Printer size={16} />Imprimir / Salvar PDF</button>
            <button onClick={onClose} className="grid size-10 place-items-center border border-[var(--line)] bg-[var(--surface)]" aria-label="Fechar visualização"><X size={17} /></button>
          </div>
        </div>

        {error && <div className="bg-[var(--surface)] p-6 text-center text-xs text-[var(--danger)]">{error}</div>}
        {!data && !error && <div className="grid h-64 place-items-center bg-[var(--surface)]"><LoaderCircle className="animate-spin text-[var(--brand)]" /></div>}

        {data && (
          <div className="print-area bg-white p-8 text-[13px] leading-relaxed text-[#18201f]">
            <header className="flex items-start justify-between gap-4 border-b-2 border-[#0b5a52] pb-4">
              <div>
                <p className="text-xl font-bold text-[#0b5a52]">{data.organization.name}</p>
                <p className="text-xs text-[#555]">{data.organization.legal_name} • CNPJ {formatTaxId(data.organization.tax_id)}</p>
                <p className="text-xs text-[#555]">Filial: {data.branch.name}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold">{title}</p>
                <p className="text-sm font-bold">Nº {String(header.number ?? "—")}</p>
                <p className="mt-1 text-xs text-[#555]">Situação: {kind === "estimate" ? ESTIMATE_STATUS[status] ?? status : statusLabel(status)}</p>
              </div>
            </header>

            <section className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#0b5a52]">Cliente</p>
                <p className="mt-1 font-bold">{data.customer.name}</p>
                {data.customer.tax_id && <p className="text-xs">CPF/CNPJ: {formatTaxId(data.customer.tax_id)}</p>}
                {data.customer.primary_phone && <p className="text-xs">Telefone: {data.customer.primary_phone}</p>}
                {data.customer.primary_email && <p className="text-xs">E-mail: {data.customer.primary_email}</p>}
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#0b5a52]">Veículo</p>
                <p className="mt-1 font-bold tracking-wide">{data.vehicle.license_plate}</p>
                <p className="text-xs">{data.vehicle.brand} {data.vehicle.model}{data.vehicle.model_year ? ` ${data.vehicle.model_year}` : ""}{data.vehicle.color ? ` • ${data.vehicle.color}` : ""}</p>
                <p className="text-xs">Quilometragem: {Number((header.mileage_in ?? header.mileage) ?? data.vehicle.mileage).toLocaleString("pt-BR")} km</p>
              </div>
            </section>

            <section className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 border-y border-[#c9d2d0] py-2 text-xs sm:grid-cols-4">
              <p><strong>Emissão:</strong> {fullDate(String(header.created_at))}</p>
              {kind === "work_order" ? <>
                <p><strong>Entrada:</strong> {header.entry_at ? dateTime(String(header.entry_at)) : "—"}</p>
                <p><strong>Previsão:</strong> {header.due_at ? dateTime(String(header.due_at)) : "A definir"}</p>
                <p><strong>Entrega:</strong> {header.delivered_at ? dateTime(String(header.delivered_at)) : "—"}</p>
              </> : <>
                <p><strong>Validade:</strong> {header.valid_until ? fullDate(String(header.valid_until)) : "Não informada"}</p>
                <p><strong>Previsão:</strong> {header.expected_completion_at ? dateTime(String(header.expected_completion_at)) : "A definir"}</p>
                <p><strong>Aprovação:</strong> {header.approved_at ? fullDate(String(header.approved_at)) : "Pendente"}</p>
              </>}
            </section>

            {Boolean(header.customer_complaint ?? header.notes) && (
              <section className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#0b5a52]">{kind === "work_order" ? "Solicitação do cliente" : "Diagnóstico e observações"}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs">{String(header.customer_complaint ?? header.notes)}</p>
                {kind === "work_order" && Boolean(header.diagnosis) && <p className="mt-2 whitespace-pre-wrap text-xs"><strong>Diagnóstico:</strong> {String(header.diagnosis)}</p>}
              </section>
            )}

            <section className="mt-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#0b5a52]">Serviços e peças</p>
              <table className="mt-2 w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-[#e5f1ef] font-bold">
                    <th className={cell}>Tipo</th><th className={cell}>Descrição</th>
                    <th className={`${cell} text-right`}>Qtd</th><th className={`${cell} text-right`}>Valor unit.</th>
                    <th className={`${cell} text-right`}>Desconto</th><th className={`${cell} text-right`}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.length ? data.items.map((item) => (
                    <tr key={item.id}>
                      <td className={cell}>{TYPE_LABELS[item.item_type] ?? item.item_type}</td>
                      <td className={cell}>{item.description}</td>
                      <td className={`${cell} text-right`}>{Number(item.quantity).toLocaleString("pt-BR")}</td>
                      <td className={`${cell} text-right`}>{money(item.unit_price)}</td>
                      <td className={`${cell} text-right`}>{money(item.discount)}</td>
                      <td className={`${cell} text-right font-bold`}>{money(item.total)}</td>
                    </tr>
                  )) : <tr><td colSpan={6} className={`${cell} text-center text-[#777]`}>Nenhum item lançado neste documento.</td></tr>}
                </tbody>
              </table>
              <div className="mt-3 ml-auto w-64 space-y-1 text-xs">
                <p className="flex justify-between"><span>Peças e insumos</span><span>{money(Number(header.parts_subtotal))}</span></p>
                <p className="flex justify-between"><span>Serviços</span><span>{money(Number(header.services_subtotal))}</span></p>
                <p className="flex justify-between"><span>Descontos</span><span>− {money(Number(header.discount_total))}</span></p>
                <p className="flex justify-between border-t-2 border-[#0b5a52] pt-1 text-sm font-bold"><span>TOTAL</span><span>{money(Number(header.total))}</span></p>
              </div>
            </section>

            {Boolean(header.terms) && (
              <section className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#0b5a52]">Termos e garantia</p>
                <p className="mt-1 whitespace-pre-wrap text-[11px] text-[#444]">{String(header.terms)}</p>
              </section>
            )}

            <section className="mt-10 grid grid-cols-2 gap-10 text-center text-xs">
              <div className="border-t border-[#333] pt-1">Assinatura do cliente</div>
              <div className="border-t border-[#333] pt-1">Responsável pela oficina</div>
            </section>

            <footer className="mt-6 border-t border-[#c9d2d0] pt-2 text-center text-[10px] text-[#777]">
              Documento gerado em {dateTime(new Date().toISOString())} pelo MOTORA ERP. {kind === "estimate" ? "Este orçamento não representa cobrança até a aprovação." : "Guarde este documento para acompanhar a garantia dos serviços."}
            </footer>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
