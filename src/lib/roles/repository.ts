import type { SupabaseClient } from "@supabase/supabase-js";

import { createVerificationServiceRoleClient } from "@/lib/verification/repository";
import type { Database } from "@/types/database";
import type { UserRoleValue } from "@/types/database";

type Client = SupabaseClient<Database>;

/** user_roles has zero client-facing RLS policies — every access goes through this, same guarded factory verification/repository.ts already established. */
export { createVerificationServiceRoleClient as createRolesServiceRoleClient };

export async function listRolesForUser(serviceClient: Client, userId: string): Promise<UserRoleValue[]> {
  const { data, error } = await serviceClient.from("user_roles").select("role").eq("user_id", userId);
  if (error) {
    console.error("[roles] failed to load roles:", error.message);
    return [];
  }
  return (data ?? []).map((row) => row.role);
}

export async function grantRole(serviceClient: Client, userId: string, role: UserRoleValue, grantedBy: string | null): Promise<{ error: string | null }> {
  const { error } = await serviceClient.from("user_roles").upsert({ user_id: userId, role, granted_by: grantedBy }, { onConflict: "user_id,role" });
  return { error: error?.message ?? null };
}

export async function revokeRole(serviceClient: Client, userId: string, role: UserRoleValue): Promise<{ error: string | null }> {
  const { error } = await serviceClient.from("user_roles").delete().eq("user_id", userId).eq("role", role);
  return { error: error?.message ?? null };
}
