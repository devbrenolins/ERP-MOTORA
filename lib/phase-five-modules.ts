import type { ModuleConfig } from "@/lib/phase-two-modules";

const options = (values: Array<[string,string]>) => values.map(([value,label]) => ({ value,label }));
const customer = { table: "customers", labelFields: ["name","primary_phone"] };
const vehicle = { table: "vehicles", labelFields: ["license_plate","brand","model"] };
const workOrder = { table: "work_orders", labelFields: ["number","customer_complaint"] };
const contract = { table: "fleet_contracts", labelFields: ["code","name"] };

export const phaseFiveModules: Record<string, ModuleConfig> = {
  segmentos: {
    slug:"segmentos",table:"customer_segments",title:"Segmentos de clientes",singular:"segmento",branchColumn:null,
    phaseLabel:"CRM",subtitle:"Agrupe clientes para campanhas e acompanhamento.",
    fields:[
      {name:"name",label:"Nome",type:"text",required:true},{name:"segment_type",label:"Tipo",type:"select",required:true,defaultValue:"manual",options:options([["manual","Manual"],["inactive","Inativos"],["recurring","Recorrentes"],["delinquent","Inadimplentes"],["birthday","Aniversariantes"],["fleet","Frotas"],["custom","Personalizado"]])},
      {name:"description",label:"Descrição",type:"textarea",wide:true},{name:"color",label:"Cor de identificação",type:"text",placeholder:"Ex.: verde"},{name:"active",label:"Segmento ativo",type:"checkbox",defaultValue:"true"},
    ],
    columns:[{key:"name",label:"Segmento"},{key:"segment_type",label:"Tipo",format:"status"},{key:"active",label:"Ativo"},{key:"created_at",label:"Criado em",format:"date"}],
  },
  garantias: {
    slug:"garantias",table:"warranties",title:"Garantias",singular:"garantia",branchColumn:"branch_id",phaseLabel:"Pós-venda",subtitle:"Controle cobertura por serviço, peça, ordem, prazo e quilometragem.",defaults:{status:"active"},
    fields:[
      {name:"customer_id",label:"Cliente",type:"relation",relation:customer,required:true},{name:"vehicle_id",label:"Veículo",type:"relation",relation:vehicle,required:true},{name:"work_order_id",label:"Ordem de serviço",type:"relation",relation:workOrder},
      {name:"warranty_type",label:"Tipo",type:"select",required:true,defaultValue:"service",options:options([["service","Serviço"],["product","Peça ou produto"],["work_order","Ordem completa"]])},{name:"description",label:"Cobertura",type:"text",required:true,wide:true},
      {name:"starts_at",label:"Início",type:"date",required:true},{name:"expires_at",label:"Término",type:"date",required:true},{name:"mileage_start",label:"Km inicial",type:"number"},{name:"mileage_limit",label:"Limite de km",type:"number"},{name:"terms",label:"Termos",type:"textarea",wide:true},
    ],
    columns:[{key:"description",label:"Garantia"},{key:"customer_id",label:"Cliente",format:"relation"},{key:"vehicle_id",label:"Veículo",format:"relation"},{key:"warranty_type",label:"Tipo",format:"status"},{key:"expires_at",label:"Validade",format:"date"},{key:"status",label:"Status",format:"status"}],
  },
  frotas: {
    slug:"frotas",table:"fleet_contracts",title:"Frotas e convênios",singular:"contrato",branchColumn:"branch_id",phaseLabel:"Frotas",subtitle:"Contratos, limites, aprovação e fechamento mensal para clientes corporativos.",defaults:{status:"active"},
    fields:[
      {name:"customer_id",label:"Empresa cliente",type:"relation",relation:customer,required:true},{name:"code",label:"Código",type:"text",required:true},{name:"name",label:"Nome do contrato",type:"text",required:true},
      {name:"status",label:"Status",type:"select",required:true,defaultValue:"active",options:options([["draft","Rascunho"],["active","Ativo"],["suspended","Suspenso"],["expired","Expirado"],["cancelled","Cancelado"]])},
      {name:"starts_at",label:"Início",type:"date",required:true},{name:"expires_at",label:"Validade",type:"date"},{name:"approval_required",label:"Exige autorização",type:"checkbox",defaultValue:"true"},{name:"monthly_close_day",label:"Dia de fechamento",type:"number",defaultValue:1},
      {name:"vehicle_credit_limit",label:"Limite por veículo",type:"number",defaultValue:0},{name:"price_table_name",label:"Tabela de preços",type:"text"},{name:"payment_terms",label:"Condição de pagamento",type:"text"},{name:"commercial_terms",label:"Condições comerciais",type:"textarea",wide:true},
    ],
    columns:[{key:"code",label:"Código"},{key:"name",label:"Contrato"},{key:"customer_id",label:"Empresa",format:"relation"},{key:"status",label:"Status",format:"status"},{key:"expires_at",label:"Validade",format:"date"},{key:"vehicle_credit_limit",label:"Limite/veículo",format:"currency"}],
  },
  "motoristas-frota": {
    slug:"motoristas-frota",table:"fleet_drivers",title:"Motoristas de frota",singular:"motorista",branchColumn:"branch_id",phaseLabel:"Frotas",subtitle:"Cadastre condutores autorizados em cada contrato.",
    fields:[{name:"contract_id",label:"Contrato",type:"relation",relation:contract,required:true},{name:"name",label:"Nome",type:"text",required:true},{name:"document",label:"Documento",type:"text"},{name:"license_number",label:"CNH",type:"text"},{name:"phone",label:"Telefone",type:"text"},{name:"email",label:"E-mail",type:"text"},{name:"active",label:"Motorista ativo",type:"checkbox",defaultValue:"true"}],
    columns:[{key:"name",label:"Motorista"},{key:"contract_id",label:"Contrato",format:"relation"},{key:"license_number",label:"CNH"},{key:"phone",label:"Telefone"},{key:"active",label:"Ativo"}],
  },
  "veiculos-frota": {
    slug:"veiculos-frota",table:"fleet_vehicles",title:"Veículos de frota",singular:"veículo vinculado",branchColumn:"branch_id",phaseLabel:"Frotas",subtitle:"Vincule veículos, limites, centros de custo e autorização.",
    fields:[{name:"contract_id",label:"Contrato",type:"relation",relation:contract,required:true},{name:"vehicle_id",label:"Veículo",type:"relation",relation:vehicle,required:true},{name:"internal_code",label:"Código interno",type:"text"},{name:"monthly_limit",label:"Limite mensal",type:"number"},{name:"authorization_required",label:"Exige autorização",type:"checkbox",defaultValue:"true"},{name:"active",label:"Vínculo ativo",type:"checkbox",defaultValue:"true"}],
    columns:[{key:"vehicle_id",label:"Veículo",format:"relation"},{key:"contract_id",label:"Contrato",format:"relation"},{key:"internal_code",label:"Código"},{key:"monthly_limit",label:"Limite",format:"currency"},{key:"active",label:"Ativo"}],
  },
  "modelos-mensagem": {
    slug:"modelos-mensagem",table:"message_templates",title:"Modelos de mensagem",singular:"modelo",branchColumn:"branch_id",phaseLabel:"Automações",subtitle:"Crie comunicações com variáveis como nome, veículo, placa, OS e valor.",
    fields:[{name:"code",label:"Código",type:"text",required:true},{name:"name",label:"Nome",type:"text",required:true},{name:"channel",label:"Canal",type:"select",required:true,defaultValue:"whatsapp",options:options([["whatsapp","WhatsApp"],["email","E-mail"],["sms","SMS"],["internal","Interno"]])},{name:"subject",label:"Assunto",type:"text",wide:true},{name:"body",label:"Mensagem",type:"textarea",required:true,wide:true,placeholder:"Olá {{nome}}, seu veículo {{placa}}..."},{name:"active",label:"Modelo ativo",type:"checkbox",defaultValue:"true"}],
    columns:[{key:"code",label:"Código"},{key:"name",label:"Modelo"},{key:"channel",label:"Canal",format:"status"},{key:"active",label:"Ativo"},{key:"updated_at",label:"Atualizado",format:"date"}],
  },
  automacoes: {
    slug:"automacoes",table:"automation_rules",title:"Automações de pós-venda",singular:"automação",branchColumn:"branch_id",phaseLabel:"Automações",subtitle:"Envie lembretes apenas para clientes que autorizaram o contato.",action:{label:"Executar ciclo",rpc:"run_automation_cycle",confirm:"Executar agora as regras ativas desta filial?"},
    fields:[{name:"template_id",label:"Modelo de mensagem",type:"relation",relation:{table:"message_templates",labelFields:["code","name"]}},{name:"name",label:"Nome",type:"text",required:true},{name:"event_type",label:"Evento",type:"select",required:true,defaultValue:"service_due",options:options([["service_due","Revisão próxima"],["preventive_due","Manutenção preventiva"],["rating_request","Solicitar avaliação"],["inactive_customer","Cliente inativo"],["birthday","Aniversário"],["warranty_expiring","Garantia a vencer"]])},{name:"channel",label:"Canal",type:"select",required:true,defaultValue:"whatsapp",options:options([["whatsapp","WhatsApp"],["email","E-mail"],["sms","SMS"],["internal","Interno"]])},{name:"days_offset",label:"Antecedência/dias",type:"number",defaultValue:7},{name:"active",label:"Automação ativa",type:"checkbox",defaultValue:"true"}],
    columns:[{key:"name",label:"Automação"},{key:"event_type",label:"Evento",format:"status"},{key:"channel",label:"Canal",format:"status"},{key:"days_offset",label:"Dias"},{key:"active",label:"Ativa"}],
  },
  integracoes: {
    slug:"integracoes",table:"integration_connections",title:"Integrações",singular:"integração",branchColumn:"branch_id",phaseLabel:"Integrações",subtitle:"Configure os serviços conectados sem guardar senhas no navegador.",defaults:{status:"draft"},
    fields:[{name:"provider",label:"Provedor",type:"select",required:true,defaultValue:"webhook",options:options([["whatsapp","WhatsApp"],["email","E-mail"],["sms","SMS"],["payment","Pagamentos"],["accounting","Contabilidade"],["parts_catalog","Catálogo de peças"],["webhook","Webhook"],["other","Outro"]])},{name:"name",label:"Nome",type:"text",required:true},{name:"status",label:"Status",type:"select",required:true,defaultValue:"draft",options:options([["draft","Rascunho"],["active","Ativa"],["paused","Pausada"],["error","Erro"]])},{name:"endpoint_url",label:"Endpoint",type:"text",wide:true,placeholder:"https://..."}],
    columns:[{key:"name",label:"Integração"},{key:"provider",label:"Provedor",format:"status"},{key:"status",label:"Status",format:"status"},{key:"endpoint_url",label:"Endpoint"},{key:"last_checked_at",label:"Última verificação",format:"datetime"}],
  },
};
