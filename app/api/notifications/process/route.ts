import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/admin/access";
import { getBranchContext } from "@/lib/notifications/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { connectionState, instanceNameForBranch, isEvolutionConfigured, sendText } from "@/lib/whatsapp/evolution";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 30;

type QueuedNotification = {
  id: string; organization_id: string; branch_id: string; channel: "whatsapp" | "sms" | "email";
  recipient: string; subject: string | null; message: string; status: string;
};

// Worker da fila customer_notifications: envia cada aviso pendente e marca
// sent/failed. WhatsApp sai pela Evolution API (instância da filial); e-mail
// usa o Resend quando configurado; SMS permanece como estrutura preparada.
async function processQueue(organizationId: string | null) {
  const admin = createAdminClient();
  let query = admin.from("customer_notifications")
    .select("id,organization_id,branch_id,channel,recipient,subject,message,status")
    .eq("status", "pending").lte("scheduled_at", new Date().toISOString())
    .order("created_at", { ascending: true }).limit(BATCH_SIZE);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query;
  if (error) throw error;

  const stateByInstance = new Map<string, string>();
  let sent = 0; let failed = 0;

  for (const notification of (data ?? []) as QueuedNotification[]) {
    // Reivindica a mensagem antes de enviar para evitar envio duplicado quando
    // o cron e o disparo manual rodarem ao mesmo tempo.
    const { data: claimed } = await admin.from("customer_notifications")
      .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
      .eq("id", notification.id).eq("status", "pending").select("id");
    if (!claimed?.length) continue;

    try {
      if (notification.channel === "whatsapp") {
        if (!isEvolutionConfigured()) throw new Error("Evolution API não configurada no servidor.");
        const instanceName = instanceNameForBranch(notification.branch_id);
        let state = stateByInstance.get(instanceName);
        if (!state) { state = await connectionState(instanceName); stateByInstance.set(instanceName, state); }
        if (state !== "open") throw new Error("WhatsApp da filial não está conectado. Escaneie o QR code em Notificações.");
        await sendText(instanceName, notification.recipient, notification.message);
      } else if (notification.channel === "email") {
        await sendEmail(notification);
      } else {
        throw new Error("Canal de SMS ainda não configurado (estrutura pronta para integração).");
      }
      sent += 1;
    } catch (caught) {
      failed += 1;
      await admin.from("customer_notifications")
        .update({ status: "failed", sent_at: null, error: caught instanceof Error ? caught.message.slice(0, 500) : "Falha no envio." })
        .eq("id", notification.id);
    }
  }
  return { processed: sent + failed, sent, failed };
}

// E-mail transacional via Resend (opcional): RESEND_API_KEY e EMAIL_FROM no servidor.
async function sendEmail(notification: QueuedNotification) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Canal de e-mail não configurado. Defina RESEND_API_KEY e EMAIL_FROM.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: [notification.recipient], subject: notification.subject ?? "Atualização do seu veículo", text: notification.message }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Falha no envio do e-mail (HTTP ${response.status}).`);
}

// Execução agendada (Vercel Cron envia GET com Authorization: Bearer CRON_SECRET).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  try {
    const result = await processQueue(null);
    return NextResponse.json(result);
  } catch (caught) {
    return NextResponse.json({ error: caught instanceof Error ? caught.message : "Falha ao processar a fila." }, { status: 500 });
  }
}

// Execução sob demanda por usuário autenticado (limitada à organização dele).
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const { context, error, status } = await getBranchContext("notifications.view");
  if (!context) return NextResponse.json({ error }, { status });
  try {
    const result = await processQueue(context.organizationId);
    return NextResponse.json(result);
  } catch (caught) {
    return NextResponse.json({ error: caught instanceof Error ? caught.message : "Falha ao processar a fila." }, { status: 500 });
  }
}
