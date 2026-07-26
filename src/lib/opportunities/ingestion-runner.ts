import type { OpportunitySourceAdapter, RawOpportunityRecordInput } from "@/lib/opportunities/adapters/types";
import { computeNextVerificationAt } from "@/lib/opportunities/recheck";
import { computeContentHash, detectDuplicate, type DedupeCandidate } from "@/lib/opportunities/dedupe";
import { evaluateDeadline } from "@/lib/opportunities/deadline";
import {
  extractApplicationLinkCandidate,
  extractFromHtmlMetadata,
  extractFromJsonLd,
  extractFromOpenGraph,
  isLowConfidence,
  mergeExtractedFields,
  stripHtmlToText,
} from "@/lib/opportunities/extraction";
import type {
  DedupeCandidateRow,
  IngestionRepository,
  NewOpportunityFields,
} from "@/lib/opportunities/ingestion-repository";
import { normalizeCost, normalizeDeadline, normalizeGradeRange, normalizeUrl } from "@/lib/opportunities/normalization";
import { computeQualityScore } from "@/lib/opportunities/quality";
import { checkUrl, type DnsLookupFn, type FetchFn } from "@/lib/opportunities/url-safety";
import type {
  OpportunityApplicationStatus,
  OpportunityCostType,
  OpportunityDeadlineStatus,
  OpportunityEligibilityDataStatus,
  OpportunityFormat,
  OpportunityReviewQueueReason,
  OpportunitySourceTrustLevel,
  OpportunityType,
  OpportunityVerificationStatus,
} from "@/types/database";

const TARGET_MIN_GRADE = 6;
const TARGET_MAX_GRADE = 12;

// A full real page's stripped text mixes the actual program description
// with navigation (links to sibling programs), footers, and unrelated
// dates (e.g. the internship's own on-site dates, or an age-eligibility
// cutoff date) — scanning the *entire* page for "any date-shaped text" or
// "any grade-shaped text" picks up false positives from that surrounding
// noise (confirmed live: NIST's page lists a sibling "Middle School
// Science Teachers" program in its sidebar, which a whole-page scan
// misread as SHIP's own — a high-school-only program's — eligibility;
// and a "2026 SHIP Dates: June 22 - Aug 7, 2026" program-dates line was
// misread as an application deadline).
//
// A first attempt scoped this to whole *sentences* containing a relevant
// keyword, but NIST's page defeated it: its nav/menu text has almost no
// sentence-ending punctuation, so the entire menu becomes one giant
// "sentence" that gets swept in wholesale the instant any trigger word
// (even an unrelated "Close" menu button) appears anywhere in it. A tight
// character window around each individual keyword *match* — not the
// whole sentence/paragraph around it — is robust to that: it stays small
// regardless of how the surrounding page is punctuated. Window sizes are
// tuned per field: deadline windows are the tightest (35 chars), since
// confirmed on the live NIST page the false-positive date sits ~44
// characters before the nearest deadline-ish word ("open") — comfortably
// excluded — while genuine phrasing ("due March 15, 2027") sits only a
// few characters away. `normalization.ts`'s own parsing is unchanged and
// stays context-free/simple for structured (CSV/manual-import) callers
// that only ever hand it one already-relevant field at a time.
const DEADLINE_CONTEXT_PATTERN = /\b(deadline|closing date|apply by|due|opens?|closes?|closed|accepting)\b/gi;
const ELIGIBILITY_CONTEXT_PATTERN =
  /\b(applicant|eligib|must be|enrolled|requirement|time of application|currently a|open to|students?)\b/gi;
const COST_CONTEXT_PATTERN = /\b(free|no cost|no charge|paid|tuition|fee|unpaid|stipend|cost)\b/gi;

/** Joins tight windows (`windowChars` on each side) around every match of `pattern` — empty string (never the full page) when nothing matches, so the caller's normalizer correctly reports "unknown" instead of guessing from irrelevant text. */
function relevantExcerpt(text: string, pattern: RegExp, windowChars: number): string {
  const regex = new RegExp(pattern.source, pattern.flags);
  const windows: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const start = Math.max(0, match.index - windowChars);
    const end = Math.min(text.length, match.index + match[0].length + windowChars);
    windows.push(text.slice(start, end));
    if (match[0].length === 0) regex.lastIndex++;
  }
  return windows.join(" | ");
}

