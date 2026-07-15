import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminAccess = {
  userId: string;
  organizationId: string | null;
  platformAdmin: boolean;
  roleCodes: string[];
};

export async function getAdminAccess(): Promise<AdminAccess | null> {
  const sessionClient = await createClient();
  const { data: { user }, error: userError } = await sessionClient.auth.getUser();
  if (userError || !user) return null;

  const admin = createAdminClient();
  const [{ data: profile }, { data: platformRow }] = await Promise.all([
    admin.from("profiles").select("last_organization_id").eq("id", user.id).maybeSingle(),
    admin.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);

  const organizationId = profile?.last_organization_id ?? null;
  let roleCodes: string[] = [];
  if (organizationId) {
    const { data: assignments } = await admin
      .from("user_roles")
      .select("role_id")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId);
    const roleIds = (assignments ?? []).map((item) => item.role_id);
    if (roleIds.length) {
      const { data: roles } = await admin.from("roles").select("code").in("id", roleIds).is("deleted_at", null);
      roleCodes = (roles ?? []).map((role) => role.code);
    }
  }

  return { userId: user.id, organizationId, platformAdmin: Boolean(platformRow), roleCodes };
}

export function canManageOrganization(access: AdminAccess, organizationId: string) {
  return access.platformAdmin || (
    access.organizationId === organizationId && access.roleCodes.some((code) => code === "owner" || code === "super_admin")
  );
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; }
  catch { return false; }
}
