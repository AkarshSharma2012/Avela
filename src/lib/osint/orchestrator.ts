/**
 * Runs every applicable connector for one claim, normalizes and persists
 * their findings, derives conflicts, and computes the final score/support
 * level (spec sections 1, 6, 7, 9). The one place that turns raw connector
 * output into what a student and a reviewer actually see.
 *
 * Every connector call is isolated with Promise.allSettled — a thrown
 * exception or a `{ ok: false }` outcome from one connector never stops
 * the others, and the check still completes with whatever evidence *did*
 * come back (spec section 1: "fail independently without failing the
 * entire verification").
 */

import { isAuthoritativeLevel } from "@/lib/osint/authority";
import { ALL_CONNECTORS } from "@/lib/osint/connectors";
import { TITLE_SIMILARITY_STRONG_THRESHOLD } from "@/lib/osint/constants";
import { assertRespectfulLanguage, buildRespectfulConflictMessage } from "@/lib/osint/messages";
import { isAmbiguousName } from "@/lib/osint/matching";
import * as repo from "@/lib/osint/repository";
import { scoreOsintEvidence, type ScoringInputs } from "@/lib/osint/scoring";
import type { ClaimInput, ConnectorName, ManualReviewReason, NormalizedEvidence } from "@/lib/osint/types";
import type { OsintConsentScope } from "@/lib/osint/consent";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PortfolioOsintCheck, PortfolioOsintConflict, PortfolioOsintEvidence } from "@/types/osint";

type Client = SupabaseClient<Database>;

export type ExistingVerificationContext = {
  level: string;
  hasUploadedEvidence: boolean;
};

export type RunOsintCheckParams = {
  supabase: Client;
  userId: string;
  itemId: string;
  claim: ClaimInput;
  consentScope: OsintConsentScope;
  existingVerification: ExistingVerificationContext | null;
  /** Test-only override for the connector list — production callers always get ALL_CONNECTORS. */
  connectors?: readonly import("@/lib/osint/types").Connector[];
};

export type RunOsintCheckResult = {
  check: PortfolioOsintCheck;
  evidence: PortfolioOsintEvidence[];
  conflicts: PortfolioOsintConflict[];
  connectorFailures: { connector: ConnectorName; reason: string }[];
};

function sourceDomainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

/** Whether a piece of evidence actually ties to *this* claim/student, not just that a source was found. GitHub ownership (owner/contributor/commit-author login match) is judged separately in runOsintCheck, since it needs claim.connectedGithubUsername rather than any of the fields checked here. */
function isMatchedEvidence(evidence: NormalizedEvidence): boolean {
  const fields = evidence.extractedFields;
  if (fields.mentionsStudentName === true && fields.mentionsClaimTitle === true) return true;
  if (fields.authorMatch === true) return true;
  if (fields.credentialIdMatch === true) return true;
  return false;
}

