import { toEligibilityOpportunityInput } from "@/lib/opportunities/chosen-for-you";
import {
  applyVerificationGate,
  rankCandidates,
  runFreshDiscovery,
  type DiscoveryCandidate,
  type DiscoveryLimits,
  type DiscoveryRepository,
} from "@/lib/opportunities/discovery";
import { selectDiscoverySources } from "@/lib/opportunities/discovery-sources";
import { evaluateEligibility } from "@/lib/opportunities/eligibility-engine";
import type { Logger } from "@/lib/opportunities/ingestion-runner";
import { matchOpportunity, type MatchProfileInput } from "@/lib/opportunities/matching";
import type { DnsLookupFn, FetchFn } from "@/lib/opportunities/url-safety";
import type { RecommendationTier, StudentDiscoveryRunStatus } from "@/types/database";
import type { Opportunity } from "@/types/opportunity";

/** How many *useful* (non-`limited_fit`) unseen catalog matches are enough to skip fresh discovery entirely — spec: "if fewer than 3 useful unseen matches remain". */
export const MIN_USEFUL_UNSEEN_MATCHES = 3;

/** Spec: rate-limit requests. No external rate-limiter exists in this codebase, so this is a simple, DB-backed "at most N discovery runs per user per hour" check — see discovery-repository.ts's `countRecentDiscoveryRuns`. */
export const MAX_DISCOVERY_RUNS_PER_HOUR = 5;

export type FindMoreStatus =
  | "ok"
  | "only_broader"
  | "no_strong_matches"
  | "source_failure_total"
  | "rate_limited"
  | "concurrent_run_blocked";

export type FindMoreOutcome = {
  recommendations: DiscoveryCandidate[];
  usedDiscovery: boolean;
  discoveryRunId: string | null;
  /** Names of sources actually attempted (excludes ones skipped by the early-stop/budget guards) — the "Searched N trusted sources" summary. */
  sourcesSearched: string[];
  sourceFailures: { sourceName: string; errorSummary: string | null }[];
  status: FindMoreStatus;
  /** Student-facing copy for non-`"ok"` states, and for `"only_broader"`. `null` for a plain `"ok"`. */
  message: string | null;
};

export type RecommendationInsert = {
  opportunityId: string;
  discoveryRunId: string | null;
  batchNumber: number;
  personalizedRank: number;
  recommendationTier: RecommendationTier;
  fitReasons: string[];
  concerns: string[];
};

export type FindMoreDependencies = {
  userId: string;
  profile: MatchProfileInput;
  /** Every opportunity id already shown to this student — persisted history unioned with whatever the current page already has on screen. Resolving that union is discovery-actions.ts's job, not this function's. */
  alreadyShownOpportunityIds: ReadonlySet<string>;
  batchNumber: number;
  now?: Date;
  limits?: Partial<DiscoveryLimits>;
  minUsefulMatches?: number;
  logger?: Logger;
  fetchImpl?: FetchFn;
  dnsLookupImpl?: DnsLookupFn;

  /** The active, non-sample, default-visibility opportunity pool — same shape `listOpportunitiesForMatching` returns. */
  listCatalogPool(): Promise<Opportunity[]>;
  countRecentDiscoveryRuns(userId: string, since: Date): Promise<number>;
  hasActiveDiscoveryRun(userId: string): Promise<boolean>;
  createDiscoveryRun(input: {
    batchNumber: number;
    sourcesSelected: string[];
    profileSnapshot: Record<string, unknown>;
  }): Promise<string>;
  updateDiscoveryRunStatus(runId: string, status: StudentDiscoveryRunStatus): Promise<void>;
  completeDiscoveryRun(
    runId: string,
    result: { status: "completed" | "failed"; resultsFound: number; errorSummary: string | null }
  ): Promise<void>;
  insertRecommendations(rows: RecommendationInsert[]): Promise<void>;
  discoveryRepository: DiscoveryRepository;

  /** Test-only injection point. */
  runFreshDiscoveryImpl?: typeof runFreshDiscovery;
};

