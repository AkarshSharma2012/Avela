import { createElksMvsAdapter, ELKS_MVS_SOURCE } from "@/lib/opportunities/adapters/elks-mvs-adapter";
import { createMitMitesAdapter, MIT_MITES_SOURCE } from "@/lib/opportunities/adapters/mit-mites-adapter";
import { createNasaHsasAdapter, NASA_HSAS_SOURCE } from "@/lib/opportunities/adapters/nasa-hsas-adapter";
import { createNihSipAdapter, NIH_SIP_SOURCE } from "@/lib/opportunities/adapters/nih-sip-adapter";
import { createNistShipAdapter, NIST_SHIP_SOURCE } from "@/lib/opportunities/adapters/nist-ship-adapter";
import { createRegeneronStsAdapter, REGENERON_STS_SOURCE } from "@/lib/opportunities/adapters/regeneron-sts-adapter";
import type { OpportunitySourceAdapter } from "@/lib/opportunities/adapters/types";
import { createWaPageProgramAdapter, WA_PAGE_PROGRAM_SOURCE } from "@/lib/opportunities/adapters/wa-page-program-adapter";
import { createYoungArtsAdapter, YOUNGARTS_SOURCE } from "@/lib/opportunities/adapters/youngarts-adapter";
import type { FeedbackProfile } from "@/lib/opportunities/feedback";
import { GOAL_TO_OPPORTUNITY_TYPE, type MatchProfileInput } from "@/lib/opportunities/matching";
import type { DnsLookupFn, FetchFn } from "@/lib/opportunities/url-safety";
import type {
  InterestValue,
  OpportunityFormat,
  OpportunitySourceCrawlMethod,
  OpportunitySourceTrustLevel,
  OpportunitySourceType,
  OpportunityType,
} from "@/types/database";

/**
 * The same 8 real, hand-vetted sources `scripts/ingest-opportunities.ts`
 * registers (see docs/opportunity-sources.md) — this module doesn't
 * duplicate their vetting, it adds a category layer on top so a "Find
 * more" discovery run can pick a *relevant* 3-5, never "search everything
 * because it exists" (the spec's explicit instruction). Adapters
 * themselves are reused unmodified.
 */
export type DiscoverySourceKey =
  | "nist-ship"
  | "nih-sip"
  | "nasa-hsas"
  | "wa-page-program"
  | "mit-mites"
  | "youngarts"
  | "regeneron-sts"
  | "elks-mvs";

export type DiscoverySourceDefinition = {
  key: DiscoverySourceKey;
  name: string;
  baseUrl: string;
  sourceType: OpportunitySourceType;
  trustLevel: OpportunitySourceTrustLevel;
  crawlMethod: OpportunitySourceCrawlMethod;
  requiresJavascript: boolean;
  organizationHint: string;
  defaultOpportunityType: OpportunityType;
  defaultFormat: OpportunityFormat;
  createAdapter: (
    sourceId: string,
    options?: { fetchImpl?: FetchFn; dnsLookupImpl?: DnsLookupFn }
  ) => OpportunitySourceAdapter;
  /** Interests this source's program(s) are actually about. An empty array marks a "universal" source (e.g. a scholarship) relevant regardless of subject-matter interest — see `selectDiscoverySources`. */
  interestTags: readonly InterestValue[];
  /** The opportunity type(s) this source's programs are, compared against the goal→type mapping `matching.ts` already uses. */
  relevantTypes: readonly OpportunityType[];
  /** Only selected when the student's profile state matches (case-insensitive substring, same convention `eligibility-engine.ts` already uses for residency) — a real, documented residency restriction, not a guess. `null` means no restriction. */
  stateRestriction: string | null;
};