export async function runOsintCheck(params: RunOsintCheckParams): Promise<{ result: RunOsintCheckResult | null; error: string | null }> {
  const { supabase, userId, itemId, claim, consentScope, existingVerification, connectors = ALL_CONNECTORS } = params;

  const { check: createdCheck, error: createError } = await repo.createCheck(supabase, {
    user_id: userId,
    portfolio_item_id: itemId,
    status: "running",
    consent_scope: consentScope,
    started_at: new Date().toISOString(),
    expires_at: repo.computeExpiryFromNow(),
  });
  if (createError || !createdCheck) return { result: null, error: "Couldn't start that check. Please try again." };

  const applicableConnectors = connectors.filter((connector) => connector.applies(claim));
  const settled = await Promise.allSettled(applicableConnectors.map((connector) => connector.run(claim)));

  const allEvidence: NormalizedEvidence[] = [];
  const connectorFailures: { connector: ConnectorName; reason: string }[] = [];

  settled.forEach((outcome, index) => {
    const connector = applicableConnectors[index]!;
    if (outcome.status === "fulfilled") {
      if (outcome.value.ok) allEvidence.push(...outcome.value.evidence);
      else connectorFailures.push({ connector: connector.name, reason: outcome.value.reason });
    } else {
      console.error(`[osint] connector ${connector.name} threw:`, outcome.reason);
      connectorFailures.push({ connector: connector.name, reason: "This source couldn't be checked right now." });
    }
  });

  // Persist evidence — dedupe by (check_id, content_hash) is enforced at the
  // DB layer (see the migration), insertEvidence just absorbs that as a
  // no-op rather than an error.
  for (const evidence of allEvidence) {
    await repo.insertEvidence(supabase, {
      user_id: userId,
      check_id: createdCheck.id,
      source_type: evidence.sourceType,
      source_url: evidence.sourceUrl,
      source_domain: evidence.sourceDomain || sourceDomainOf(evidence.sourceUrl),
      authority_level: evidence.authorityLevel,
      extracted_fields: evidence.extractedFields,
      confidence: Math.max(0, Math.min(100, evidence.confidence)),
      content_hash: repo.computeContentHash(evidence.sourceUrl, evidence.extractedFields),
      retrieved_at: evidence.retrievedAt,
      expires_at: repo.computeExpiryFromNow(),
    });
  }

  const manualReviewReasons = new Set<ManualReviewReason>();

  const githubEvidence = allEvidence.find((e) => e.sourceType === "github");
  const hasGithubOwnerMatch = githubEvidence?.extractedFields.ownerLoginMatch === true;
  const hasGithubContributorMatch =
    githubEvidence?.extractedFields.contributorLoginMatch === true || githubEvidence?.extractedFields.orgMemberMatch === true;
  const hasGithubCommitAuthorMatch = githubEvidence?.extractedFields.commitAuthorLoginMatch === true;
  const hasGithubOwnershipMatch = hasGithubOwnerMatch || hasGithubContributorMatch || hasGithubCommitAuthorMatch;

  // A common/ambiguous display name is irrelevant once GitHub ownership is
  // resolved by exact account login — identity came from the connected
  // account, not from the name, so it must not force a "Needs review" here
  // (spec section 4: never show "the name is common" once the account
  // match is what's doing the work).
  if (isAmbiguousName(claim.studentDisplayName) && !hasGithubOwnershipMatch) {
    manualReviewReasons.add("ambiguous_student_name");
    await writeConflict(supabase, userId, createdCheck.id, {
      field_name: "student_name",
      claimed_value: claim.studentDisplayName,
      observed_value: null,
      severity: "info",
      reason: "ambiguous_student_name",
    });
  }

  let hasConflictingDates = false;
  let hasOrganizationMismatch = false;

  for (const evidence of allEvidence) {
    const fields = evidence.extractedFields;

    if (evidence.sourceType === "crossref" && (claim.startDate || claim.endDate) && typeof fields.publishedDate === "string") {
      const claimedYear = claim.startDate ? new Date(claim.startDate).getFullYear() : null;
      const observedYear = new Date(fields.publishedDate).getFullYear();
      if (claimedYear !== null && !Number.isNaN(observedYear) && Math.abs(claimedYear - observedYear) > 1) {
        hasConflictingDates = true;
        await writeConflict(supabase, userId, createdCheck.id, {
          field_name: "dates",
          claimed_value: claim.startDate,
          observed_value: fields.publishedDate as string,
          severity: "minor",
          reason: "material_date_conflict",
        });
      }
    }

    if ((evidence.sourceType === "official_organization" || evidence.sourceType === "issuer_page") && claim.organization && fields.mentionsClaimTitle === true) {
      const organizationDomainMatches = fields.organizationDomainMatches;
      if (organizationDomainMatches === false) {
        hasOrganizationMismatch = true;
        manualReviewReasons.add("organization_conflict");
        await writeConflict(supabase, userId, createdCheck.id, {
          field_name: "organization",
          claimed_value: claim.organization,
          observed_value: evidence.sourceDomain,
          severity: "minor",
          reason: "organization_conflict",
        });
      }
    }

    if (fields.mentionsClaimTitle === true && fields.mentionsStudentName === false) {
      manualReviewReasons.add("source_silent_on_student");
      await writeConflict(supabase, userId, createdCheck.id, {
        field_name: "student_name",
        claimed_value: claim.studentDisplayName,
        observed_value: null,
        severity: "minor",
        reason: "source_silent_on_student",
      });
    }

    if (evidence.sourceType === "github" && fields.connectedUsernameMissing === true) {
      manualReviewReasons.add("missing_github_identity");
      await writeConflict(supabase, userId, createdCheck.id, {
        field_name: "repository_ownership",
        claimed_value: null,
        observed_value: (fields.repoFullName as string) ?? null,
        severity: "info",
        reason: "missing_github_identity",
      });
    } else if (evidence.sourceType === "github" && fields.ownershipUnclear === true) {
      manualReviewReasons.add("unclear_repository_ownership");
      await writeConflict(supabase, userId, createdCheck.id, {
        field_name: "repository_ownership",
        claimed_value: claim.connectedGithubUsername,
        observed_value: (fields.repoFullName as string) ?? null,
        severity: "minor",
        reason: "unclear_repository_ownership",
      });
    }
  }

  // "The source is unofficial" only forces manual review when a
  // non-authoritative source *looks* like it's close to confirming the
  // claim (spec section 6) — an ordinary weak/partial match with no strong
  // signal is `partially_supported`/`unable_to_verify` on its own, not a
  // forced review; see scoring.ts for how those levels are reached instead.
  const hasNonGithubAuthoritativeSource = allEvidence.some(
    (e) => e.sourceType !== "github" && isAuthoritativeLevel(e.authorityLevel) && isMatchedEvidence(e)
  );
  const hasAnyAuthoritativeSource = hasGithubOwnershipMatch || hasNonGithubAuthoritativeSource;
  const maxConfidence = allEvidence.reduce((max, e) => Math.max(max, e.confidence), 0);
  if (!hasAnyAuthoritativeSource && maxConfidence >= 60) {
    manualReviewReasons.add("unofficial_source_only");
  }

  const hasUnsafeOrSuspiciousUrl = allEvidence.some(
    (e) => e.sourceType === "url_reputation" && (e.extractedFields.verdict === "suspicious" || e.extractedFields.verdict === "malicious")
  );

  const sourceUrls = [...new Set(allEvidence.map((e) => e.sourceUrl))];
  let hasReusedEvidenceAcrossUnrelatedClaims = false;
  for (const url of sourceUrls) {
    if (await repo.isEvidenceReusedAcrossOtherItems(supabase, userId, itemId, url)) {
      hasReusedEvidenceAcrossUnrelatedClaims = true;
      break;
    }
  }

  const hasOfficialIssuerRecordMatch = allEvidence.some(
    (e) => e.sourceType === "structured_metadata" && e.authorityLevel === "issuer" && (e.extractedFields.mentionsStudentName === true || e.extractedFields.credentialIdMatch === true)
  );
  const hasOfficialOrgPageNamingStudent = allEvidence.some(
    (e) => (e.sourceType === "official_organization" || e.sourceType === "issuer_page") && e.authorityLevel === "official_organization" && e.extractedFields.mentionsStudentName === true && e.extractedFields.mentionsClaimTitle === true
  );
  const hasTrustedRegistryExactMatch = allEvidence.some(
    (e) => e.sourceType === "crossref" && e.extractedFields.authorMatch === true && (e.extractedFields.titleSimilarity as number) >= TITLE_SIMILARITY_STRONG_THRESHOLD
  );
  const hasGithubDatesAlign = githubEvidence?.extractedFields.datesAlign === true;
  const hasGithubReadmeMatch = githubEvidence?.extractedFields.readmeOrDescriptionMatch === true;
  const hasGithubDeploymentUrlMatch = githubEvidence?.extractedFields.deploymentUrlMatch === true;
  const hasGithubTitleOnlyMatch = githubEvidence?.extractedFields.titleOnlyMatch === true;
  const hasGithubDisplayNameOnlyMatch = githubEvidence?.extractedFields.displayNameOnlyMatch === true;

  const countedDomains = new Set<string>();
  let independentSupportingSourceCount = 0;
  for (const e of allEvidence) {
    // RDAP and URL reputation are "safety and domain context" only (spec
    // section 6) — they never count toward the support score, positively or
    // negatively via this bucket. GitHub is excluded too: its contribution
    // is already fully captured by the dedicated hasGithub* fields above,
    // so counting it again here would double-count the same evidence.
    if (e.sourceType === "icann_rdap" || e.sourceType === "url_reputation" || e.sourceType === "github") continue;
    if (isAuthoritativeLevel(e.authorityLevel) && isMatchedEvidence(e)) continue; // already counted in a stronger bucket above
    if (e.confidence < 30) continue;
    if (countedDomains.has(e.sourceDomain)) continue;
    countedDomains.add(e.sourceDomain);
    independentSupportingSourceCount++;
  }

  const datesAndOrganizationConsistent =
    !hasConflictingDates &&
    !hasOrganizationMismatch &&
    allEvidence.some((e) => e.extractedFields.mentionsClaimTitle === true && (e.extractedFields.organizationDomainMatches === true || e.sourceType === "crossref"));

  const scoringInputs: ScoringInputs = {
    hasDirectVerifierConfirmation: existingVerification?.level === "externally_confirmed",
    hasOfficialIssuerRecordMatch,
    hasOfficialOrgPageNamingStudent,
    hasTrustedRegistryExactMatch,
    hasGithubOwnerMatch,
    hasGithubContributorMatch,
    hasGithubCommitAuthorMatch,
    hasGithubDatesAlign,
    hasGithubReadmeMatch,
    hasGithubDeploymentUrlMatch,
    hasGithubTitleOnlyMatch,
    hasGithubDisplayNameOnlyMatch,
    independentSupportingSourceCount,
    hasUploadedSupportingEvidence: existingVerification?.hasUploadedEvidence ?? false,
    datesAndOrganizationConsistent,
    hasConflictingDates,
    hasOrganizationMismatch,
    hasExpiredCredential: false, // no structured credential-expiry field on portfolio_items yet — see the final report's limitations.
    hasUnsafeOrSuspiciousUrl,
    hasReusedEvidenceAcrossUnrelatedClaims,
    hasAnyAuthoritativeSource,
    hasNonGithubAuthoritativeSource,
    hasAnyEvidence: allEvidence.length > 0,
    requiresManualReview: manualReviewReasons.size > 0,
  };

  const scoringResult = scoreOsintEvidence(scoringInputs);

  const completedAt = new Date().toISOString();
  const { error: updateError } = await repo.updateCheck(supabase, userId, createdCheck.id, {
    status: "completed",
    completed_at: completedAt,
    final_support_level: scoringResult.supportLevel,
    score: scoringResult.score,
    score_breakdown: scoringResult.contributions,
  });
  if (updateError) {
    console.error("[osint] failed to finalize check:", updateError);
    return { result: null, error: "Couldn't finish that check. Please try again." };
  }

  const [evidenceRows, conflictRows] = await Promise.all([
    repo.listEvidenceForCheck(supabase, userId, createdCheck.id),
    repo.listConflictsForCheck(supabase, userId, createdCheck.id),
  ]);

  return {
    result: {
      check: {
        ...createdCheck,
        status: "completed",
        completed_at: completedAt,
        final_support_level: scoringResult.supportLevel,
        score: scoringResult.score,
        score_breakdown: scoringResult.contributions,
      },
      evidence: evidenceRows,
      conflicts: conflictRows,
      connectorFailures,
    },
    error: null,
  };
}

async function writeConflict(
  supabase: Client,
  userId: string,
  checkId: string,
  input: { field_name: string; claimed_value: string | null; observed_value: string | null; severity: "info" | "minor" | "material"; reason: string }
): Promise<void> {
  const message = buildRespectfulConflictMessage(input.reason);
  const languageError = assertRespectfulLanguage(message);
  if (languageError) {
    console.error("[osint] refused to write a non-respectful conflict message:", input.reason);
    return;
  }
  await repo.insertConflict(supabase, {
    user_id: userId,
    check_id: checkId,
    field_name: input.field_name,
    claimed_value: input.claimed_value,
    observed_value: input.observed_value,
    severity: input.severity,
    respectful_message: message,
  });
}
