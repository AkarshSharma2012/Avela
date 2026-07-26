import type { SupabaseClient } from "@supabase/supabase-js";

import { MATCHING_POOL_LIMIT, PAGE_SIZE } from "@/lib/opportunities/constants";
import type { OpportunityFilters } from "@/lib/opportunities/search-params";
import { sortByRelevance, type RelevanceRankable } from "@/lib/opportunities/search-ranking";
import type { Database } from "@/types/database";
import type { Opportunity } from "@/types/opportunity";

type Client = SupabaseClient<Database>;

const DEADLINE_WINDOW_DAYS: Record<Exclude<OpportunityFilters["deadlineWithin"], "any">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** Strips characters meaningful to PostgREST's `.or()` filter DSL (`,`, `(`, `)`) out of free-text search input. */
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()]/g, " ").trim();
}

export type ListOpportunitiesResult = {
  data: Opportunity[];
  count: number;
  error: string | null;
};

/**
 * Applies every Opportunities-page filter as a server-side Postgrest query
 * rather than fetching everything and filtering in JS — search, type,
 * format, cost, remote, grade, deadline window, and weekly-commitment cap
 * all become `.eq`/`.in`/`.or` clauses evaluated by Postgres.
 *
 * Milestone 5 additionally applies a handful of *unconditional* default
 * exclusions on top of whatever filters the student picked — expired
 * (`deadline_status = closed`), closed applications, rejected/stale
 * verification, and (when the student's grade is known) grade-ineligible
 * rows — because the spec requires these hidden by default, not just
 * hideable via an opt-in checkbox. Residency is included the same way
 * whenever the student's state is known; citizenship can never be fully
 * resolved from `profiles` alone (see eligibility-engine.ts), so a
 * confirmed requirement is hidden by default and only shown when
 * `includeUnclearEligibility` is set. See docs/decision-log.md.
 */
function toRankable(opportunity: Opportunity): Opportunity & RelevanceRankable {
  return {
    ...opportunity,
    interestTags: opportunity.interest_tags,
    opportunityType: opportunity.opportunity_type,
    locationText: opportunity.location_text,
    verificationLabel: opportunity.verification_label,
    applicationStatus: opportunity.application_status,
  };
}

/** Safety cap on how many matching rows a text search re-ranks client-side — this catalog is small (spec section: 20-40 opportunities target), so re-ranking in JS rather than building relevance scoring into Postgrest is the pragmatic choice (see docs/decision-log.md), but the cap keeps that assumption from silently breaking if the catalog grows far beyond that. */
const SEARCH_RERANK_LIMIT = 500;

