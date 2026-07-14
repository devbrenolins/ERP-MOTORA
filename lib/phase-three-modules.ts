import type { ModuleConfig } from "@/lib/phase-two-modules";

const options = (values: Array<[string, string]>) => values.map(([value, label]) => ({ value, label }));
const warehouseRelation = { table: "warehouses", labelFields: ["code", "name"] };
const supplierRelation = { table: "suppliers", labelFields: ["trade_name", "legal_name"] };

export const phaseThreeModules: Record<string, ModuleConfig> = {
  produtos: {
    slug: "produtos", table: "products", title: "Produtos e peças", singular: "produto", branchColumn: "branch_id",
    phaseLabel: "Fase 3 • Suprimentos e estoque",
    subtitle: "Catálogo por SKU, código de barras, custos, preços e parâmetros de reposição.",
    fields: [
      { name: "sku", label: "SKU", type: "text", required: true, placeholder: "Ex.: FIL-OLEO-001" },
      { name: "barcode", label: "Código de barras", type: "text" },
      { name: "name", label: "Nome do produto", type: "text", required: true, wide: true },
      { name: "brand", label: "Marca", type: "text" },
      { name: "manufacturer_code", label: "Código do fabricante", type: "text" },
      { name: "product_type", label: "Tipo", type: "select", required: true, defaultValue: "part", options: options([["part", "Peça"], ["supply", "Material"], ["fluid", "Fluido"], ["tire", "Pneu"], ["accessory", "Acessório"], ["other", "Outro"]]) },
      { name: "unit", label: "Unidade", type: "select", required: true, defaultValue: "UN", options: options([["UN", "Unidade"], ["L", "Litro"], ["KG", "Quilograma"], ["M", "Metro"], ["CX", "Caixa"], ["JG", "Jogo"]]) },
      { name: "cost_price", label: "Custo atual", type: "number", defaultValue: 0 },
      { name: "sale_price", label: "Preço de venda", type: "number", defaultValue: 0 },
      { name: "minimum_stock", label: "Estoque mínimo", type: "number", defaultValue: 0 },
      { name: "maximum_stock", label: "Estoque máximo", type: "number" },
      { name: "reorder_point", label: "Ponto de reposição", type: "number", defaultValue: 0 },
      { name: "lead_time_days", label: "Prazo de compra (dias)", type: "number", defaultValue: 0 },
      { name: "description", label: "Descrição e aplicação", type: "textarea", wide: true },
    ],
    columns: [{ key: "sku", label: "SKU" }, { key: "name", label: "Produto" }, { key: "brand", label: "Marca" }, { key: "product_type", label: "Tipo", format: "status" }, { key: "cost_price", label: "Custo", format: "currency" }, { key: "sale_price", label: "Venda", format: "currency" }, { key: "minimum_stock", label: "Mínimo" }],
  },
  fornecedores: {
    slug: "fornecedores", table: "suppliers", title: "Fornecedores", singular: "fornecedor", branchColumn: "branch_id",
    phaseLabel: "Fase 3 • Suprimentos e estoque", subtitle: "Cadastre condições comerciais, prazos e desempenho dos parceiros.",
    fields: [
      { name: "supplier_type", label: "Tipo", type: "select", required: true, defaultValue: "company", options: options([["company", "Pessoa jurídica"], ["individual", "Pessoa física"]]) },
      { name: "legal_name", label: "Razão social ou nome", type: "text", required: true, wide: true },
      { name: "trade_name", label: "Nome fantasia", type: "text" },
      { name: "tax_id", label: "CPF ou CNPJ", type: "text" },
      { name: "contact_name", label: "Contato", type: "text" },
      { name: "phone", label: "Telefone", type: "text" },
      { name: "whatsapp", label: "WhatsApp", type: "text" },
      { name: "email", label: "E-mail", type: "text" },
      { name: "delivery_days", label: "Prazo médio (dias)", type: "number", defaultValue: 0 },
      { name: "payment_terms", label: "Condições de pagamento", type: "text", wide: true },
      { name: "address", label: "Endereço", type: "textarea", wide: true },
      { name: "notes", label: "Observações", type: "textarea", wide: true },
    ],
    columns: [{ key: "trade_name", label: "Fornecedor" }, { key: "legal_name", label: "Razão social" }, { key: "tax_id", label: "CPF/CNPJ" }, { key: "contact_name", label: "Contato" }, { key: "phone", label: "Telefone" }, { key: "delivery_days", label: "Prazo (dias)" }],
  },
  compras: {
    slug: "compras", table: "purchase_orders", title: "Pedidos de compra", singular: "pedido de compra", branchColumn: "branch_id",
    phaseLabel: "Fase 3 • Suprimentos e estoque", subtitle: "Controle aprovação, envio, previsão e recebimento de mercadorias.", defaults: { number: "" },
    fields: [
      { name: "supplier_id", label: "Fornecedor", type: "relation", relation: supplierRelation, required: true },
      { name: "warehouse_id", label: "Depósito de destino", type: "relation", relation: warehouseRelation, required: true },
      { name: "status", label: "Status", type: "select", defaultValue: "draft", options: options([["draft", "Rascunho"], ["pending_approval", "Aguardando aprovação"], ["approved", "Aprovado"], ["sent", "Enviado"], ["partial", "Recebido parcialmente"], ["cancelled", "Cancelado"]]) },
      { name: "expected_at", label: "Previsão de entrega", type: "date" },
      { name: "payment_terms", label: "Condições de pagamento", type: "text", wide: true },
      { name: "freight", label: "Frete", type: "number", defaultValue: 0 },
      { name: "discount", label: "Desconto", type: "number", defaultValue: 0 },
      { name: "notes", label: "Observações", type: "textarea", wide: true },
    ],
    columns: [{ key: "number", label: "Pedido" }, { key: "supplier_id", label: "Fornecedor", format: "relation" }, { key: "status", label: "Status", format: "status" }, { key: "expected_at", label: "Previsão", format: "date" }, { key: "items_total", label: "Itens", format: "currency" }, { key: "total", label: "Total", format: "currency" }],
  },
  inventario: {
    slug: "inventario", table: "stock_counts", title: "Inventários", singular: "inventário", branchColumn: "branch_id",
    phaseLabel: "Fase 3 • Suprimentos e estoque", subtitle: "Organize contagens físicas e ajustes rastreáveis por depósito.", defaults: { number: "" },
    fields: [
      { name: "warehouse_id", label: "Depósito", type: "relation", relation: warehouseRelation, required: true },
      { name: "status", label: "Status", type: "select", defaultValue: "draft", options: options([["draft", "Rascunho"], ["counting", "Em contagem"], ["review", "Em conferência"], ["cancelled", "Cancelado"]]) },
      { name: "started_at", label: "Início", type: "datetime" },
      { name: "notes", label: "Instruções e observações", type: "textarea", wide: true },
    ],
    columns: [{ key: "number", label: "Inventário" }, { key: "warehouse_id", label: "Depósito", format: "relation" }, { key: "status", label: "Status", format: "status" }, { key: "started_at", label: "Início", format: "datetime" }, { key: "completed_at", label: "Conclusão", format: "datetime" }],
  },
  transferencias: {
    slug: "transferencias", table: "stock_transfers", title: "Transferências", singular: "transferência", branchColumn: "branch_id",
    phaseLabel: "Fase 3 • Suprimentos e estoque", subtitle: "Movimente produtos entre depósitos com saída e entrada atômicas.", defaults: { number: "" },
    fields: [
      { name: "source_warehouse_id", label: "Depósito de origem", type: "relation", relation: warehouseRelation, required: true },
      { name: "destination_warehouse_id", label: "Depósito de destino", type: "relation", relation: warehouseRelation, required: true },
      { name: "status", label: "Status", type: "select", defaultValue: "draft", options: options([["draft", "Rascunho"], ["in_transit", "Em trânsito"], ["cancelled", "Cancelada"]]) },
      { name: "notes", label: "Observações", type: "textarea", wide: true },
    ],
    columns: [{ key: "number", label: "Transferência" }, { key: "source_warehouse_id", label: "Origem", format: "relation" }, { key: "destination_warehouse_id", label: "Destino", format: "relation" }, { key: "status", label: "Status", format: "status" }, { key: "requested_at", label: "Solicitada em", format: "datetime" }, { key: "completed_at", label: "Conclusão", format: "datetime" }],
  },
};
