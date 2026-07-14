import type { ModuleConfig } from "@/lib/phase-two-modules";

const list = (values: Array<[string, string]>) => values.map(([value, label]) => ({ value, label }));
const customer = { table: "customers", labelFields: ["name", "primary_phone"] };
const supplier = { table: "suppliers", labelFields: ["trade_name", "legal_name"] };

export const phaseFourModules: Record<string, ModuleConfig> = {
  "contas-receber": {
    slug: "contas-receber", table: "receivables", title: "Contas a receber", singular: "conta a receber", branchColumn: "branch_id",
    phaseLabel: "Fase 4 • Financeiro", subtitle: "Controle vencimentos, parcelas, inadimplência e recebimentos vinculados à operação.", defaults: { number: "", status: "open" },
    fields: [
      { name: "customer_id", label: "Cliente", type: "relation", relation: customer },
      { name: "document", label: "Documento", type: "text" },
      { name: "description", label: "Descrição", type: "text", required: true, wide: true },
      { name: "competence_date", label: "Competência", type: "date", required: true },
      { name: "due_date", label: "Vencimento", type: "date", required: true },
      { name: "original_amount", label: "Valor", type: "number", required: true },
      { name: "installment_number", label: "Parcela", type: "number", defaultValue: 1 },
      { name: "installment_count", label: "Total de parcelas", type: "number", defaultValue: 1 },
      { name: "interest_amount", label: "Juros", type: "number", defaultValue: 0 },
      { name: "fine_amount", label: "Multa", type: "number", defaultValue: 0 },
      { name: "discount_amount", label: "Desconto", type: "number", defaultValue: 0 },
      { name: "notes", label: "Observações", type: "textarea", wide: true },
    ],
    columns: [{ key: "number", label: "Título" }, { key: "customer_id", label: "Cliente", format: "relation" }, { key: "description", label: "Descrição" }, { key: "due_date", label: "Vencimento", format: "date" }, { key: "original_amount", label: "Valor", format: "currency" }, { key: "outstanding_amount", label: "Em aberto", format: "currency" }, { key: "status", label: "Status", format: "status" }],
  },
  "contas-pagar": {
    slug: "contas-pagar", table: "payables", title: "Contas a pagar", singular: "conta a pagar", branchColumn: "branch_id",
    phaseLabel: "Fase 4 • Financeiro", subtitle: "Acompanhe fornecedores, competência, vencimentos e aprovação de despesas.", defaults: { number: "", status: "pending_approval" },
    fields: [
      { name: "supplier_id", label: "Fornecedor", type: "relation", relation: supplier },
      { name: "document", label: "Documento", type: "text" },
      { name: "description", label: "Descrição", type: "text", required: true, wide: true },
      { name: "competence_date", label: "Competência", type: "date", required: true },
      { name: "due_date", label: "Vencimento", type: "date", required: true },
      { name: "original_amount", label: "Valor", type: "number", required: true },
      { name: "installment_number", label: "Parcela", type: "number", defaultValue: 1 },
      { name: "installment_count", label: "Total de parcelas", type: "number", defaultValue: 1 },
      { name: "interest_amount", label: "Juros", type: "number", defaultValue: 0 },
      { name: "fine_amount", label: "Multa", type: "number", defaultValue: 0 },
      { name: "discount_amount", label: "Desconto", type: "number", defaultValue: 0 },
      { name: "status", label: "Status", type: "select", required: true, defaultValue: "pending_approval", options: list([["draft", "Rascunho"], ["pending_approval", "Pendente de aprovação"], ["approved", "Aprovado"], ["open", "Em aberto"], ["cancelled", "Cancelado"]]) },
      { name: "notes", label: "Observações", type: "textarea", wide: true },
    ],
    columns: [{ key: "number", label: "Título" }, { key: "supplier_id", label: "Fornecedor", format: "relation" }, { key: "description", label: "Descrição" }, { key: "due_date", label: "Vencimento", format: "date" }, { key: "original_amount", label: "Valor", format: "currency" }, { key: "outstanding_amount", label: "Em aberto", format: "currency" }, { key: "status", label: "Status", format: "status" }],
  },
  comissoes: {
    slug: "comissoes", table: "commission_rules", title: "Regras de comissão", singular: "regra de comissão", branchColumn: "branch_id",
    phaseLabel: "Fase 4 • Financeiro", subtitle: "Configure comissão por serviço, produto, faturamento, lucro ou faixa de meta.",
    fields: [
      { name: "name", label: "Nome da regra", type: "text", required: true, wide: true },
      { name: "basis", label: "Base", type: "select", required: true, defaultValue: "service", options: list([["service", "Serviço"], ["product", "Produto"], ["revenue", "Faturamento"], ["gross_profit", "Lucro bruto"], ["target_range", "Faixa de meta"]]) },
      { name: "beneficiary_role", label: "Perfil beneficiário", type: "text", placeholder: "Ex.: mechanic" },
      { name: "rate_percent", label: "Percentual", type: "number", defaultValue: 0 },
      { name: "fixed_amount", label: "Valor fixo", type: "number", defaultValue: 0 },
      { name: "minimum_base", label: "Base mínima", type: "number" },
      { name: "maximum_base", label: "Base máxima", type: "number" },
    ],
    columns: [{ key: "name", label: "Regra" }, { key: "basis", label: "Base", format: "status" }, { key: "beneficiary_role", label: "Beneficiário" }, { key: "rate_percent", label: "Percentual" }, { key: "fixed_amount", label: "Valor fixo", format: "currency" }, { key: "created_at", label: "Criada em", format: "date" }],
  },
};
