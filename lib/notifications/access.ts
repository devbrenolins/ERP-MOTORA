import "server-only";

import { createClient } from "@/lib/supabase/server";

export type BranchContext = { userId: string; organizationId: string; branchId: string };

// Identifica o usuário logado (via cookies) e valida a permissão informada na
// filial ativa. A checagem roda no banco com a mesma função usada pelas RLS.
export async function getBranchContext(permission: string): Promise<{ context: BranchContext | null; error: string | null; status: number }> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { context: null, error: "Faça login novamente.", status: 401 };

  const { data: profile } = await supabase.from("profiles").select("last_organization_id,last_branch_id").eq("id", user.id).maybeSingle();
  if (!profile?.last_organization_id || !profile.last_branch_id) {
    return { context: null, error: "Selecione uma filial antes de usar este recurso.", status: 400 };
  }

  const { data: allowed, error: permissionError } = await supabase.rpc("has_permission", {
    p_organization_id: profile.last_organization_id,
    p_branch_id: profile.last_branch_id,
    p_permission: permission,
  });
  if (permissionError || !allowed) {
    return { context: null, error: "Você não possui permissão para esta ação.", status: 403 };
  }

  return {
    context: { userId: user.id, organizationId: profile.last_organization_id, branchId: profile.last_branch_id },
    error: null,
    status: 200,
  };
}