export const DISCOVERY_SOURCES: readonly DiscoverySourceDefinition[] = [
  {
    key: "nist-ship",
    ...NIST_SHIP_SOURCE,
    organizationHint: "National Institute of Standards and Technology (NIST)",
    defaultOpportunityType: "internship",
    defaultFormat: "in_person",
    createAdapter: createNistShipAdapter,
    interestTags: ["Technology", "Engineering", "Computer Science", "Mathematics"],
    relevantTypes: ["internship"],
    stateRestriction: null,
  },
  {
    key: "nih-sip",
    ...NIH_SIP_SOURCE,
    organizationHint: "National Institutes of Health (NIH)",
    defaultOpportunityType: "internship",
    defaultFormat: "in_person",
    createAdapter: createNihSipAdapter,
    interestTags: ["Medicine", "Public Health", "Biology"],
    relevantTypes: ["internship"],
    stateRestriction: null,
  },
  {
    key: "nasa-hsas",
    ...NASA_HSAS_SOURCE,
    organizationHint: "NASA Johnson Space Center",
    defaultOpportunityType: "summer_program",
    defaultFormat: "hybrid",
    createAdapter: createNasaHsasAdapter,
    interestTags: ["Engineering", "Technology", "Environmental Science", "Mathematics"],
    relevantTypes: ["summer_program"],
    // Confirmed Texas-residents-only — see docs/decision-log.md's Milestone 7 live-dry-run entry.
    stateRestriction: "Texas",
  },
  {
    key: "wa-page-program",
    ...WA_PAGE_PROGRAM_SOURCE,
    organizationHint: "Washington State Legislature",
    defaultOpportunityType: "internship",
    defaultFormat: "in_person",
    createAdapter: createWaPageProgramAdapter,
    interestTags: ["Government", "Law", "Community Service"],
    relevantTypes: ["internship"],
    stateRestriction: "Washington",
  },
  {
    key: "mit-mites",
    ...MIT_MITES_SOURCE,
    organizationHint: "Massachusetts Institute of Technology (MIT)",
    defaultOpportunityType: "summer_program",
    defaultFormat: "in_person",
    createAdapter: createMitMitesAdapter,
    interestTags: ["Technology", "Engineering", "Computer Science", "Mathematics"],
    relevantTypes: ["summer_program"],
    stateRestriction: null,
  },
  {
    key: "youngarts",
    ...YOUNGARTS_SOURCE,
    organizationHint: "YoungArts",
    defaultOpportunityType: "competition",
    defaultFormat: "hybrid",
    createAdapter: createYoungArtsAdapter,
    interestTags: ["Visual Arts", "Music", "Theater", "Filmmaking", "Writing"],
    relevantTypes: ["competition"],
    stateRestriction: null,
  },
  {
    key: "regeneron-sts",
    ...REGENERON_STS_SOURCE,
    organizationHint: "Society for Science",
    defaultOpportunityType: "competition",
    defaultFormat: "virtual",
    createAdapter: createRegeneronStsAdapter,
    interestTags: ["Technology", "Engineering", "Computer Science", "Mathematics", "Biology", "Environmental Science"],
    relevantTypes: ["competition"],
    stateRestriction: null,
  },
  {
    key: "elks-mvs",
    ...ELKS_MVS_SOURCE,
    organizationHint: "Elks National Foundation",
    defaultOpportunityType: "scholarship",
    defaultFormat: "virtual",
    createAdapter: createElksMvsAdapter,
    // A scholarship isn't about a subject-matter interest — relevant to
    // any student regardless of what they're into. See selectDiscoverySources.
    interestTags: [],
    relevantTypes: ["scholarship"],
    stateRestriction: null,
  },
] as const;

export const MAX_DISCOVERY_SOURCES = 4;

export type ScoredDiscoverySource = {
  source: DiscoverySourceDefinition;
  score: number;
  reasons: string[];
};

/**
 * Deterministic, explainable source scoring — never a percentage, and
 * never a source with no traceable reason to be picked. A profile with no
 * interests and no goals set gets zero sources (spec: "do not invent
 * missing preferences" — there's nothing to score relevance against),
 * not a default/fallback list.
 */
export function scoreDiscoverySources(profile: MatchProfileInput, feedbackProfile?: FeedbackProfile): ScoredDiscoverySource[] {
  if (profile.interests.length === 0 && profile.goals.length === 0) return [];

  const goalTypes = new Set(
    profile.goals.map((goal) => GOAL_TO_OPPORTUNITY_TYPE[goal]).filter((type): type is OpportunityType => Boolean(type))
  );

  return DISCOVERY_SOURCES.filter((source) => {
    if (source.stateRestriction === null) return true;
    return profile.state !== null && profile.state.toLowerCase().includes(source.stateRestriction.toLowerCase());
  })
    .map((source) => {
      const reasons: string[] = [];
      let score = 0;

      const matchedInterest = source.interestTags.find((tag) => profile.interests.includes(tag));
      if (matchedInterest) {
        score += 2;
        reasons.push(`Matches your interest in ${matchedInterest}`);
      }

      const matchedType = source.relevantTypes.find((type) => goalTypes.has(type));
      if (matchedType) {
        score += 1;
        reasons.push(`Offers a ${matchedType.replace(/_/g, " ")}, matching one of your goals`);
      }

      if (source.interestTags.length === 0) {
        reasons.push("Open to students regardless of interest area");
      }

      // Bounded feedback nudge — at most ±1, applied after the base score
      // is computed, never enough on its own to pull in a source that had
      // zero interest/goal signal to begin with (see the `score > 0`
      // filter below, which this can help a marginal source clear but
      // never bypass entirely).
      if (feedbackProfile) {
        const feedbackScore = source.relevantTypes.reduce(
          (sum, type) => sum + (feedbackProfile.get(type) ?? 0),
          0
        );
        if (feedbackScore > 0) {
          score += 1;
          reasons.push("You've responded well to opportunities like this before");
        } else if (feedbackScore < 0 && score > 0) {
          score -= 1;
        }
      }

      return { source, score, reasons };
    })
    .filter(({ source, score }) => score > 0 || source.interestTags.length === 0)
    .sort((a, b) => b.score - a.score || a.source.key.localeCompare(b.source.key));
}

/** Picks the top-scoring sources, capped at `maxSources` (the spec's 3-5 range; defaults to 4). */
export function selectDiscoverySources(
  profile: MatchProfileInput,
  options: { maxSources?: number; feedbackProfile?: FeedbackProfile } = {}
): DiscoverySourceDefinition[] {
  const maxSources = options.maxSources ?? MAX_DISCOVERY_SOURCES;
  return scoreDiscoverySources(profile, options.feedbackProfile)
    .slice(0, maxSources)
    .map(({ source }) => source);
}
