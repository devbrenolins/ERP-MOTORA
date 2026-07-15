import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageOrganization, getAdminAccess, isSameOrigin } from "@/lib/admin/access";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const inviteSchema = z.object({
  organizationId: z.uuid().optional(),
  fullName: z.string().trim().min(2).max(120),
  email: z.email().transform((value) => value.trim().toLowerCase()),
  branchId: z.uuid(),
  roleId: z.uuid(),
});

function requestedOrganization(access: Awaited<ReturnType<typeof getAdminAccess>>, value?: string | null) {
  if (!access) return null;
  return access.platformAdmin && value ? value : access.organizationId;
}

export async function GET(request: Request) {
  try {
    const access = await getAdminAccess();
    if (!access) return NextResponse.json({ error: "Faça login novamente." }, { status: 401 });
    const organizationId = requestedOrganization(access, new URL(request.url).searchParams.get("organizationId"));
    if (!organizationId || !canManageOrganization(access, organizationId)) {
      return NextResponse.json({ error: "Você não possui acesso para administrar usuários desta empresa." }, { status: 403 });
    }

    const admin = createAdminClient();
    const [{ data: organization }, { data: memberships, error }, { data: branches }, { data: roles }, { data: assignments }] = await Promise.all([
      admin.from("organizations").select("id,name").eq("id", organizationId).is("deleted_at", null).maybeSingle(),
      admin.from("organization_users").select("user_id,status,joined_at").eq("organization_id", organizationId),
      admin.from("branches").select("id,name,code").eq("organization_id", organizationId).eq("status", "active").is("deleted_at", null).order("name"),
      admin.from("roles").select("id,code,name,description").eq("organization_id", organizationId).is("deleted_at", null).order("name"),
      admin.from("user_roles").select("user_id,role_id,branch_id").eq("organization_id", organizationId),
    ]);
    if (error) throw error;

    const users = await Promise.all((memberships ?? []).map(async (membership) => {
      const [{ data: authData }, { data: profile }] = await Promise.all([
        admin.auth.admin.getUserById(membership.user_id),
        admin.from("profiles").select("full_name,phone").eq("id", membership.user_id).maybeSingle(),
      ]);
      const assignment = (assignments ?? []).find((item) => item.user_id === membership.user_id);
      return {
        id: membership.user_id,
        fullName: profile?.full_name || authData.user?.user_metadata?.full_name || "Usuário",
        email: authData.user?.email || "",
        phone: profile?.phone || "",
        status: membership.status,
        joinedAt: membership.joined_at,
        roleId: assignment?.role_id ?? null,
        branchId: assignment?.branch_id ?? null,
      };
    }));

    return NextResponse.json({
      organization,
      users,
      branches: branches ?? [],
      roles: (roles ?? []).filter((role) => access.platformAdmin || role.code !== "super_admin"),
      platformAdmin: access.platformAdmin,
    });
  } catch (error) {
    const message = error instanceof Error && error.message === "Supabase Admin não configurado."
      ? "A chave administrativa do Supabase ainda não foi configurada no servidor."
      : "Não foi possível carregar os usuários.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let invitedUserId: string | null = null;
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: "Origem da solicitação inválida." }, { status: 403 });
    const access = await getAdminAccess();
    if (!access) return NextResponse.json({ error: "Faça login novamente." }, { status: 401 });
    const parsed = inviteSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Revise o nome, e-mail, filial e cargo." }, { status: 400 });

    const organizationId = requestedOrganization(access, parsed.data.organizationId);
    if (!organizationId || !canManageOrganization(access, organizationId)) {
      return NextResponse.json({ error: "Você não possui acesso para convidar usuários nesta empresa." }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: selectedRole } = await admin.from("roles").select("code").eq("id", parsed.data.roleId).eq("organization_id", organizationId).is("deleted_at", null).maybeSingle();
    if (!selectedRole) return NextResponse.json({ error: "O cargo selecionado não pertence a esta empresa." }, { status: 400 });
    if (selectedRole.code === "super_admin" && !access.platformAdmin) {
      return NextResponse.json({ error: "Somente o Dev Admin pode conceder o cargo Dev Admin." }, { status: 403 });
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, "");
    const { data: invitation, error: invitationError } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
      redirectTo: `${appUrl}/reset-password`,
      data: { full_name: parsed.data.fullName },
    });
    if (invitationError || !invitation.user) {
      const duplicate = invitationError?.message.toLowerCase().includes("already");
      return NextResponse.json({ error: duplicate ? "Este e-mail já possui uma conta." : "Não foi possível enviar o convite." }, { status: 409 });
    }
    invitedUserId = invitation.user.id;

    const { error: provisionError } = await admin.rpc("provision_organization_user", {
      p_actor: access.userId,
      p_organization: organizationId,
      p_user: invitedUserId,
      p_branch: parsed.data.branchId,
      p_role: parsed.data.roleId,
    });
    if (provisionError) {
      await admin.auth.admin.deleteUser(invitedUserId);
      invitedUserId = null;
      throw provisionError;
    }

    return NextResponse.json({ message: "Usuário criado e convite enviado por e-mail." }, { status: 201 });
  } catch (error) {
    if (invitedUserId) {
      try { await createAdminClient().auth.admin.deleteUser(invitedUserId); } catch { /* melhor esforço de compensação */ }
    }
    const message = error instanceof Error && error.message === "Supabase Admin não configurado."
      ? "A chave administrativa do Supabase ainda não foi configurada no servidor."
      : "Não foi possível criar o usuário. Nenhum cadastro parcial foi mantido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
