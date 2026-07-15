import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess, isSameOrigin } from "@/lib/admin/access";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const createCompanySchema = z.object({
  name: z.string().trim().min(2).max(120),
  legalName: z.string().trim().min(2).max(180),
  taxId: z.string().transform((value) => value.replace(/\D/g, "")).pipe(z.string().regex(/^\d{11,14}$/)),
  branchName: z.string().trim().min(2).max(120),
  branchCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,10}$/),
  ownerName: z.string().trim().min(2).max(120),
  ownerEmail: z.email().transform((value) => value.trim().toLowerCase()),
});

export async function GET() {
  try {
    const access = await getAdminAccess();
    if (!access) return NextResponse.json({ error: "Faça login novamente." }, { status: 401 });
    if (!access.platformAdmin) return NextResponse.json({ error: "Apenas o Dev Admin pode cadastrar empresas." }, { status: 403 });

    const admin = createAdminClient();
    const [{ data: organizations, error }, { data: branches }] = await Promise.all([
      admin.from("organizations").select("id,name,legal_name,tax_id,status,created_at").is("deleted_at", null).order("created_at", { ascending: false }),
      admin.from("branches").select("id,organization_id").is("deleted_at", null),
    ]);
    if (error) throw error;
    const branchCount = new Map<string, number>();
    for (const branch of branches ?? []) branchCount.set(branch.organization_id, (branchCount.get(branch.organization_id) ?? 0) + 1);

    return NextResponse.json({
      organizations: (organizations ?? []).map((organization) => ({
        ...organization,
        branchCount: branchCount.get(organization.id) ?? 0,
      })),
    });
  } catch (error) {
    const message = error instanceof Error && error.message === "Supabase Admin não configurado."
      ? "A chave administrativa do Supabase ainda não foi configurada no servidor."
      : "Não foi possível carregar as empresas.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let invitedUserId: string | null = null;
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: "Origem da solicitação inválida." }, { status: 403 });
    const access = await getAdminAccess();
    if (!access) return NextResponse.json({ error: "Faça login novamente." }, { status: 401 });
    if (!access.platformAdmin) return NextResponse.json({ error: "Apenas o Dev Admin pode cadastrar empresas." }, { status: 403 });

    const parsed = createCompanySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Revise os dados da empresa e do responsável." }, { status: 400 });

    const admin = createAdminClient();
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, "");
    const { data: invitation, error: invitationError } = await admin.auth.admin.inviteUserByEmail(parsed.data.ownerEmail, {
      redirectTo: `${appUrl}/reset-password`,
      data: { full_name: parsed.data.ownerName },
    });
    if (invitationError || !invitation.user) {
      const duplicate = invitationError?.message.toLowerCase().includes("already");
      return NextResponse.json({ error: duplicate ? "Este e-mail já possui uma conta." : "Não foi possível enviar o convite ao responsável." }, { status: 409 });
    }
    invitedUserId = invitation.user.id;

    const { data: provisioned, error: provisionError } = await admin.rpc("provision_customer_organization", {
      p_actor: access.userId,
      p_owner_user: invitedUserId,
      p_organization_name: parsed.data.name,
      p_legal_name: parsed.data.legalName,
      p_tax_id: parsed.data.taxId,
      p_branch_name: parsed.data.branchName,
      p_branch_code: parsed.data.branchCode,
      p_timezone: "America/Bahia",
    });
    if (provisionError) {
      await admin.auth.admin.deleteUser(invitedUserId);
      invitedUserId = null;
      if (provisionError.message.includes("organizations_tax_id_key")) {
        return NextResponse.json({ error: "Já existe uma empresa com este CPF ou CNPJ." }, { status: 409 });
      }
      throw provisionError;
    }

    return NextResponse.json({ organization: provisioned, message: "Empresa criada e convite enviado ao Superadmin." }, { status: 201 });
  } catch (error) {
    if (invitedUserId) {
      try { await createAdminClient().auth.admin.deleteUser(invitedUserId); } catch { /* melhor esforço de compensação */ }
    }
    const message = error instanceof Error && error.message === "Supabase Admin não configurado."
      ? "A chave administrativa do Supabase ainda não foi configurada no servidor."
      : "Não foi possível criar a empresa. Nenhum cadastro parcial foi mantido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
