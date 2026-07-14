export type FieldType = "text" | "textarea" | "number" | "date" | "datetime" | "select" | "relation";

export type FieldConfig = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  relation?: { table: string; labelFields: string[] };
  defaultValue?: string | number;
  wide?: boolean;
};

export type ColumnConfig = { key: string; label: string; format?: "date" | "datetime" | "currency" | "status" | "relation" };

export type ModuleConfig = {
  slug: string;
  table: string;
  title: string;
  subtitle: string;
  singular: string;
  branchColumn: "branch_id" | "primary_branch_id";
  fields: FieldConfig[];
  columns: ColumnConfig[];
  defaults?: Record<string, unknown>;
  fixedFilters?: Record<string, string>;
  view?: "table" | "kanban";
};

const status = (values: Array<[string, string]>) => values.map(([value, label]) => ({ value, label }));
const customerRelation = { table: "customers", labelFields: ["name", "primary_phone"] };
const vehicleRelation = { table: "vehicles", labelFields: ["license_plate", "brand", "model"] };

export const phaseTwoModules: Record<string, ModuleConfig> = {
  atendimento: {
    slug: "atendimento", table: "customer_interactions", title: "Central de atendimento",
    subtitle: "Registre contatos, retornos e conversões do primeiro atendimento.", singular: "atendimento", branchColumn: "branch_id",
    fields: [
      { name: "customer_id", label: "Cliente", type: "relation", relation: customerRelation },
      { name: "vehicle_id", label: "Veículo", type: "relation", relation: vehicleRelation },
      { name: "channel", label: "Canal", type: "select", required: true, defaultValue: "phone", options: status([["phone", "Telefone"], ["whatsapp", "WhatsApp"], ["in_person", "Presencial"], ["email", "E-mail"], ["referral", "Indicação"], ["social", "Rede social"], ["website", "Site"], ["other", "Outro"]]) },
      { name: "subject", label: "Motivo do contato", type: "text", required: true, wide: true },
      { name: "priority", label: "Prioridade", type: "select", defaultValue: "normal", options: status([["low", "Baixa"], ["normal", "Normal"], ["high", "Alta"], ["urgent", "Urgente"]]) },
      { name: "status", label: "Status", type: "select", defaultValue: "new", options: status([["new", "Novo"], ["in_progress", "Em atendimento"], ["waiting_customer", "Aguardando cliente"], ["scheduled", "Agendado"], ["converted", "Convertido"], ["lost", "Perdido"]]) },
      { name: "next_contact_at", label: "Próximo contato", type: "datetime" },
      { name: "notes", label: "Observações", type: "textarea", wide: true },
    ],
    columns: [{ key: "subject", label: "Contato" }, { key: "customer_id", label: "Cliente", format: "relation" }, { key: "channel", label: "Canal", format: "status" }, { key: "priority", label: "Prioridade", format: "status" }, { key: "status", label: "Status", format: "status" }, { key: "next_contact_at", label: "Retorno", format: "datetime" }],
  },
  agenda: {
    slug: "agenda", table: "appointments", title: "Agenda da oficina",
    subtitle: "Organize compromissos, veículos e recursos da filial.", singular: "agendamento", branchColumn: "branch_id",
    fields: [
      { name: "customer_id", label: "Cliente", type: "relation", relation: customerRelation, required: true },
      { name: "vehicle_id", label: "Veículo", type: "relation", relation: vehicleRelation },
      { name: "starts_at", label: "Início", type: "datetime", required: true },
      { name: "ends_at", label: "Término", type: "datetime", required: true },
      { name: "service_description", label: "Serviço esperado", type: "text", required: true, wide: true },
      { name: "status", label: "Status", type: "select", defaultValue: "pending", options: status([["pending", "Pendente"], ["confirmed", "Confirmado"], ["arrived", "Cliente chegou"], ["in_progress", "Em atendimento"], ["completed", "Concluído"], ["cancelled", "Cancelado"], ["no_show", "Não compareceu"]]) },
      { name: "notes", label: "Observações", type: "textarea", wide: true },
    ],
    columns: [{ key: "starts_at", label: "Início", format: "datetime" }, { key: "customer_id", label: "Cliente", format: "relation" }, { key: "vehicle_id", label: "Veículo", format: "relation" }, { key: "service_description", label: "Serviço" }, { key: "status", label: "Status", format: "status" }],
  },
  clientes: {
    slug: "clientes", table: "customers", title: "Clientes", subtitle: "Cadastre pessoas, empresas e informações de relacionamento.", singular: "cliente", branchColumn: "primary_branch_id",
    fields: [
      { name: "customer_type", label: "Tipo", type: "select", defaultValue: "individual", required: true, options: status([["individual", "Pessoa física"], ["company", "Pessoa jurídica"]]) },
      { name: "name", label: "Nome ou razão social", type: "text", required: true, wide: true },
      { name: "trade_name", label: "Nome fantasia", type: "text" },
      { name: "tax_id", label: "CPF ou CNPJ", type: "text", placeholder: "Somente números" },
      { name: "primary_phone", label: "Telefone", type: "text" },
      { name: "whatsapp", label: "WhatsApp", type: "text" },
      { name: "primary_email", label: "E-mail", type: "text" },
      { name: "source", label: "Origem", type: "text" },
      { name: "notes", label: "Observações", type: "textarea", wide: true },
    ],
    columns: [{ key: "name", label: "Cliente" }, { key: "customer_type", label: "Tipo", format: "status" }, { key: "tax_id", label: "CPF/CNPJ" }, { key: "primary_phone", label: "Telefone" }, { key: "primary_email", label: "E-mail" }, { key: "created_at", label: "Cadastro", format: "date" }],
  },
  veiculos: {
    slug: "veiculos", table: "vehicles", title: "Veículos", subtitle: "Mantenha cadastro, quilometragem e vínculo com o cliente.", singular: "veículo", branchColumn: "branch_id",
    fields: [
      { name: "customer_id", label: "Proprietário", type: "relation", relation: customerRelation, required: true },
      { name: "license_plate", label: "Placa", type: "text", required: true },
      { name: "brand", label: "Marca", type: "text", required: true },
      { name: "model", label: "Modelo", type: "text", required: true },
      { name: "version", label: "Versão", type: "text" },
      { name: "model_year", label: "Ano/modelo", type: "number" },
      { name: "color", label: "Cor", type: "text" },
      { name: "fuel_type", label: "Combustível", type: "text" },
      { name: "mileage", label: "Quilometragem", type: "number", defaultValue: 0 },
      { name: "notes", label: "Observações", type: "textarea", wide: true },
    ],
    columns: [{ key: "license_plate", label: "Placa" }, { key: "brand", label: "Marca" }, { key: "model", label: "Modelo" }, { key: "model_year", label: "Ano" }, { key: "customer_id", label: "Proprietário", format: "relation" }, { key: "mileage", label: "Quilometragem" }],
  },
  recepcao: {
    slug: "recepcao", table: "work_orders", title: "Recepção e check-in", subtitle: "Registre a entrada do veículo com reclamação, prioridade e vistoria inicial.", singular: "check-in", branchColumn: "branch_id",
    defaults: { number: "", status: "awaiting_triage" }, fixedFilters: { status: "awaiting_triage" },
    fields: [
      { name: "customer_id", label: "Cliente", type: "relation", relation: customerRelation, required: true },
      { name: "vehicle_id", label: "Veículo", type: "relation", relation: vehicleRelation, required: true },
      { name: "mileage_in", label: "Quilometragem", type: "number", required: true },
      { name: "fuel_level", label: "Combustível (%)", type: "number" },
      { name: "priority", label: "Prioridade", type: "select", defaultValue: "normal", options: status([["low", "Baixa"], ["normal", "Normal"], ["high", "Alta"], ["urgent", "Urgente"]]) },
      { name: "due_at", label: "Previsão", type: "datetime" },
      { name: "customer_complaint", label: "Reclamação e sintomas relatados", type: "textarea", required: true, wide: true },
      { name: "internal_notes", label: "Objetos, acessórios e avarias", type: "textarea", wide: true },
    ],
    columns: [{ key: "number", label: "Entrada" }, { key: "customer_id", label: "Cliente", format: "relation" }, { key: "vehicle_id", label: "Veículo", format: "relation" }, { key: "priority", label: "Prioridade", format: "status" }, { key: "mileage_in", label: "Km" }, { key: "entry_at", label: "Entrada", format: "datetime" }],
  },
  inspecoes: {
    slug: "inspecoes", table: "inspections", title: "Inspeções", subtitle: "Execute checklists técnicos e registre recomendações.", singular: "inspeção", branchColumn: "branch_id",
    fields: [
      { name: "customer_id", label: "Cliente", type: "relation", relation: customerRelation, required: true },
      { name: "vehicle_id", label: "Veículo", type: "relation", relation: vehicleRelation, required: true },
      { name: "template_id", label: "Modelo de checklist", type: "relation", relation: { table: "inspection_templates", labelFields: ["name"] } },
      { name: "mileage", label: "Quilometragem", type: "number" },
      { name: "status", label: "Status", type: "select", defaultValue: "draft", options: status([["draft", "Rascunho"], ["in_progress", "Em inspeção"], ["completed", "Concluída"], ["cancelled", "Cancelada"]]) },
      { name: "notes", label: "Observações", type: "textarea", wide: true },
    ],
    columns: [{ key: "vehicle_id", label: "Veículo", format: "relation" }, { key: "customer_id", label: "Cliente", format: "relation" }, { key: "template_id", label: "Checklist", format: "relation" }, { key: "mileage", label: "Km" }, { key: "status", label: "Status", format: "status" }, { key: "created_at", label: "Criada em", format: "date" }],
  },
  orcamentos: {
    slug: "orcamentos", table: "estimates", title: "Orçamentos", subtitle: "Prepare propostas versionadas e acompanhe a aprovação.", singular: "orçamento", branchColumn: "branch_id", defaults: { number: "" },
    fields: [
      { name: "customer_id", label: "Cliente", type: "relation", relation: customerRelation, required: true },
      { name: "vehicle_id", label: "Veículo", type: "relation", relation: vehicleRelation, required: true },
      { name: "status", label: "Status", type: "select", defaultValue: "draft", options: status([["draft", "Rascunho"], ["diagnosis", "Em diagnóstico"], ["sent", "Enviado"], ["viewed", "Visualizado"], ["approved", "Aprovado"], ["rejected", "Recusado"]]) },
      { name: "valid_until", label: "Validade", type: "date" },
      { name: "mileage", label: "Quilometragem", type: "number" },
      { name: "expected_completion_at", label: "Previsão de conclusão", type: "datetime" },
      { name: "notes", label: "Diagnóstico e observações", type: "textarea", wide: true },
      { name: "terms", label: "Termos", type: "textarea", wide: true },
    ],
    columns: [{ key: "number", label: "Orçamento" }, { key: "customer_id", label: "Cliente", format: "relation" }, { key: "vehicle_id", label: "Veículo", format: "relation" }, { key: "status", label: "Status", format: "status" }, { key: "valid_until", label: "Validade", format: "date" }, { key: "total", label: "Total", format: "currency" }],
  },
  ordens: {
    slug: "ordens", table: "work_orders", title: "Ordens de serviço", subtitle: "Acompanhe o fluxo operacional da oficina por etapa.", singular: "ordem de serviço", branchColumn: "branch_id", view: "kanban", defaults: { number: "" },
    fields: [
      { name: "customer_id", label: "Cliente", type: "relation", relation: customerRelation, required: true },
      { name: "vehicle_id", label: "Veículo", type: "relation", relation: vehicleRelation, required: true },
      { name: "status", label: "Status", type: "select", defaultValue: "awaiting_triage", options: status([["awaiting_triage", "Aguardando triagem"], ["diagnosis", "Diagnóstico"], ["awaiting_approval", "Aguardando aprovação"], ["queued", "Na fila"], ["in_progress", "Em execução"], ["testing", "Em teste"], ["ready", "Pronta"], ["delivered", "Entregue"]]) },
      { name: "priority", label: "Prioridade", type: "select", defaultValue: "normal", options: status([["low", "Baixa"], ["normal", "Normal"], ["high", "Alta"], ["urgent", "Urgente"]]) },
      { name: "mileage_in", label: "Quilometragem", type: "number" },
      { name: "due_at", label: "Previsão", type: "datetime" },
      { name: "customer_complaint", label: "Reclamação do cliente", type: "textarea", required: true, wide: true },
      { name: "diagnosis", label: "Diagnóstico", type: "textarea", wide: true },
    ],
    columns: [{ key: "number", label: "OS" }, { key: "vehicle_id", label: "Veículo", format: "relation" }, { key: "customer_id", label: "Cliente", format: "relation" }, { key: "priority", label: "Prioridade", format: "status" }, { key: "due_at", label: "Previsão", format: "datetime" }],
  },
};
