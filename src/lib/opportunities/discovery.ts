import type { OpportunitySourceAdapter } from "@/lib/opportunities/adapters/types";
import {
  computeCostPreferenceMatch,
  computeFormatPreferenceMatch,
  hasCompleteInformation,
  toEligibilityOpportunityInput,
} from "@/lib/opportunities/chosen-for-you";
import type { DiscoverySourceDefinition, DiscoverySourceKey } from "@/lib/opportunities/discovery-sources";
import { evaluateEligibility, type EligibilityResult } from "@/lib/opportunities/eligibility-engine";
import type { IngestionRepository } from "@/lib/opportunities/ingestion-repository";
import { consoleLogger, runIngestion, type IngestionSourceConfig, type Logger } from "@/lib/opportunities/ingestion-runner";
import {
  matchOpportunity,
  WEEKLY_AVAILABILITY_MAX_HOURS,
  type MatchProfileInput,
  type MatchResult,
  type MatchTier,
} from "@/lib/opportunities/matching";
import { rankOpportunities, type RankingInput } from "@/lib/opportunities/ranking";
import type { DnsLookupFn, FetchFn } from "@/lib/opportunities/url-safety";
import type { OpportunityVerificationLabel } from "@/types/database";
import type { Opportunity } from "@/types/opportunity";

export type DiscoveryLimits = {
  /** Spec: "maximum 3-5 selected sources". */
  maxSources: number;
  /** Spec: "maximum 10 detail pages" — a total budget shared across every source in the run, not per source, so the run stays cheap regardless of how many sources are selected. */
  maxDetailPages: number;
  /** Spec: "maximum 3 new recommendations returned". */
  maxRecommendations: number;
  /** Spec: "per-source timeout". Individual fetches already carry an 8s timeout (url-safety.ts), but a multi-page adapter issuing several could still run long — this is the outer wall-clock cap on one source's *entire* discover-and-ingest step. */
  perSourceTimeoutMs: number;
};

export const DEFAULT_DISCOVERY_LIMITS: DiscoveryLimits = {
  maxSources: 4,
  maxDetailPages: 10,
  maxRecommendations: 3,
  perSourceTimeoutMs: 15_000,
};

/** The three "good" labels a listing needs to ever be presented as a strong match — see the VERIFICATION GATE spec section. */
const GOOD_VERIFICATION_LABELS = new Set<OpportunityVerificationLabel>([
  "verified_accepting",
  "verified_opening_soon",
  "verified_next_cycle",
]);

/**
 * No opportunity — freshly discovered or already in the catalog — is ever
 * presented as a strong match on preference-fit alone. A `strong_fit`
 * match tier only survives the gate when official evidence backs it (one
 * of the three "good" verification labels `computeVerificationLabel`
 * already computes from real signals — trust level, a working application
 * URL, clear grade eligibility, a confirmed accepting/opening-soon/
 * next-cycle status). Everything else downgrades to `possible_fit`
 * ("needs confirmation") rather than being hidden — uncertainty is
 * disclosed, never silently dropped. `possible_fit`/`limited_fit` are
 * never *upgraded* by this gate; a weak preference match doesn't become
 * strong just because a listing happens to be well-verified.
 */
export function applyVerificationGate(
  matchTier: MatchTier,
  verificationLabel: OpportunityVerificationLabel
): MatchTier {
  if (matchTier !== "strong_fit") return matchTier;
  return GOOD_VERIFICATION_LABELS.has(verificationLabel) ? "strong_fit" : "possible_fit";
}

export type DiscoveryCandidate = {
  opportunity: Opportunity;
  matchResult: MatchResult;
  eligibilityResult: EligibilityResult;
  /** `matchResult.tier` after `applyVerificationGate` — the tier actually shown to the student. */
  tier: MatchTier;
};

export type SourceRunStatus = "reused_fresh" | "ingested" | "failed" | "timeout" | "skipped_budget";

export type SourceRunOutcome = {
  sourceKey: DiscoverySourceKey;
  sourceName: string;
  status: SourceRunStatus;
  itemsFound: number;
  newOpportunityIds: string[];
  errorSummary: string | null;
};

/**
 * Everything `runFreshDiscovery` needs to persist/read, expressed as an
 * interface (same dependency-injection pattern as `IngestionRepository`)
 * so the orchestration logic below is unit-testable against an in-memory
 * fake — no real database or network call in the test suite. The one real
 * implementation is `discovery-repository.ts`.
 */