function buildCatalogCandidates(
  pool: readonly Opportunity[],
  profile: MatchProfileInput,
  excluded: ReadonlySet<string>,
  now: Date
): DiscoveryCandidate[] {
  const candidates: DiscoveryCandidate[] = [];
  for (const opportunity of pool) {
    if (opportunity.is_sample) continue;
    if (excluded.has(opportunity.id)) continue;

    const matchResult = matchOpportunity(opportunity, profile);
    const eligibilityResult = evaluateEligibility(toEligibilityOpportunityInput(opportunity), {
      gradeLevel: profile.gradeLevel,
      state: profile.state,
      weeklyAvailability: profile.weeklyAvailability,
    });
    if (eligibilityResult.status === "ineligible") continue;

    const tier = applyVerificationGate(matchResult.tier, opportunity.verification_label);
    candidates.push({ opportunity, matchResult, eligibilityResult, tier });
  }
  return rankCandidates(candidates, profile, now);
}

/** Only the real profile signals the spec lists — never a fabricated/invented field. */
function buildProfileSnapshot(profile: MatchProfileInput, gradeLevel: number | null): Record<string, unknown> {
  return {
    gradeLevel,
    city: profile.city,
    state: profile.state,
    interests: profile.interests,
    goals: profile.goals,
    preferences: profile.preferences,
    experienceLevel: profile.experienceLevel,
    weeklyAvailability: profile.weeklyAvailability,
  };
}

function toRecommendationInserts(
  candidates: DiscoveryCandidate[],
  discoveryRunId: string | null,
  batchNumber: number
): RecommendationInsert[] {
  return candidates.map((candidate, index) => ({
    opportunityId: candidate.opportunity.id,
    discoveryRunId,
    batchNumber,
    personalizedRank: index + 1,
    recommendationTier: candidate.tier,
    fitReasons: candidate.matchResult.reasons,
    concerns: candidate.eligibilityResult.status === "eligible" ? [] : candidate.eligibilityResult.reasons,
  }));
}

/** De-duplicates a catalog batch and a freshly-discovered batch by opportunity id (a source can independently surface something already in the catalog), then re-ranks the union together. */
function mergeCandidates(
  catalog: DiscoveryCandidate[],
  discovered: DiscoveryCandidate[],
  profile: MatchProfileInput,
  now: Date
): DiscoveryCandidate[] {
  const byId = new Map<string, DiscoveryCandidate>();
  for (const candidate of [...catalog, ...discovered]) {
    if (!byId.has(candidate.opportunity.id)) byId.set(candidate.opportunity.id, candidate);
  }
  return rankCandidates([...byId.values()], profile, now);
}

/**
 * The full "Find more" decision: check the unseen verified catalog first
 * (spec step A), and only fall back to a bounded fresh-discovery run
 * (step B) when fewer than `minUsefulMatches` useful (non-`limited_fit`)
 * unseen catalog matches remain. Every dependency is injected — no direct
 * Supabase/network call here — so this whole decision tree is
 * unit-testable against fakes.
 */
