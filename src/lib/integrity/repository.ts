import type { SupabaseClient } from "@supabase/supabase-js";

import { createVerificationServiceRoleClient } from "@/lib/verification/repository";
import type { Database } from "@/types/database";
import type { DetectedSignal } from "@/lib/integrity/signals";
import type { IntegritySignal } from "@/types/integrity";

type Client = SupabaseClient<Database>;

/** Same underlying guarded factory as verification/repository.ts — every table this module touches has zero client-facing RLS policies, so every call here is service-role only, never reachable from a client session. */
export { createVerificationServiceRoleClient as createIntegrityServiceRoleClient };

export async function insertIntegritySignal(
  serviceClient: Client,
  userId: string,
  signal: DetectedSignal
): Promise<{ error: string | null }> {
  const { error } = await serviceClient.from("integrity_signals").insert({
    user_id: userId,
    portfolio_item_id: signal.portfolioItemId ?? null,
    related_user_id: signal.relatedUserId ?? null,
    signal_type: signal.signalType,
    risk_level: signal.riskLevel,
    details: signal.details,
  });
  return { error: error?.message ?? null };
}

/** Reviewer-only queue — every row here is, by construction, never selectable by any client session (the table has no select policy at all). */
export async function listSignalsRequiringReview(serviceClient: Client): Promise<IntegritySignal[]> {
  const { data, error } = await serviceClient
    .from("integrity_signals")
    .select("*")
    .in("risk_level", ["manual_review", "temporarily_limited"])
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[integrity] failed to load signals requiring review:", error.message);
    return [];
  }
  return data ?? [];
}

export async function recordIntegrityReview(
  serviceClient: Client,
  input: { userId: string; signalId: string; reviewerEmail: string; decision: Database["public"]["Tables"]["integrity_reviews"]["Row"]["decision"]; reason: string }
): Promise<{ error: string | null }> {
  const { error } = await serviceClient.from("integrity_reviews").insert({
    user_id: input.userId,
    signal_id: input.signalId,
    reviewer_email: input.reviewerEmail,
    decision: input.decision,
    reason: input.reason,
  });
  return { error: error?.message ?? null };
}

/** How many *distinct users* have a portfolio_files row with this exact content hash — the cross-student duplicate-evidence signal (never a within-one-student check, which strength.ts already handles as a farming control instead). */
export async function countDistinctUsersForContentHash(serviceClient: Client, contentHash: string): Promise<number> {
  const { data, error } = await serviceClient.from("portfolio_files").select("user_id").eq("content_hash", contentHash);
  if (error) {
    console.error("[integrity] failed to count distinct users for content hash:", error.message);
    return 0;
  }
  return new Set((data ?? []).map((row) => row.user_id)).size;
}

/** Every distinct content_hash that appears on more than one student's files — the batch form of the check above, for a periodic sweep rather than a per-upload check. */
export async function listCrossStudentDuplicateHashes(serviceClient: Client): Promise<{ contentHash: string; distinctUserCount: number }[]> {
  const { data, error } = await serviceClient.from("portfolio_files").select("user_id, content_hash").not("content_hash", "is", null);
  if (error) {
    console.error("[integrity] failed to list content hashes:", error.message);
    return [];
  }

  const usersByHash = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    if (!row.content_hash) continue;
    const set = usersByHash.get(row.content_hash) ?? new Set<string>();
    set.add(row.user_id);
    usersByHash.set(row.content_hash, set);
  }

  return [...usersByHash.entries()]
    .filter(([, users]) => users.size > 1)
    .map(([contentHash, users]) => ({ contentHash, distinctUserCount: users.size }));
}

/** Pairs of students who each used the other's account email as a verifier — the circular-verification signal. Scans portfolio_verifications for verifier_email matching another user's own auth email, which requires joining against auth.users; done here via two lookups rather than a raw SQL join, since the service-role client's query builder doesn't cross schemas easily. */
export async function findCircularVerificationPairs(
  serviceClient: Client
): Promise<{ studentAId: string; studentBId: string }[]> {
  const { data: verifications, error } = await serviceClient
    .from("portfolio_verifications")
    .select("user_id, verifier_email")
    .not("verifier_email", "is", null);
  if (error) {
    console.error("[integrity] failed to load verifications for circular check:", error.message);
    return [];
  }

  const { data: users, error: usersError } = await serviceClient.auth.admin.listUsers();
  if (usersError) {
    console.error("[integrity] failed to list users for circular check:", usersError.message);
    return [];
  }
  const userIdByEmail = new Map((users.users ?? []).filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u.id]));

  const verifierEmailsByStudent = new Map<string, Set<string>>();
  for (const row of verifications ?? []) {
    if (!row.verifier_email) continue;
    const set = verifierEmailsByStudent.get(row.user_id) ?? new Set<string>();
    set.add(row.verifier_email.toLowerCase());
    verifierEmailsByStudent.set(row.user_id, set);
  }

  const pairs: { studentAId: string; studentBId: string }[] = [];
  const seen = new Set<string>();
  for (const [studentA, verifierEmails] of verifierEmailsByStudent) {
    for (const email of verifierEmails) {
      const studentB = userIdByEmail.get(email);
      if (!studentB || studentB === studentA) continue;
      const bUsedAAsVerifier = [...(verifierEmailsByStudent.get(studentB) ?? [])].some((bEmail) => userIdByEmail.get(bEmail) === studentA);
      if (!bUsedAAsVerifier) continue;
      const key = [studentA, studentB].sort().join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ studentAId: studentA, studentBId: studentB });
    }
  }
  return pairs;
}
