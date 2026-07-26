/**
 * Deterministic 32-bit FNV-1a hash, hex-encoded. Deliberately not
 * `node:crypto` — this module is pure JS with no Node dependency so it can
 * run in any environment (ingestion script, edge function, or a future
 * client-side preview) without a bundler needing to polyfill `crypto`.
 * Collision resistance is not the goal here (a real cryptographic hash
 * isn't needed for "is this the same listing we already have" checks);
 * determinism and stability across environments are.
 */
export function computeContentHash(parts: readonly string[]): string {
  const input = parts.map((part) => part.trim().toLowerCase()).join("|");
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sameDay(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);
}

export type DedupeCandidate = {
  title: string;
  organization: string;
  canonicalUrl: string | null;
  applicationUrl: string;
  sourceUrl: string | null;
  applicationDeadline: string | null;
  contentHash: string;
};

export type DuplicateVerdict = "exact_duplicate" | "probable_duplicate" | "distinct";

/**
 * Compares two candidate listings using only deterministic signals (never
 * fuzzy/ML text similarity) per the spec. Two or more matching signals
 * (title, organization, deadline, source URL) short of an exact URL/hash
 * match is treated as "probable" rather than "exact" — enough to route to
 * the review queue, not enough to silently merge automatically.
 */
export function detectDuplicate(a: DedupeCandidate, b: DedupeCandidate): DuplicateVerdict {
  if (a.contentHash === b.contentHash) return "exact_duplicate";
  if (a.canonicalUrl && b.canonicalUrl && a.canonicalUrl === b.canonicalUrl) {
    return "exact_duplicate";
  }
  if (a.applicationUrl === b.applicationUrl) return "exact_duplicate";

  let matchingSignals = 0;
  if (normalizeForComparison(a.title) === normalizeForComparison(b.title)) matchingSignals++;
  if (normalizeForComparison(a.organization) === normalizeForComparison(b.organization)) {
    matchingSignals++;
  }
  if (sameDay(a.applicationDeadline, b.applicationDeadline)) matchingSignals++;
  if (a.sourceUrl && b.sourceUrl && a.sourceUrl === b.sourceUrl) matchingSignals++;

  return matchingSignals >= 2 ? "probable_duplicate" : "distinct";
}
