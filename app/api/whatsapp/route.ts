import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/admin/access";
import { getBranchContext } from "@/lib/notifications/access";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  connectInstance, connectionState, ensureInstance, instanceNameForBranch, isEvolutionConfigured, logoutInstance,
} from "@/lib/whatsapp/evolution";

export const dynamic = "force-dynamic";

// Registro da conexão em integration_connections (auditável no módulo Integrações),
// sem nunca gravar a chave da Evolution — apenas o nome da instância.
async function recordConnection(context: { organizationId: string; branchId: string; userId: string }, status: "active" | "paused" | "draft" | "error", lastError: string | null = null) {
  const admin = createAdminClient();
  const instanceName = instanceNameForBranch(context.branchId);
  const { data: existing } = await admin.from("integration_connections").select("id").eq("organization_id", context.organizationId).eq("branch_id", context.branchId).eq("provider", "whatsapp").is("deleted_at", null).maybeSingle();
  const payload = {
    status, last_checked_at: new Date().toISOString(), last_error: lastError,
    settings: { instance: instanceName, managed_by: "evolution" }, updated_by: context.userId,
  };
  if (existing) await admin.from("integration_connections").update(payload).eq("id", existing.id);
  else await admin.from("integration_connections").insert({ organization_id: context.organizationId, branch_id: context.branchId, provider: "whatsapp", name: `WhatsApp • ${instanceName}`, created_by: context.userId, ...payload });
}

// Situação atual da conexão do WhatsApp da filial.
export async function GET() {
  const { context, error, status } = await getBranchContext("notifications.manage");
  if (!context) return NextResponse.json({ error }, { status });
  if (!isEvolutionConfigured()) return NextResponse.json({ configured: false, state: "unknown" });
  try {
    const state = await connectionState(instanceNameForBranch(context.branchId));
    return NextResponse.json({ configured: true, state });
  } catch (caught) {
    return NextResponse.json({ configured: true, state: "unknown", error: caught instanceof Error ? caught.message : "Falha ao consultar a conexão." }, { status: 502 });
  }
}

// Cria/garante a instância da filial e devolve o QR code de pareamento.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const { context, error, status } = await getBranchContext("notifications.manage");
  if (!context) return NextResponse.json({ error }, { status });
  if (!isEvolutionConfigured()) return NextResponse.json({ error: "Evolution API não configurada no servidor. Defina EVOLUTION_API_URL e EVOLUTION_API_KEY." }, { status: 501 });
  try {
    const instanceName = instanceNameForBranch(context.branchId);
    await ensureInstance(instanceName);
    const current = await connectionState(instanceName);
    if (current === "open") {
      await recordConnection(context, "active");
      return NextResponse.json({ state: "open", qr: null, pairingCode: null });
    }
    const result = await connectInstance(instanceName);
    await recordConnection(context, result.state === "open" ? "active" : "draft");
    return NextResponse.json({ state: result.state, qr: result.qrBase64, pairingCode: result.pairingCode });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Não foi possível conectar o WhatsApp.";
    await recordConnection(context, "error", message).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// Desconecta o número da filial (logout da sessão do WhatsApp).
export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const { context, error, status } = await getBranchContext("notifications.manage");
  if (!context) return NextResponse.json({ error }, { status });
  if (!isEvolutionConfigured()) return NextResponse.json({ error: "Evolution API não configurada no servidor." }, { status: 501 });
  try {
    await logoutInstance(instanceNameForBranch(context.branchId));
    await recordConnection(context, "paused");
    return NextResponse.json({ state: "close" });
  } catch (caught) {
    return NextResponse.json({ error: caught instanceof Error ? caught.message : "Não foi possível desconectar." }, { status: 502 });
  }
}
