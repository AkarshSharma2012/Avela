/**
 * Review-queue workflow CLI (Milestone 7 spec section 12). Lists open
 * `opportunity_review_queue` entries with title/source/reason/last
 * checked/suggested action, and supports exactly three safe, explicit
 * actions — never arbitrary field editing:
 *
 *   npm run opportunities:review                          # list open entries
 *   npm run opportunities:review -- --mark-reviewed=<id>   # resolve, no other change
 *   npm run opportunities:review -- --reject=<id>          # deactivate the opportunity, resolve the entry
 *   npm run opportunities:review -- --recheck=<id>         # force it to the front of the recheck queue, resolve the entry
 *
 * `<id>` is always the `opportunity_review_queue.id`, never a raw
 * opportunity id or arbitrary column name — each action performs one
 * hardcoded update, not a user-supplied field/value pair. No public
 * admin UI exists yet, per the spec ("Do not build a public admin UI
 * yet").
 */

import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

import { formatReviewQueueEntry, parseReviewAction, type ReviewQueueDisplayEntry } from "../src/lib/opportunities/review-cli";
import type { Database } from "../src/types/database";

loadEnvConfig(process.cwd());

async function listOpenEntries(supabase: ReturnType<typeof createClient<Database>>) {
  const { data: entries, error } = await supabase
    .from("opportunity_review_queue")
    .select("id, opportunity_id, reason, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load review queue: ${error.message}`);
  if (!entries || entries.length === 0) {
    console.log("[review] No open review-queue entries.");
    return;
  }

  const opportunityIds = [...new Set(entries.map((e) => e.opportunity_id).filter((id): id is string => id !== null))];
  const { data: opportunities, error: oppError } = await supabase
    .from("opportunities")
    .select("id, title, source_id, last_verified_at")
    .in("id", opportunityIds.length > 0 ? opportunityIds : ["00000000-0000-0000-0000-000000000000"]);
  if (oppError) throw new Error(`Failed to load opportunities: ${oppError.message}`);

  const sourceIds = [...new Set((opportunities ?? []).map((o) => o.source_id).filter((id): id is string => id !== null))];
  const { data: sources, error: sourceError } =
    sourceIds.length > 0
      ? await supabase.from("opportunity_sources").select("id, name").in("id", sourceIds)
      : { data: [], error: null };
  if (sourceError) throw new Error(`Failed to load sources: ${sourceError.message}`);

  const oppById = new Map((opportunities ?? []).map((o) => [o.id, o]));
  const sourceNameById = new Map((sources ?? []).map((s) => [s.id, s.name]));

  // Group by opportunity_id (or raw review id when null) so one card with
  // multiple reasons prints once, not once per reason.
  const grouped = new Map<string, { reviewIds: string[]; opportunityId: string | null; reasons: Set<string>; createdAt: string }>();
  for (const entry of entries) {
    const key = entry.opportunity_id ?? entry.id;
    const existing = grouped.get(key);
    if (existing) {
      existing.reviewIds.push(entry.id);
      existing.reasons.add(entry.reason);
    } else {
      grouped.set(key, {
        reviewIds: [entry.id],
        opportunityId: entry.opportunity_id,
        reasons: new Set([entry.reason]),
        createdAt: entry.created_at,
      });
    }
  }

  console.log(`[review] ${grouped.size} opportunity(ies) with open review flags:\n`);
  for (const group of grouped.values()) {
    const opportunity = group.opportunityId ? oppById.get(group.opportunityId) : undefined;
    const display: ReviewQueueDisplayEntry = {
      reviewId: group.reviewIds.join(", "),
      opportunityTitle: opportunity?.title ?? null,
      sourceName: opportunity?.source_id ? (sourceNameById.get(opportunity.source_id) ?? null) : null,
      reasons: [...group.reasons] as ReviewQueueDisplayEntry["reasons"],
      lastCheckedAt: opportunity?.last_verified_at ?? null,
      createdAt: group.createdAt,
    };
    console.log(formatReviewQueueEntry(display));
    console.log("");
  }
}

async function main() {
  const argv = process.argv.slice(2);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set SUPABASE_SERVICE_ROLE_KEY in .env.local (never commit it) — see docs/security.md."
    );
    process.exitCode = 1;
    return;
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const action = parseReviewAction(argv);
  if (!action) {
    await listOpenEntries(supabase);
    return;
  }

  const { data: entry, error: fetchError } = await supabase
    .from("opportunity_review_queue")
    .select("id, opportunity_id")
    .eq("id", action.reviewId)
    .maybeSingle();
  if (fetchError || !entry) {
    console.error(`[review] Could not find review-queue entry ${action.reviewId}:`, fetchError?.message ?? "not found");
    process.exitCode = 1;
    return;
  }

  if (action.kind === "reject" && entry.opportunity_id) {
    const { error } = await supabase
      .from("opportunities")
      .update({ is_active: false, verification_status: "rejected" })
      .eq("id", entry.opportunity_id);
    if (error) {
      console.error("[review] Failed to reject opportunity:", error.message);
      process.exitCode = 1;
      return;
    }
  }

  if (action.kind === "recheck" && entry.opportunity_id) {
    const { error } = await supabase
      .from("opportunities")
      .update({ next_verification_at: new Date().toISOString() })
      .eq("id", entry.opportunity_id);
    if (error) {
      console.error("[review] Failed to schedule recheck:", error.message);
      process.exitCode = 1;
      return;
    }
  }

  const { error: resolveError } = await supabase
    .from("opportunity_review_queue")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", action.reviewId);
  if (resolveError) {
    console.error("[review] Failed to resolve review-queue entry:", resolveError.message);
    process.exitCode = 1;
    return;
  }

  console.log(`[review] ${action.kind} applied to ${action.reviewId}.`);
}

main();