export async function findMoreOpportunities(deps: FindMoreDependencies): Promise<FindMoreOutcome> {
  const now = deps.now ?? new Date();
  const minUseful = deps.minUsefulMatches ?? MIN_USEFUL_UNSEEN_MATCHES;

  const pool = await deps.listCatalogPool();
  const catalogCandidates = buildCatalogCandidates(pool, deps.profile, deps.alreadyShownOpportunityIds, now);
  const usefulCatalog = catalogCandidates.filter((c) => c.tier !== "limited_fit");

  // --- Step A: the catalog alone is enough — never touch the network. ---
  if (usefulCatalog.length >= minUseful) {
    const batch = catalogCandidates.slice(0, minUseful);
    if (batch.length > 0) {
      await deps.insertRecommendations(toRecommendationInserts(batch, null, deps.batchNumber));
    }
    return {
      recommendations: batch,
      usedDiscovery: false,
      discoveryRunId: null,
      sourcesSearched: [],
      sourceFailures: [],
      status: "ok",
      message: null,
    };
  }

  // --- Step B: not enough — but rate limit / concurrency gates come first, and never discard whatever the catalog already offered. ---
  const catalogFallback = catalogCandidates.slice(0, minUseful);

  const recentRunCount = await deps.countRecentDiscoveryRuns(deps.userId, new Date(now.getTime() - 3_600_000));
  if (recentRunCount >= MAX_DISCOVERY_RUNS_PER_HOUR) {
    return {
      recommendations: catalogFallback,
      usedDiscovery: false,
      discoveryRunId: null,
      sourcesSearched: [],
      sourceFailures: [],
      status: "rate_limited",
      message: "You've reached the limit for new searches right now — please try again in a little while.",
    };
  }

  if (await deps.hasActiveDiscoveryRun(deps.userId)) {
    return {
      recommendations: catalogFallback,
      usedDiscovery: false,
      discoveryRunId: null,
      sourcesSearched: [],
      sourceFailures: [],
      status: "concurrent_run_blocked",
      message: "A search is already running for you — hang tight and try again shortly.",
    };
  }

  const selectedSources = selectDiscoverySources(deps.profile);

  const runId = await deps.createDiscoveryRun({
    batchNumber: deps.batchNumber,
    sourcesSelected: selectedSources.map((s) => s.key),
    profileSnapshot: buildProfileSnapshot(deps.profile, deps.profile.gradeLevel),
  });

  if (selectedSources.length === 0) {
    await deps.completeDiscoveryRun(runId, {
      status: "completed",
      resultsFound: catalogFallback.length,
      errorSummary: null,
    });
    return classifyOutcome({
      recommendations: catalogFallback,
      usedDiscovery: false,
      discoveryRunId: runId,
      sourcesSearched: [],
      sourceFailures: [],
      allSourcesFailed: false,
    });
  }

  await deps.updateDiscoveryRunStatus(runId, "discovering");

  const runFreshDiscoveryImpl = deps.runFreshDiscoveryImpl ?? runFreshDiscovery;
  let discoveryResult;
  try {
    discoveryResult = await runFreshDiscoveryImpl({
      profile: deps.profile,
      excludedOpportunityIds: deps.alreadyShownOpportunityIds,
      sources: selectedSources,
      repository: deps.discoveryRepository,
      limits: deps.limits,
      now,
      logger: deps.logger,
      fetchImpl: deps.fetchImpl,
      dnsLookupImpl: deps.dnsLookupImpl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    await deps.completeDiscoveryRun(runId, { status: "failed", resultsFound: 0, errorSummary: message });
    return {
      recommendations: catalogFallback,
      usedDiscovery: true,
      discoveryRunId: runId,
      sourcesSearched: selectedSources.map((s) => s.name),
      sourceFailures: [{ sourceName: "discovery run", errorSummary: message }],
      status: catalogFallback.length > 0 ? "ok" : "source_failure_total",
      message:
        catalogFallback.length > 0
          ? null
          : "I couldn't reach the sources I searched just now — please try again in a bit.",
    };
  }

  await deps.updateDiscoveryRunStatus(runId, "ranking");

  const combined = mergeCandidates(catalogCandidates, discoveryResult.candidates, deps.profile, now).slice(
    0,
    deps.limits?.maxRecommendations ?? minUseful
  );

  if (combined.length > 0) {
    await deps.insertRecommendations(toRecommendationInserts(combined, runId, deps.batchNumber));
  }

  await deps.completeDiscoveryRun(runId, {
    status: "completed",
    resultsFound: combined.length,
    errorSummary: discoveryResult.anySourceFailed ? "One or more sources failed — see source outcomes." : null,
  });

  const sourceFailures = discoveryResult.sourceOutcomes
    .filter((o) => o.status === "failed" || o.status === "timeout")
    .map((o) => ({ sourceName: o.sourceName, errorSummary: o.errorSummary }));
  const sourcesSearched = discoveryResult.sourceOutcomes
    .filter((o) => o.status === "ingested" || o.status === "reused_fresh")
    .map((o) => o.sourceName);

  return classifyOutcome({
    recommendations: combined,
    usedDiscovery: true,
    discoveryRunId: runId,
    sourcesSearched,
    sourceFailures,
    allSourcesFailed: discoveryResult.allSourcesFailed,
  });
}

function classifyOutcome(input: {
  recommendations: DiscoveryCandidate[];
  usedDiscovery: boolean;
  discoveryRunId: string | null;
  sourcesSearched: string[];
  sourceFailures: { sourceName: string; errorSummary: string | null }[];
  allSourcesFailed: boolean;
}): FindMoreOutcome {
  const { recommendations, allSourcesFailed } = input;

  if (recommendations.length === 0) {
    return {
      ...input,
      status: allSourcesFailed ? "source_failure_total" : "no_strong_matches",
      message: allSourcesFailed
        ? "I couldn't reach the sources I searched just now — please try again in a bit."
        : "I searched for more, but I couldn't verify any additional strong matches right now.",
    };
  }

  if (recommendations.every((c) => c.tier === "limited_fit")) {
    return {
      ...input,
      status: "only_broader",
      message:
        "I found a few broader options. They are not as closely matched to your profile, but they may still be worth exploring.",
    };
  }

  return { ...input, status: "ok", message: null };
}