export async function listOpportunities(
  supabase: Client,
  filters: OpportunityFilters,
  gradeLevel: number | null,
  options: { studentState?: string | null; now?: Date; studentInterestTags?: readonly string[] } = {}
): Promise<ListOpportunitiesResult> {
  const now = options.now ?? new Date();
  const studentState = options.studentState ?? null;

  let query = supabase.from("opportunities").select("*", { count: "exact" }).eq("is_active", true);

  if (filters.q) {
    const pattern = `%${sanitizeSearchTerm(filters.q)}%`;
    query = query.or(
      `title.ilike."${pattern}",organization.ilike."${pattern}",description.ilike."${pattern}"`
    );
  }

  if (filters.types.length > 0) {
    query = query.in("opportunity_type", filters.types);
  }

  if (filters.formats.length > 0) {
    query = query.in("format", filters.formats);
  }

  if (filters.costs.length > 0) {
    query = query.in("cost_type", filters.costs);
  }

  if (filters.remoteOnly) {
    query = query.eq("remote_allowed", true);
  }

  // Grade-ineligible rows are hidden by default whenever the student's
  // grade is known (Milestone 5 section 13) — not only when `myGradeOnly`
  // is explicitly checked. The checkbox is kept for backward compatibility
  // but applying the same clauses again when it's set is a harmless no-op.
  if (gradeLevel !== null) {
    query = query
      .or(`min_grade.is.null,min_grade.lte.${gradeLevel}`)
      .or(`max_grade.is.null,max_grade.gte.${gradeLevel}`);
  }

  const nowIso = now.toISOString();
  query = query.or(`application_deadline.is.null,application_deadline.gte.${nowIso}`);

  // Default exclusions (section 13): expired, closed applications, and
  // rejected/stale verification are never shown unless a listing simply
  // hasn't been classified yet (the `unknown`/`unverified` defaults new
  // rows are created with, which must keep passing through unaffected).
  query = query.or("deadline_status.neq.closed");
  query = query.or("application_status.neq.closed");
  query = query.or("verification_status.neq.rejected");
  query = query.or("verification_status.neq.stale");

  // Residency is excluded by default only when the student's state is
  // known and doesn't match — an unknown state never hides a
  // residency-restricted listing, it's just labeled "unclear" in the UI.
  if (studentState) {
    const pattern = sanitizeSearchTerm(studentState);
    query = query.or(`residency_requirements.is.null,residency_requirements.ilike."%${pattern}%"`);
  }

  // A confirmed citizenship requirement can never be resolved to a firm
  // "eligible" from `profiles` alone (no citizenship/visa field exists),
  // so it's hidden by default and only shown when the student opts in.
  if (!filters.includeUnclearEligibility) {
    query = query.or(`citizenship_requirements.is.null,citizenship_requirements.ilike."%none%"`);
  }

  // Opt-in toggles (section 16) — narrow further than the defaults above.
  if (filters.verifiedOnly) {
    query = query.eq("verification_status", "verified");
  }
  if (filters.acceptingOnly) {
    query = query.eq("application_status", "accepting_applications");
  }
  if (filters.rollingOnly) {
    query = query.eq("deadline_status", "rolling");
  }
  if (filters.openingSoonOnly) {
    query = query.eq("application_status", "opening_soon");
  }
  if (filters.eligibleOnly && !studentState) {
    // Can't confirm residency without a known state — exclude anything
    // that names one at all, stricter than the default (which only
    // excludes a confirmed *mismatch*).
    query = query.or("residency_requirements.is.null");
  }

  if (filters.deadlineWithin !== "any") {
    const windowEnd = new Date(now.getTime() + DEADLINE_WINDOW_DAYS[filters.deadlineWithin] * 86_400_000);
    query = query.or(`application_deadline.is.null,application_deadline.lte.${windowEnd.toISOString()}`);
  }

  if (filters.maxWeeklyHours !== null) {
    query = query.or(
      `weekly_commitment_hours.is.null,weekly_commitment_hours.lte.${filters.maxWeeklyHours}`
    );
  }

  const from = (filters.page - 1) * PAGE_SIZE;

  // A text search re-ranks by deterministic relevance (title/org/tag/
  // description match + profile-match signals + verification quality —
  // see search-ranking.ts) rather than the plain deadline/created_at
  // ordering below, since relevance can't be expressed as a Postgrest
  // `.order()` clause. Every matching row (up to a safety cap) is fetched
  // once, ranked in JS, then sliced for the requested page — reasonable
  // for this catalog's scale (tens, not thousands, of rows).
  if (filters.q) {
    const { data, count, error } = await query.order("created_at", { ascending: false }).limit(SEARCH_RERANK_LIMIT);

    if (error) {
      console.error("[opportunities] failed to list opportunities:", error.message);
      return { data: [], count: 0, error: "Something went wrong loading opportunities." };
    }

    const ranked = sortByRelevance((data ?? []).map(toRankable), filters.q, options.studentInterestTags ?? []);
    const page = ranked.slice(from, from + PAGE_SIZE);
    return { data: page, count: count ?? ranked.length, error: null };
  }

  const to = from + PAGE_SIZE - 1;

  const { data, count, error } = await query
    .order("application_deadline", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("[opportunities] failed to list opportunities:", error.message);
    return { data: [], count: 0, error: "Something went wrong loading opportunities." };
  }

  return { data: data ?? [], count: count ?? 0, error: null };
}

/**
 * The full active, real (non-sample) opportunity pool a student's profile
 * can be matched against — no free-text search, type/format/cost filters,
 * or pagination, since "Chosen for You" (chosen-for-you.ts) ranks and
 * slices this pool itself rather than paging through a student-chosen
 * filter the way the Opportunities browse page does. Applies the same
 * default visibility exclusions `listOpportunities` applies (expired,
 * closed applications, rejected/stale verification, grade-ineligible,
 * confirmed residency mismatch, unresolved citizenship) so nothing
 * "Chosen for You" surfaces is a listing the browse page would hide by
 * default, plus an explicit `is_sample = false` no other caller needs.
 */
export async function listOpportunitiesForMatching(
  supabase: Client,
  gradeLevel: number | null,
  options: { studentState?: string | null; now?: Date } = {}
): Promise<{ data: Opportunity[]; error: string | null }> {
  const now = options.now ?? new Date();
  const studentState = options.studentState ?? null;

  let query = supabase
    .from("opportunities")
    .select("*")
    .eq("is_active", true)
    .eq("is_sample", false);

  if (gradeLevel !== null) {
    query = query
      .or(`min_grade.is.null,min_grade.lte.${gradeLevel}`)
      .or(`max_grade.is.null,max_grade.gte.${gradeLevel}`);
  }

  const nowIso = now.toISOString();
  query = query.or(`application_deadline.is.null,application_deadline.gte.${nowIso}`);
  query = query.or("deadline_status.neq.closed");
  query = query.or("application_status.neq.closed");
  query = query.or("verification_status.neq.rejected");
  query = query.or("verification_status.neq.stale");

  if (studentState) {
    const pattern = sanitizeSearchTerm(studentState);
    query = query.or(`residency_requirements.is.null,residency_requirements.ilike."%${pattern}%"`);
  }

  query = query.or(`citizenship_requirements.is.null,citizenship_requirements.ilike."%none%"`);

  const { data, error } = await query.order("id", { ascending: true }).limit(MATCHING_POOL_LIMIT);

  if (error) {
    console.error("[opportunities] failed to load matching pool:", error.message);
    return { data: [], error: "Something went wrong loading your matches." };
  }

  return { data: data ?? [], error: null };
}