export type IngestionSourceConfig = {
  id: string;
  /** The organization actually running the program — a static, verifiable fact about the source, used only as a fallback when extraction can't find one on the page itself. */
  organizationHint: string;
  trustLevel: OpportunitySourceTrustLevel;
  /** Neither of these is auto-detected from page text (no reliable signal exists for it) — a per-source, human-set hint, same as `opportunity_sources.source_type`. */
  defaultOpportunityType: OpportunityType;
  defaultFormat: OpportunityFormat;
};

export type Logger = {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

export const consoleLogger: Logger = {
  info: (message) => console.log(`[ingestion] ${message}`),
  warn: (message) => console.warn(`[ingestion] ${message}`),
  error: (message) => console.error(`[ingestion] ${message}`),
};

export type RecordOutcome = {
  sourceUrl: string;
  title: string | null;
  action: "rejected" | "inserted" | "updated";
  opportunityId: string | null;
  rejectionReason: string | null;
  queuedReasons: OpportunityReviewQueueReason[];
};

export type IngestionRunSummary = {
  sourceId: string;
  dryRun: boolean;
  status: "completed" | "failed";
  itemsFound: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsRejected: number;
  itemsQueued: number;
  errorSummary: string | null;
  records: RecordOutcome[];
};

function buildDedupeCandidate(
  title: string,
  organization: string,
  applicationUrl: string,
  sourceUrl: string | null,
  applicationDeadline: string | null,
  contentHash: string
): DedupeCandidate {
  return { title, organization, canonicalUrl: null, applicationUrl, sourceUrl, applicationDeadline, contentHash };
}

/** Existing rows don't carry the original content hash they were created with, so an equivalent one is recomputed from the same stored fields — sufficient for `detectDuplicate`'s exact-hash-match branch to fire when the two really are identical, without needing a new schema column just for this. */
function candidateRowToDedupeCandidate(row: DedupeCandidateRow): DedupeCandidate {
  return buildDedupeCandidate(
    row.title,
    row.organization,
    row.applicationUrl,
    row.sourceUrl,
    row.applicationDeadline,
    computeContentHash([row.sourceUrl ?? "", row.title, row.organization])
  );
}

function trustRank(level: OpportunitySourceTrustLevel | null): number {
  return level === "high" ? 3 : level === "medium" ? 2 : level === "low" ? 1 : 0;
}

/**
 * Runs the full discover → extract → normalize → validate → dedupe →
 * store → verify pipeline for one source. `dryRun: true` performs every
 * step except the actual writes (`createIngestionRun`,
 * `insertRawRecord`, `insertOpportunity`, `updateOpportunity`,
 * `upsertSourceLink`, `insertReviewQueueEntries`, `completeIngestionRun`
 * are never called) — `findDedupeCandidates` (a read) still runs, so a
 * dry run's report of insert-vs-update is accurate.
 */
export async function runIngestion(params: {
  source: IngestionSourceConfig;
  adapter: OpportunitySourceAdapter;
  repository: IngestionRepository;
  dryRun: boolean;
  now?: Date;
  fetchImpl?: FetchFn;
  dnsLookupImpl?: DnsLookupFn;
  logger?: Logger;
}): Promise<IngestionRunSummary> {
  const { source, adapter, repository, dryRun } = params;
  const now = params.now ?? new Date();
  const logger = params.logger ?? consoleLogger;

  logger.info(`run started — source=${source.id} dryRun=${dryRun}`);

  const runId = dryRun ? null : await repository.createIngestionRun(source.id, now.toISOString());

  let records: RawOpportunityRecordInput[];
  try {
    records = await adapter.discover();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    logger.error(`run failed — source=${source.id}: ${message}`);
    if (runId) {
      await repository.completeIngestionRun(runId, {
        status: "failed",
        itemsFound: 0,
        itemsCreated: 0,
        itemsUpdated: 0,
        itemsRejected: 0,
        errorSummary: message,
      });
    }
    return {
      sourceId: source.id,
      dryRun,
      status: "failed",
      itemsFound: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsRejected: 0,
      itemsQueued: 0,
      errorSummary: message,
      records: [],
    };
  }

  logger.info(`source fetched — source=${source.id} records found=${records.length}`);

  const outcomes: RecordOutcome[] = [];
  let created = 0;
  let updated = 0;
  let rejected = 0;
  let queued = 0;

  for (const record of records) {
    try {
      const outcome = await processRecord({
        record,
        source,
        repository,
        dryRun,
        now,
        fetchImpl: params.fetchImpl,
        dnsLookupImpl: params.dnsLookupImpl,
      });
      outcomes.push(outcome);
      if (outcome.action === "rejected") rejected++;
      if (outcome.action === "inserted") created++;
      if (outcome.action === "updated") updated++;
      if (outcome.queuedReasons.length > 0) queued++;

      if (!dryRun && runId) {
        await repository.insertRawRecord({
          sourceId: source.id,
          ingestionRunId: runId,
          record,
          processingStatus: outcome.action === "rejected" ? "rejected" : "processed",
          processingError: outcome.rejectionReason,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      rejected++;
      outcomes.push({
        sourceUrl: record.sourceUrl,
        title: null,
        action: "rejected",
        opportunityId: null,
        rejectionReason: message,
        queuedReasons: [],
      });
      logger.error(`records rejected — source=${source.id} url=${record.sourceUrl}: ${message}`);
    }
  }

  logger.info(
    `records accepted=${created + updated} rejected=${rejected} queued=${queued} — source=${source.id}`
  );

  if (!dryRun && runId) {
    await repository.completeIngestionRun(runId, {
      status: "completed",
      itemsFound: records.length,
      itemsCreated: created,
      itemsUpdated: updated,
      itemsRejected: rejected,
      errorSummary: null,
    });
  }

  logger.info(`run completed — source=${source.id}`);

  return {
    sourceId: source.id,
    dryRun,
    status: "completed",
    itemsFound: records.length,
    itemsCreated: created,
    itemsUpdated: updated,
    itemsRejected: rejected,
    itemsQueued: queued,
    errorSummary: null,
    records: outcomes,
  };
}

async function processRecord(params: {
  record: RawOpportunityRecordInput;
  source: IngestionSourceConfig;
  repository: IngestionRepository;
  dryRun: boolean;
  now: Date;
  fetchImpl?: FetchFn;
  dnsLookupImpl?: DnsLookupFn;
}): Promise<RecordOutcome> {
  const { record, source, repository, dryRun, now } = params;
  const html = record.rawContent;
  const text = stripHtmlToText(html);

  // --- Extraction (deterministic only — no LLM in this milestone) -------
  const merged = mergeExtractedFields(extractFromJsonLd(html), extractFromOpenGraph(html), extractFromHtmlMetadata(html));
  const title = merged.title?.value ?? null;
  const organization = merged.organization?.value ?? source.organizationHint;

  if (!title) {
    return {
      sourceUrl: record.sourceUrl,
      title: null,
      action: "rejected",
      opportunityId: null,
      rejectionReason: "Missing title — extraction found nothing usable.",
      queuedReasons: [],
    };
  }
  if (!organization) {
    return {
      sourceUrl: record.sourceUrl,
      title,
      action: "rejected",
      opportunityId: null,
      rejectionReason: "Missing organization — no extraction result and no source-level fallback.",
      queuedReasons: [],
    };
  }

  const sourceUrlField = normalizeUrl(record.sourceUrl);
  if (!sourceUrlField.value) {
    return {
      sourceUrl: record.sourceUrl,
      title,
      action: "rejected",
      opportunityId: null,
      rejectionReason: "Source URL failed validation.",
      queuedReasons: [],
    };
  }

  // --- Normalization --------------------------------------------------------
  // Each normalizer only ever sees tight windows around relevant keywords
  // (see the module-level comment on `relevantExcerpt`), not the whole page.
  const deadlineText = relevantExcerpt(text, DEADLINE_CONTEXT_PATTERN, 35);
  const eligibilityText = relevantExcerpt(text, ELIGIBILITY_CONTEXT_PATTERN, 60);
  const costText = relevantExcerpt(text, COST_CONTEXT_PATTERN, 40);

  const deadlineField = normalizeDeadline(deadlineText);
  const isRolling = deadlineField.value === null && deadlineField.confidence === "high";
  const deadlineEvaluation = evaluateDeadline(
    { applicationDeadline: deadlineField.value, isRollingAdmission: isRolling },
    now
  );
  const deadlineStatus: OpportunityDeadlineStatus = deadlineEvaluation.status;
  const applicationStatus: OpportunityApplicationStatus =
    deadlineStatus === "open" || deadlineStatus === "rolling"
      ? "accepting_applications"
      : deadlineStatus === "upcoming"
        ? "opening_soon"
        : deadlineStatus === "closed"
          ? "closed"
          : "unknown";

  const gradeField = normalizeGradeRange(eligibilityText);
  const costField = normalizeCost(costText);

  const gradeConfidentlyIncompatible =
    gradeField.confidence === "high" &&
    gradeField.value !== null &&
    ((gradeField.value.maxGrade !== null && gradeField.value.maxGrade < TARGET_MIN_GRADE) ||
      (gradeField.value.minGrade !== null && gradeField.value.minGrade > TARGET_MAX_GRADE));

  // --- Application URL: prefer a real "apply" link found on the page, --
  // fall back to the source page itself. Either way it's re-checked for
  // safety/reachability — never trusted just because it parsed.
  const applicationLinkCandidate = extractApplicationLinkCandidate(html, record.sourceUrl);
  const applicationUrlCandidate = applicationLinkCandidate.value ?? record.sourceUrl;
  const applicationUrlCheck =
    applicationUrlCandidate === record.sourceUrl
      ? { status: "working" as const } // already fetched successfully by the adapter to get here
      : await checkUrl(applicationUrlCandidate, {
          fetchImpl: params.fetchImpl,
          dnsLookupImpl: params.dnsLookupImpl,
          readBody: false,
        });
  const applicationUrlOk = applicationUrlCheck.status === "working" || applicationUrlCheck.status === "redirected";
  const applicationUrl = applicationUrlOk ? applicationUrlCandidate : record.sourceUrl;

  const queuedReasons: OpportunityReviewQueueReason[] = [];
  if (deadlineStatus === "unknown") queuedReasons.push("unknown_deadline");
  if (gradeField.value !== null && gradeField.confidence === "low") queuedReasons.push("low_confidence_grade");
  if (!applicationUrlOk) queuedReasons.push("broken_application_url");

  // --- Hard rejects for brand-new records only — an *existing* stored
  // opportunity is updated to reflect a newly-closed/incompatible status
  // instead (see the dedupe branch below), matching the spec's "closed
  // opportunities remain stored for audit/history" rule.
  const hardRejectReason =
    deadlineStatus === "closed"
      ? "Deadline has already passed."
      : gradeConfidentlyIncompatible
        ? "Grade range is clearly outside the 6-12 target audience."
        : null;

  const eligibilityStatus: OpportunityEligibilityDataStatus =
    gradeField.confidence === "high" && gradeField.value !== null
      ? "defined"
      : costField.value !== null
        ? "partially_defined"
        : "undefined";

  const verificationStatus: OpportunityVerificationStatus =
    source.trustLevel === "high" &&
    applicationUrlOk &&
    (deadlineStatus === "open" || deadlineStatus === "rolling" || deadlineStatus === "upcoming") &&
    eligibilityStatus === "defined"
      ? "verified"
      : applicationUrlOk
        ? "partially_verified"
        : "unverified";

  // --- Dedupe -------------------------------------------------------------
  const contentHash = computeContentHash([applicationUrl, title, organization]);
  const newCandidate = buildDedupeCandidate(
    title,
    organization,
    applicationUrl,
    record.sourceUrl,
    deadlineField.value,
    contentHash
  );

  const existingRows = await repository.findDedupeCandidates({ organization, applicationUrl });
  let bestMatch: { row: DedupeCandidateRow; verdict: "exact_duplicate" | "probable_duplicate" } | null = null;
  for (const row of existingRows) {
    const verdict = detectDuplicate(newCandidate, candidateRowToDedupeCandidate(row));
    if (verdict === "distinct") continue;
    if (!bestMatch || (verdict === "exact_duplicate" && bestMatch.verdict !== "exact_duplicate")) {
      bestMatch = { row, verdict };
    }
  }

  if (!bestMatch && hardRejectReason) {
    return {
      sourceUrl: record.sourceUrl,
      title,
      action: "rejected",
      opportunityId: null,
      rejectionReason: hardRejectReason,
      queuedReasons: [],
    };
  }

  const quality = computeQualityScore(
    {
      sourceTrustLevel: source.trustLevel,
      hasValidApplicationUrl: applicationUrlOk,
      deadlineStatus,
      applicationStatus,
      eligibilityStatus,
      verificationStatus,
      lastVerifiedAt: now.toISOString(),
      sourceCount: bestMatch ? bestMatch.row.sourceLinkCount + (bestMatch.row.primarySourceId === source.id ? 0 : 1) : 1,
    },
    now
  );

  const nextVerificationAt = computeNextVerificationAt(deadlineStatus, deadlineField.value, now);

  const fields: NewOpportunityFields = {
    title,
    organization,
    description: text.slice(0, 600),
    opportunity_type: source.defaultOpportunityType,
    format: source.defaultFormat,
    cost_type: (costField.value?.costType ?? "free") as OpportunityCostType,
    cost_amount: costField.value?.costAmount ?? null,
    min_grade: gradeField.value?.minGrade ?? null,
    max_grade: gradeField.value?.maxGrade ?? null,
    weekly_commitment_hours: null,
    application_deadline: deadlineField.value,
    application_url: applicationUrl,
    source_url: record.sourceUrl,
    source_id: source.id,
    verification_status: verificationStatus,
    verification_confidence: quality.score,
    deadline_status: deadlineStatus,
    eligibility_status: eligibilityStatus,
    application_status: applicationStatus,
    last_verified_at: now.toISOString(),
    next_verification_at: nextVerificationAt.toISOString(),
    is_verified: verificationStatus === "verified",
  };

  if (bestMatch) {
    if (bestMatch.verdict === "probable_duplicate") queuedReasons.push("probable_duplicate");
    if (
      bestMatch.row.applicationDeadline &&
      deadlineField.value &&
      bestMatch.row.applicationDeadline !== deadlineField.value
    ) {
      queuedReasons.push("conflicting_sources");
    }

    if (!dryRun) {
      await repository.updateOpportunity(bestMatch.row.id, fields);
      const isNewPrimary = trustRank(source.trustLevel) > trustRank(bestMatch.row.primarySourceTrustLevel);
      await repository.upsertSourceLink({
        opportunityId: bestMatch.row.id,
        sourceId: source.id,
        sourceUrl: record.sourceUrl,
        isPrimary: bestMatch.row.primarySourceId === source.id || isNewPrimary,
      });
      if (queuedReasons.length > 0) {
        await repository.insertReviewQueueEntries(
          queuedReasons.map((reason) => ({ opportunityId: bestMatch!.row.id, reason }))
        );
      }
    }

    return {
      sourceUrl: record.sourceUrl,
      title,
      action: "updated",
      opportunityId: bestMatch.row.id,
      rejectionReason: null,
      queuedReasons,
    };
  }

  if (dryRun) {
    return {
      sourceUrl: record.sourceUrl,
      title,
      action: "inserted",
      opportunityId: null,
      rejectionReason: null,
      queuedReasons,
    };
  }

  const opportunityId = await repository.insertOpportunity(fields);
  await repository.upsertSourceLink({
    opportunityId,
    sourceId: source.id,
    sourceUrl: record.sourceUrl,
    isPrimary: true,
  });
  if (queuedReasons.length > 0) {
    await repository.insertReviewQueueEntries(queuedReasons.map((reason) => ({ opportunityId, reason })));
  }

  return {
    sourceUrl: record.sourceUrl,
    title,
    action: "inserted",
    opportunityId,
    rejectionReason: null,
    queuedReasons,
  };
}

// Re-exported so callers building a source config don't need a second import just for the low-confidence helper.
export { isLowConfidence };
