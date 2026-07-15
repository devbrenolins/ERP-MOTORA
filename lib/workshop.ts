// Metadados compartilhados do painel da oficina e do portal do cliente:
// status das ordens de serviço, grupos de cor, indicadores e etapas de progresso.

export type WorkOrderStatus =
  | "awaiting_triage" | "diagnosis" | "awaiting_estimate" | "awaiting_approval" | "awaiting_parts"
  | "queued" | "in_progress" | "paused" | "outsourced" | "testing" | "washing"
  | "awaiting_payment" | "ready" | "delivered" | "cancelled";

export type BoardGroup = "scheduled" | "diagnosis" | "parts" | "maintenance" | "finished" | "delivered" | "overdue" | "cancelled";

export const STATUS_OPTIONS: Array<{ value: WorkOrderStatus; label: string }> = [
  { value: "awaiting_triage", label: "Aguardando triagem" },
  { value: "diagnosis", label: "Em diagnóstico" },
  { value: "awaiting_estimate", label: "Aguardando orçamento" },
  { value: "awaiting_approval", label: "Aguardando aprovação" },
  { value: "awaiting_parts", label: "Aguardando peças" },
  { value: "queued", label: "Na fila" },
  { value: "in_progress", label: "Em manutenção" },
  { value: "paused", label: "Serviço pausado" },
  { value: "outsourced", label: "Serviço terceirizado" },
  { value: "testing", label: "Em teste" },
  { value: "washing", label: "Em lavagem" },
  { value: "awaiting_payment", label: "Aguardando pagamento" },
  { value: "ready", label: "Pronto para retirada" },
  { value: "delivered", label: "Entregue" },
  { value: "cancelled", label: "Cancelado" },
];

const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS.map((option) => [option.value, option.label])) as Record<WorkOrderStatus, string>;
export const statusLabel = (status: string) => STATUS_LABELS[status as WorkOrderStatus] ?? status.replaceAll("_", " ");

const STATUS_GROUPS: Record<WorkOrderStatus, BoardGroup> = {
  awaiting_triage: "scheduled", queued: "scheduled",
  diagnosis: "diagnosis", awaiting_estimate: "diagnosis", awaiting_approval: "diagnosis",
  awaiting_parts: "parts",
  in_progress: "maintenance", paused: "maintenance", outsourced: "maintenance", testing: "maintenance", washing: "maintenance",
  awaiting_payment: "finished", ready: "finished",
  delivered: "delivered", cancelled: "cancelled",
};

export const GROUP_META: Record<BoardGroup, { label: string; row: string; accent: string }> = {
  scheduled: { label: "Agendado", row: "var(--row-blue)", accent: "var(--row-blue-strong)" },
  diagnosis: { label: "Aguardando diagnóstico", row: "var(--row-yellow)", accent: "var(--row-yellow-strong)" },
  parts: { label: "Aguardando peças", row: "var(--row-orange)", accent: "var(--row-orange-strong)" },
  maintenance: { label: "Em manutenção", row: "var(--row-purple)", accent: "var(--row-purple-strong)" },
  finished: { label: "Finalizado", row: "var(--row-green)", accent: "var(--row-green-strong)" },
  delivered: { label: "Entregue", row: "var(--row-dark)", accent: "var(--row-dark-strong)" },
  overdue: { label: "Atrasado", row: "var(--row-red)", accent: "var(--row-red-strong)" },
  cancelled: { label: "Cancelado", row: "var(--row-gray)", accent: "var(--row-gray-strong)" },
};

export const isOpenStatus = (status: string) => !["ready", "delivered", "cancelled"].includes(status);
export const isOverdue = (status: string, dueAt: string | null) => Boolean(dueAt) && new Date(dueAt as string).getTime() < Date.now() && isOpenStatus(status);

export function boardGroup(status: string, dueAt: string | null): BoardGroup {
  if (isOverdue(status, dueAt)) return "overdue";
  return STATUS_GROUPS[status as WorkOrderStatus] ?? "scheduled";
}

// Etapas exibidas na barra de progresso do serviço.
export const PROGRESS_STAGES = ["Recebido", "Diagnóstico", "Peças", "Execução", "Finalizado", "Entregue"] as const;

export function progressIndex(status: string): number {
  const group = STATUS_GROUPS[status as WorkOrderStatus];
  if (status === "cancelled") return -1;
  if (group === "scheduled") return 0;
  if (group === "diagnosis") return 1;
  if (group === "parts") return 2;
  if (group === "maintenance") return 3;
  if (group === "finished") return 4;
  return 5;
}

export const IDLE_DAYS_THRESHOLD = 3;
export const idleDays = (updatedAt: string) => Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000);

export const money = (value: number | null | undefined) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
export const shortDate = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(value)) : "—";
export const fullDate = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("pt-BR").format(new Date(value)) : "—";
export const dateTime = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