export async function getOpportunityById(
  supabase: Client,
  id: string
): Promise<Opportunity | null> {
  const { data, error } = await supabase
    .from("opportunities")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[opportunities] failed to load opportunity:", error.message);
    return null;
  }

  return data;
}

/** All opportunity ids the given user has saved, for marking cards as saved without an N+1 query per card. */
export async function getSavedOpportunityIds(
  supabase: Client,
  userId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("saved_opportunities")
    .select("opportunity_id")
    .eq("user_id", userId);

  if (error) {
    console.error("[opportunities] failed to load saved ids:", error.message);
    return new Set();
  }

  return new Set(data?.map((row) => row.opportunity_id) ?? []);
}

export async function isOpportunitySaved(
  supabase: Client,
  userId: string,
  opportunityId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("saved_opportunities")
    .select("user_id")
    .eq("user_id", userId)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();

  if (error) {
    console.error("[opportunities] failed to check saved status:", error.message);
    return false;
  }

  return data !== null;
}

/**
 * Batched name lookup for the small number of distinct sources a page of
 * opportunities can reference — one query for the whole list rather than
 * one per card. Returns an empty map entry (never a fabricated name) for
 * any id that fails to resolve.
 */
export async function getOpportunitySourceNames(
  supabase: Client,
  sourceIds: readonly string[]
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(sourceIds)];
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase.from("opportunity_sources").select("id, name").in("id", uniqueIds);

  if (error) {
    console.error("[opportunities] failed to load source names:", error.message);
    return new Map();
  }

  return new Map((data ?? []).map((row) => [row.id, row.name]));
}

export type OpportunitySourceLinkEntry = {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  isPrimary: boolean;
};

/** Every source that reports this opportunity (Milestone 7 section 7: "multiple official source links when available"), primary first — not just the single `source_id` on the row itself. */
export async function getOpportunitySourceLinks(
  supabase: Client,
  opportunityId: string
): Promise<OpportunitySourceLinkEntry[]> {
  const { data: links, error } = await supabase
    .from("opportunity_source_links")
    .select("source_id, source_url, is_primary")
    .eq("opportunity_id", opportunityId);

  if (error) {
    console.error("[opportunities] failed to load source links:", error.message);
    return [];
  }
  if (!links || links.length === 0) return [];

  const sourceNames = await getOpportunitySourceNames(
    supabase,
    links.map((link) => link.source_id)
  );

  return links
    .map((link) => ({
      sourceId: link.source_id,
      sourceName: sourceNames.get(link.source_id) ?? "Unknown source",
      sourceUrl: link.source_url,
      isPrimary: link.is_primary,
    }))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
}

export type SavedOpportunityEntry = {
  opportunity: Opportunity;
  savedAt: string;
};

/**
 * The student's saved opportunities, most recently saved first. Two
 * queries rather than one embedded join — see docs/database.md's note on
 * hand-written `Relationships` typing being fragile for embeds.
 */
export async function getSavedOpportunities(
  supabase: Client,
  userId: string
): Promise<SavedOpportunityEntry[]> {
  const { data: savedRows, error: savedError } = await supabase
    .from("saved_opportunities")
    .select("opportunity_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (savedError) {
    console.error("[opportunities] failed to load saved rows:", savedError.message);
    return [];
  }

  if (!savedRows || savedRows.length === 0) return [];

  const ids = savedRows.map((row) => row.opportunity_id);
  const { data: opportunities, error: opportunitiesError } = await supabase
    .from("opportunities")
    .select("*")
    .in("id", ids);

  if (opportunitiesError) {
    console.error(
      "[opportunities] failed to load saved opportunity details:",
      opportunitiesError.message
    );
    return [];
  }

  const byId = new Map((opportunities ?? []).map((opportunity) => [opportunity.id, opportunity]));

  return savedRows
    .map((row) => {
      const opportunity = byId.get(row.opportunity_id);
      return opportunity ? { opportunity, savedAt: row.created_at } : null;
    })
    .filter((entry): entry is SavedOpportunityEntry => entry !== null);
}
