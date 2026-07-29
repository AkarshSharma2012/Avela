/**
 * Pure detector logic for spec section 9's anti-gaming/anti-collusion
 * signals — every function here takes already-fetched data and returns a
 * plain description of what it found, with no database access of its own,
 * so each rule is unit-testable without mocking Supabase. The orchestrator
 * (orchestrator.ts) is the only thing that fetches data and persists
 * results, isolated per-detector via Promise.allSettled so one failing
 * check never blocks the others.
 *
 * Every detector only ever produces a *risk level*, never a verdict.
 * risk_level is one of normal / additional_evidence_recommended /
 * manual_review / temporarily_limited — nothing here ever sets a claim to
 * rejected, blocks an application, or labels a student. See
 * docs/security.md's threat model for the full abuse-case -> control
 * mapping this implements.
 */

import { textSimilarity } from "@/lib/osint/matching";
import type { IntegrityRiskLevel, IntegritySignalType } from "@/types/integrity";
import type { VerifierDomainClassification } from "@/types/database";

export type DetectedSignal = {
  signalType: IntegritySignalType;
  riskLevel: IntegrityRiskLevel;
  details: Record<string, unknown>;
  relatedUserId?: string;
  portfolioItemId?: string;
};

/** Cross-student duplicate evidence — a single hash used by more than one distinct student. Reuse *within* one student's own items is a profile-strength concern (see strength.ts), not an integrity signal. */
export function detectRepeatedEvidenceHash(usages: { contentHash: string; distinctUserCount: number }[]): DetectedSignal[] {
  return usages
    .filter((usage) => usage.distinctUserCount > 1)
    .map((usage) => ({
      signalType: "repeated_evidence_hash" as const,
      riskLevel: "additional_evidence_recommended" as const,
      details: { contentHash: usage.contentHash, distinctUserCount: usage.distinctUserCount },
    }));
}

const NEAR_IDENTICAL_NARRATIVE_THRESHOLD = 0.9;

/** Two *different* items from the same student whose internal narrative (spec section 6) is nearly identical — the "splitting one project into many entries" and "many nearly identical verified entries" patterns collapse into one detector, since both are the same underlying signal. */
export function detectNearIdenticalNarratives(narrativesByItem: { itemId: string; narrative: string }[]): DetectedSignal[] {
  const signals: DetectedSignal[] = [];
  for (let i = 0; i < narrativesByItem.length; i++) {
    for (let j = i + 1; j < narrativesByItem.length; j++) {
      const a = narrativesByItem[i]!;
      const b = narrativesByItem[j]!;
      if (!a.narrative.trim() || !b.narrative.trim()) continue;
      const similarity = textSimilarity(a.narrative, b.narrative);
      if (similarity >= NEAR_IDENTICAL_NARRATIVE_THRESHOLD) {
        signals.push({
          signalType: "near_identical_narrative",
          riskLevel: "additional_evidence_recommended",
          details: { itemIds: [a.itemId, b.itemId], similarity },
        });
      }
    }
  }
  return signals;
}

const VERIFIER_REUSE_STUDENT_THRESHOLD = 4;

/** One verifier email attached to an unusually high number of *unrelated* students — never disqualifying (a real teacher/coach legitimately verifies many students), only a review prompt past a threshold. */
export function detectVerifierReusedAcrossStudents(distinctStudentCount: number): DetectedSignal | null {
  if (distinctStudentCount < VERIFIER_REUSE_STUDENT_THRESHOLD) return null;
  return {
    signalType: "verifier_reused_across_students",
    riskLevel: "manual_review",
    details: { distinctStudentCount },
  };
}

/** Student A used student B's account email as a verifier, and B used A's — a coordinated pattern, not a legitimate one (a real third party is never also the subject of the other claim). */
export function detectCircularVerification(pairs: { studentAId: string; studentBId: string }[]): DetectedSignal[] {
  return pairs.map((pair) => ({
    signalType: "circular_student_verification",
    riskLevel: "manual_review",
    relatedUserId: pair.studentBId,
    details: {},
  }));
}

const CLASSIFICATIONS_REQUIRING_A_SIGNAL: readonly VerifierDomainClassification[] = ["domain_mismatch", "suspicious_or_disposable"];