export type DiscoveryRepository = {
  /** The existing ingestion-writing surface, reused unmodified. */
  ingestion: IngestionRepository;
  /** Looks up (or registers) the `opportunity_sources` row for a discovery source — the same `ensureSourceRow` pattern `scripts/ingest-opportunities.ts` already uses. */
  resolveSourceId(source: DiscoverySourceDefinition): Promise<string>;
  /** Opportunities already in the catalog from this source that aren't yet due for recheck (`next_verification_at` still in the future) and aren't already excluded — satisfies "reuse recently verified records where still fresh" without ever hitting the network for a source that doesn't need it. */
  getFreshOpportunities(
    sourceId: string,
    excludeIds: ReadonlySet<string>,
    now: Date
  ): Promise<Opportunity[]>;
  getOpportunitiesByIds(ids: readonly string[]): Promise<Opportunity[]>;
};

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function processOneSource(params: {
  source: DiscoverySourceDefinition;
  repository: DiscoveryRepository;
  excludedOpportunityIds: ReadonlySet<string>;
  recordLimit: number;
  now: Date;
  fetchImpl?: FetchFn;
  dnsLookupImpl?: DnsLookupFn;
  logger: Logger;
  /** Injectable only for tests — production always uses the real `runIngestion`. */
  runIngestionImpl?: typeof runIngestion;
  /** Injectable only for tests — production always calls the source's real `createAdapter`. */
  createAdapterImpl?: (
    source: DiscoverySourceDefinition,
    sourceId: string,
    options: { fetchImpl?: FetchFn; dnsLookupImpl?: DnsLookupFn }
  ) => OpportunitySourceAdapter;
}): Promise<SourceRunOutcome> {
  const { source, repository, excludedOpportunityIds, recordLimit, now, fetchImpl, dnsLookupImpl, logger } = params;
  const runIngestionImpl = params.runIngestionImpl ?? runIngestion;
  const createAdapterImpl = params.createAdapterImpl ?? ((s, sourceId, options) => s.createAdapter(sourceId, options));

  const sourceId = await repository.resolveSourceId(source);

  const fresh = await repository.getFreshOpportunities(sourceId, excludedOpportunityIds, now);
  if (fresh.length > 0) {
    return {
      sourceKey: source.key,
      sourceName: source.name,
      status: "reused_fresh",
      itemsFound: fresh.length,
      newOpportunityIds: fresh.map((o) => o.id),
      errorSummary: null,
    };
  }

  const adapter = createAdapterImpl(source, sourceId, { fetchImpl, dnsLookupImpl });
  const config: IngestionSourceConfig = {
    id: sourceId,
    organizationHint: source.organizationHint,
    trustLevel: source.trustLevel,
    defaultOpportunityType: source.defaultOpportunityType,
    defaultFormat: source.defaultFormat,
  };

  const summary = await runIngestionImpl({
    source: config,
    adapter,
    repository: repository.ingestion,
    dryRun: false,
    now,
    fetchImpl,
    dnsLookupImpl,
    logger,
    recordLimit,
  });

  if (summary.status === "failed") {
    return {
      sourceKey: source.key,
      sourceName: source.name,
      status: "failed",
      itemsFound: 0,
      newOpportunityIds: [],
      errorSummary: summary.errorSummary,
    };
  }

  const newOpportunityIds = summary.records
    .filter((record) => (record.action === "inserted" || record.action === "updated") && record.opportunityId)
    .map((record) => record.opportunityId as string);

  return {
    sourceKey: source.key,
    sourceName: source.name,
    status: "ingested",
    itemsFound: summary.itemsFound,
    newOpportunityIds,
    errorSummary: null,
  };
}

function toRankingInput(candidate: DiscoveryCandidate, profile: MatchProfileInput): RankingInput {
  const studentMaxWeeklyHours =
    profile.weeklyAvailability !== null ? WEEKLY_AVAILABILITY_MAX_HOURS[profile.weeklyAvailability] : null;

  return {
    id: candidate.opportunity.id,
    eligibilityStatus: candidate.eligibilityResult.status,
    deadlineStatus: candidate.opportunity.deadline_status,
    applicationStatus: candidate.opportunity.application_status,
    verificationStatus: candidate.opportunity.verification_status,
    matchTier: candidate.tier,
    applicationDeadline: candidate.opportunity.application_deadline,
    weeklyCommitmentHours: candidate.opportunity.weekly_commitment_hours,
    studentMaxWeeklyHours,
    costPreferenceMatch: computeCostPreferenceMatch(profile, candidate.opportunity),
    formatPreferenceMatch: computeFormatPreferenceMatch(profile, candidate.opportunity),
    hasCompleteInformation: hasCompleteInformation(candidate.opportunity),
  };
}

/** Exported for reuse by find-more.ts, which ranks catalog-only candidates the same way and re-ranks a merged catalog+discovery set. */
export function rankCandidates(
  candidates: DiscoveryCandidate[],
  profile: MatchProfileInput,
  now: Date
): DiscoveryCandidate[] {
  const byId = new Map(candidates.map((c) => [c.opportunity.id, c]));
  const ranked = rankOpportunities(
    candidates.map((c) => toRankingInput(c, profile)),
    now
  );
  return ranked.map((result) => byId.get(result.opportunity.id)!);
}

