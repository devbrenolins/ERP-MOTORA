import "server-only";

// Cliente da Evolution API v2.3 para envio de WhatsApp.
// A URL e a chave da API vivem apenas em variáveis de ambiente do servidor
// (EVOLUTION_API_URL / EVOLUTION_API_KEY) e nunca chegam ao navegador —
// o front-end conversa somente com as rotas internas /api/whatsapp.

export type ConnectionState = "open" | "connecting" | "close" | "unknown";
export type ConnectResult = { state: ConnectionState; qrBase64: string | null; pairingCode: string | null };

function environment() {
  const baseUrl = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  return { baseUrl, apiKey };
}

export function isEvolutionConfigured() {
  const { baseUrl, apiKey } = environment();
  return Boolean(baseUrl && apiKey);
}

async function evolutionFetch(path: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  const { baseUrl, apiKey } = environment();
  if (!baseUrl || !apiKey) throw new Error("Evolution API não configurada. Defina EVOLUTION_API_URL e EVOLUTION_API_KEY no servidor.");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", apikey: apiKey, ...(init?.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  let body: Record<string, unknown> = {};
  try { body = (await response.json()) as Record<string, unknown>; } catch { /* respostas sem corpo */ }
  return { status: response.status, body };
}

function extractState(body: Record<string, unknown>): ConnectionState {
  const instance = (body.instance ?? body) as Record<string, unknown>;
  const state = String(instance.state ?? instance.connectionStatus ?? instance.status ?? "unknown");
  if (state === "open" || state === "connecting" || state === "close") return state;
  return "unknown";
}

// Garante que a instância exista (idempotente: 403/409 de nome em uso são aceitos).
export async function ensureInstance(instanceName: string): Promise<void> {
  const { status, body } = await evolutionFetch("/instance/create", {
    method: "POST",
    body: JSON.stringify({ instanceName, integration: "WHATSAPP-BAILEYS", qrcode: true }),
  });
  if (status >= 200 && status < 300) return;
  const message = JSON.stringify(body).toLowerCase();
  if (status === 403 || status === 409 || message.includes("already") || message.includes("in use")) return;
  throw new Error(`Não foi possível criar a instância do WhatsApp (HTTP ${status}).`);
}

// Solicita o QR code de pareamento (retorna imagem base64 pronta para exibir).
export async function connectInstance(instanceName: string): Promise<ConnectResult> {
  const { status, body } = await evolutionFetch(`/instance/connect/${encodeURIComponent(instanceName)}`);
  if (status === 404) throw new Error("instance_not_found");
  if (status >= 400) throw new Error(`Não foi possível gerar o QR code (HTTP ${status}).`);
  const raw = String(body.base64 ?? (body.qrcode as Record<string, unknown> | undefined)?.base64 ?? "");
  const qrBase64 = raw ? (raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`) : null;
  const pairingCode = body.pairingCode ? String(body.pairingCode) : null;
  return { state: qrBase64 ? "connecting" : extractState(body), qrBase64, pairingCode };
}

export async function connectionState(instanceName: string): Promise<ConnectionState> {
  const { status, body } = await evolutionFetch(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
  if (status === 404) return "close";
  if (status >= 400) return "unknown";
  return extractState(body);
}

export async function logoutInstance(instanceName: string): Promise<void> {
  await evolutionFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
}

// Normaliza telefones brasileiros para o formato aceito pela Evolution (DDI+DDD+número).
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export async function sendText(instanceName: string, phone: string, text: string): Promise<void> {
  const number = normalizePhone(phone);
  if (!number) throw new Error("Telefone do destinatário inválido.");
  const { status, body } = await evolutionFetch(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ number, text }),
  });
  if (status >= 400) {
    const detail = typeof body.message === "string" ? body.message : JSON.stringify(body.message ?? body.error ?? "");
    throw new Error(`Falha no envio pelo WhatsApp (HTTP ${status})${detail ? `: ${detail.slice(0, 180)}` : ""}.`);
  }
}

// Nome determinístico da instância por filial — sem expor identificadores sensíveis.
export function instanceNameForBranch(branchId: string) {
  return `motora-${branchId}`;
}
