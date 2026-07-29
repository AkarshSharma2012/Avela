/**
 * Runs the applicable detectors (signals.ts) for one student/item and
 * persists whatever they find. Each detector's data-fetch + evaluation is
 * isolated via Promise.allSettled — the same "one failing check never
 * blocks the others" shape as osint/orchestrator.ts — and every persisted
 * signal only ever raises a risk level for reviewer attention; nothing
 * here ever rejects a claim, blocks an application, or labels a student.
 *
 * This is deliberately called from a handful of existing action call
 * sites (verifier domain assessment, field confirmations) as a best-effort,
 * non-blocking side effect — never a request-blocking dependency. The
 * account-level checks (verifier reuse across students, circular
 * verification) are exposed for a reviewer-triggered or future scheduled
 * sweep rather than run on every request, since they scan across all
 * students rather than one claim.
 */

import {
  createIntegrityServiceRoleClient,
  countDistinctUsersForContentHash,
  findCircularVerificationPairs,
  insertIntegritySignal,
  listCrossStudentDuplicateHashes,
} from "@/lib/integrity/repository";
import {
  detectCircularVerification,
  detectDomainMismatchOrSuspicious,
  detectNearIdenticalNarratives,
  detectRepeatedEvidenceHash,
  detectVerifierReusedAcrossStudents,
  detectVerifierScopeNarrowerThanClaim,
  type DetectedSignal,
} from "@/lib/integrity/signals";
import { countDistinctStudentsForVerifierEmail } from "@/lib/verification/repository";
import type { VerifierDomainClassification } from "@/types/database";

async function persistSignals(userId: string, signals: DetectedSignal[]): Promise<void> {
  if (signals.length === 0) return;
  const serviceClient = createIntegrityServiceRoleClient();
  for (const signal of signals) {
    await insertIntegritySignal(serviceClient, userId, signal);
  }
}

/** Called right after a verifier-domain assessment is recorded (verification/actions.ts) — best-effort, never blocking the request that triggered it. */
export async function runVerifierIntegrityChecks(userId: string, verifierEmail: string, domainClassification: VerifierDomainClassification): Promise<void> {
  const results = await Promise.allSettled([
    (async () => {
      const domainSignal = detectDomainMismatchOrSuspicious(domainClassification);
      return domainSignal ? [domainSignal] : [];
    })(),
    (async () => {
      const serviceClient = createIntegrityServiceRoleClient();
      const distinctStudentCount = await countDistinctStudentsForVerifierEmail(serviceClient, verifierEmail, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());
      const signal = detectVerifierReusedAcrossStudents(distinctStudentCount);
      return signal ? [signal] : [];
    })(),
  ]);

  const signals = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  try {
    await persistSignals(userId, signals);
  } catch (err) {
    console.error("[integrity] failed to persist verifier integrity signals:", err);
  }
}

/** Called after a verifier submits field confirmations. */
export async function runFieldConfirmationScopeCheck(userId: string, confirmedCount: number, totalDisplayedFields: number): Promise<void> {
  const signal = detectVerifierScopeNarrowerThanClaim(confirmedCount, totalDisplayedFields);
  if (!signal) return;
  try {
    await persistSignals(userId, [signal]);
  } catch (err) {
    console.error("[integrity] failed to persist verifier-scope signal:", err);
  }
}

/** Called after a personal-project narrative is saved — compares against the student's own other items. */
export async function runNearIdenticalNarrativeCheck(userId: string, narrativesByItem: { itemId: string; narrative: string }[]): Promise<void> {
  const signals = detectNearIdenticalNarratives(narrativesByItem);
  try {
    await persistSignals(userId, signals);
  } catch (err) {
    console.error("[integrity] failed to persist narrative-similarity signals:", err);
  }
}

/** Account-level, cross-student sweep — intended for a reviewer-triggered or scheduled job, not a per-request path (see module doc). */
export async function runCrossStudentDuplicateEvidenceSweep(): Promise<void> {
  const serviceClient = createIntegrityServiceRoleClient();
  const duplicates = await listCrossStudentDuplicateHashes(serviceClient);
  const signals = detectRepeatedEvidenceHash(duplicates);
  // Cross-student signals have no single owning user — recorded once per
  // affected student would require resolving which students share the
  // hash; left as a documented follow-up (see final report) rather than
  // guessing an owner here.
  void signals;
}

/** Account-level, cross-student sweep for circular verification — same reviewer-triggered/scheduled shape as the duplicate-evidence sweep. */
export async function runCircularVerificationSweep(): Promise<void> {
  const serviceClient = createIntegrityServiceRoleClient();
  const pairs = await findCircularVerificationPairs(serviceClient);
  for (const pair of pairs) {
    const [signal] = detectCircularVerification([pair]);
    if (!signal) continue;
    try {
      await persistSignals(pair.studentAId, [signal]);
      await persistSignals(pair.studentBId, [{ ...signal, relatedUserId: pair.studentAId }]);
    } catch (err) {
      console.error("[integrity] failed to persist circular-verification signal:", err);
    }
  }
}

/** How many *distinct users* currently share a given file's content hash — exposed for a per-upload check if a future caller wants one, alongside the batch sweep above. */
export async function checkContentHashAcrossStudents(contentHash: string): Promise<number> {
  const serviceClient = createIntegrityServiceRoleClient();
  return countDistinctUsersForContentHash(serviceClient, contentHash);
}