/** Surfaces verifier-legitimacy.ts's own classification as an integrity signal only for its two most severe outcomes — everything else (free email, role mailbox, unconfirmed) stays purely informational context, never a signal. */
export function detectDomainMismatchOrSuspicious(classification: VerifierDomainClassification): DetectedSignal | null {
  if (!CLASSIFICATIONS_REQUIRING_A_SIGNAL.includes(classification)) return null;
  return {
    signalType: "domain_mismatch_or_suspicious",
    riskLevel: classification === "suspicious_or_disposable" ? "manual_review" : "additional_evidence_recommended",
    details: { classification },
  };
}

/** A rate-limit bucket that hit (or repeatedly hits) its cap — the request itself is already blocked by the limiter (rate-limit.ts); this only additionally surfaces the *pattern* to a reviewer. */
export function detectRequestVelocity(counters: { bucket: string; count: number; limit: number }[]): DetectedSignal[] {
  return counters
    .filter((counter) => counter.count >= counter.limit)
    .map((counter) => ({
      signalType: "request_velocity" as const,
      riskLevel: "additional_evidence_recommended" as const,
      details: { bucket: counter.bucket, count: counter.count, limit: counter.limit },
    }));
}

const EDIT_AFTER_CONFIRMATION_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** A material edit landing very shortly after a dimension was confirmed — the invalidation itself already happened (claims/invalidation.ts); this only flags the *timing* as worth a closer look. */
export function detectEditShortlyAfterConfirmation(pairs: { confirmedAt: string; editedAt: string }[]): DetectedSignal[] {
  return pairs
    .filter((pair) => {
      const gap = new Date(pair.editedAt).getTime() - new Date(pair.confirmedAt).getTime();
      return gap >= 0 && gap <= EDIT_AFTER_CONFIRMATION_WINDOW_MS;
    })
    .map((pair) => ({
      signalType: "edit_shortly_after_confirmation" as const,
      riskLevel: "additional_evidence_recommended" as const,
      details: { confirmedAt: pair.confirmedAt, editedAt: pair.editedAt },
    }));
}

const CONNECT_DISCONNECT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** A connected identity attached and removed again in a short window — spec section 9's "connected identity attached and removed immediately around verification." */
export function detectConnectDisconnectAroundVerification(pairs: { connectedAt: string; disconnectedAt: string }[]): DetectedSignal[] {
  return pairs
    .filter((pair) => {
      const gap = new Date(pair.disconnectedAt).getTime() - new Date(pair.connectedAt).getTime();
      return gap >= 0 && gap <= CONNECT_DISCONNECT_WINDOW_MS;
    })
    .map((pair) => ({
      signalType: "connect_disconnect_around_verification" as const,
      riskLevel: "additional_evidence_recommended" as const,
      details: { connectedAt: pair.connectedAt, disconnectedAt: pair.disconnectedAt },
    }));
}

/** A forked repository where the student's own contribution is thin but the claim implies sole/original authorship — the fork/parent distinction already exists in the GitHub connector; this only flags the combination. */
export function detectForkHistoryCopied(items: { isFork: boolean; hasOwnershipMatch: boolean; claimsSoleCreator: boolean }[]): DetectedSignal[] {
  return items
    .filter((item) => item.isFork && item.claimsSoleCreator && !item.hasOwnershipMatch)
    .map(() => ({
      signalType: "fork_history_copied" as const,
      riskLevel: "additional_evidence_recommended" as const,
      details: {},
    }));
}

/** A verifier confirmed fewer fields than the claim actually displays — the field-specific confirmation UI already prevents a single "confirm everything" button; this flags when the *gap* between what's shown and what's confirmed is large. */
export function detectVerifierScopeNarrowerThanClaim(confirmedCount: number, totalDisplayedFields: number): DetectedSignal | null {
  if (totalDisplayedFields === 0) return null;
  const gap = totalDisplayedFields - confirmedCount;
  if (gap < 2) return null;
  return {
    signalType: "verifier_scope_narrower_than_claim",
    riskLevel: "additional_evidence_recommended",
    details: { confirmedCount, totalDisplayedFields },
  };
}

/** Highest risk level among a batch of signals — used to decide whether a student's overall standing needs any change at all (it still never does anything automatically beyond routing to review). */
export function highestRiskLevel(signals: DetectedSignal[]): IntegrityRiskLevel {
  const order: IntegrityRiskLevel[] = ["normal", "additional_evidence_recommended", "manual_review", "temporarily_limited"];
  let highestIndex = 0;
  for (const signal of signals) {
    const index = order.indexOf(signal.riskLevel);
    if (index > highestIndex) highestIndex = index;
  }
  return order[highestIndex]!;
}