export type RunFreshDiscoveryParams = {
  profile: MatchProfileInput;
  /** Every opportunity id the student has already been shown — from the persisted `student_opportunity_recommendations` table, unioned with whatever the current page already rendered. Never repeated. */
  excludedOpportunityIds: ReadonlySet<string>;
  /** Already selected via `selectDiscoverySources` — this function never chooses sources itself. */
  sources: readonly DiscoverySourceDefinition[];
  repository: DiscoveryRepository;
  limits?: Partial<DiscoveryLimits>;
  now?: Date;
  logger?: Logger;
  fetchImpl?: FetchFn;
  dnsLookupImpl?: DnsLookupFn;
  /** Test-only injection points — see `processOneSource`. */
  runIngestionImpl?: typeof runIngestion;
  createAdapterImpl?: (
    source: DiscoverySourceDefinition,
    sourceId: string,
    options: { fetchImpl?: FetchFn; dnsLookupImpl?: DnsLookupFn }
  ) => OpportunitySourceAdapter;
};

export type RunFreshDiscoveryResult = {
  /** Ranked, gate-applied, capped at `maxRecommendations` — the actual new batch. */
  candidates: DiscoveryCandidate[];
  sourceOutcomes: SourceRunOutcome[];
  sourcesAttempted: DiscoverySourceKey[];
  allSourcesFailed: boolean;
  anySourceFailed: boolean;
};

/**
 * Runs a bounded, profile-scoped discovery pass across already-selected
 * sources — sequential (not parallel), so "early stop once enough strong
 * matches are found" and the shared detail-page budget can actually take
 * effect before the next source starts. One source's timeout or failure
 * never stops the others (`sourceOutcomes` records every source's own
 * outcome; the loop always continues).
 */
export async function runFreshDiscovery(params: RunFreshDiscoveryParams): Promise<RunFreshDiscoveryResult> {
  const now = params.now ?? new Date();
  const limits: DiscoveryLimits = { ...DEFAULT_DISCOVERY_LIMITS, ...params.limits };
  const logger = params.logger ?? consoleLogger;
  const sources = params.sources.slice(0, limits.maxSources);

  const sourceOutcomes: SourceRunOutcome[] = [];
  const candidates: DiscoveryCandidate[] = [];
  let remainingPageBudget = limits.maxDetailPages;

  for (const source of sources) {
    const strongSoFar = candidates.filter((c) => c.tier === "strong_fit").length;
    if (strongSoFar >= limits.maxRecommendations) {
      sourceOutcomes.push({
        sourceKey: source.key,
        sourceName: source.name,
        status: "skipped_budget",
        itemsFound: 0,
        newOpportunityIds: [],
        errorSummary: "Skipped — already found enough strong matches.",
      });
      continue;
    }
    if (remainingPageBudget <= 0) {
      sourceOutcomes.push({
        sourceKey: source.key,
        sourceName: source.name,
        status: "skipped_budget",
        itemsFound: 0,
        newOpportunityIds: [],
        errorSummary: "Skipped — this run's detail-page budget is exhausted.",
      });
      continue;
    }

    try {
      const outcome = await withTimeout(
        processOneSource({
          source,
          repository: params.repository,
          excludedOpportunityIds: params.excludedOpportunityIds,
          recordLimit: remainingPageBudget,
          now,
          fetchImpl: params.fetchImpl,
          dnsLookupImpl: params.dnsLookupImpl,
          logger,
          runIngestionImpl: params.runIngestionImpl,
          createAdapterImpl: params.createAdapterImpl,
        }),
        limits.perSourceTimeoutMs,
        `Source "${source.name}" timed out after ${limits.perSourceTimeoutMs}ms.`
      );
      sourceOutcomes.push(outcome);
      remainingPageBudget -= outcome.itemsFound;

      if (outcome.newOpportunityIds.length > 0) {
        const rows = await params.repository.getOpportunitiesByIds(outcome.newOpportunityIds);
        for (const opportunity of rows) {
          if (opportunity.is_sample) continue;
          if (params.excludedOpportunityIds.has(opportunity.id)) continue;
          if (!opportunity.is_active) continue;

          const matchResult = matchOpportunity(opportunity, params.profile);
          const eligibilityResult = evaluateEligibility(toEligibilityOpportunityInput(opportunity), {
            gradeLevel: params.profile.gradeLevel,
            state: params.profile.state,
            weeklyAvailability: params.profile.weeklyAvailability,
          });
          if (eligibilityResult.status === "ineligible") continue;

          const tier = applyVerificationGate(matchResult.tier, opportunity.verification_label);
          candidates.push({ opportunity, matchResult, eligibilityResult, tier });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      logger.error(`discovery source "${source.key}" failed: ${message}`);
      sourceOutcomes.push({
        sourceKey: source.key,
        sourceName: source.name,
        status: source.key && message.includes("timed out") ? "timeout" : "failed",
        itemsFound: 0,
        newOpportunityIds: [],
        errorSummary: message,
      });
    }
  }

  const ranked = rankCandidates(candidates, params.profile, now).slice(0, limits.maxRecommendations);
  const attemptedOutcomes = sourceOutcomes.filter((o) => o.status !== "skipped_budget");

  return {
    candidates: ranked,
    sourceOutcomes,
    sourcesAttempted: sources.map((s) => s.key),
    allSourcesFailed:
      attemptedOutcomes.length > 0 && attemptedOutcomes.every((o) => o.status === "failed" || o.status === "timeout"),
    anySourceFailed: sourceOutcomes.some((o) => o.status === "failed" || o.status === "timeout"),
  };
}
