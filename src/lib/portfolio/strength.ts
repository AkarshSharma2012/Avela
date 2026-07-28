/**
 * Transparent, dependency-free profile-strength scoring — every point
 * earned is attached to a plain-language reason, and the score itself is
 * framed as guidance, never a judgment of the student.
 *
 * Fairness rule (spec section 8): nothing here reads cost, pay, or any
 * notion of an activity's "prestige." Every item_type contributes to the
 * score in exactly the same way — a volunteer shift, a family caregiving
 * responsibility logged as `custom`, and a paid internship all earn points
 * identically for being documented, having real dates, and so on. The only
 * things that ever move the score are: how much a student has documented,
 * and how completely.
 */

import type { PortfolioItem } from "@/types/portfolio";
import type { PortfolioVerificationLevel } from "@/types/database";

/**
 * Item types where attaching real proof (a file or an outside link)
 * meaningfully strengthens the record — a `skill` or `link` entry has
 * nothing further to attach, so it's never penalized for lacking a file.
 * This list is about what's typically *useful* to prove, not which types
 * matter more.
 */
const PROOF_RELEVANT_ITEM_TYPES: ReadonlySet<PortfolioItem["item_type"]> = new Set([
  "award",
  "project",
  "certification",
  "work_experience",
  "leadership",
  "volunteer_service",
  "essay_response",
  "document",
  "activity",
]);

export type ProfileStrengthReason = {
  label: string;
  points: number;
  maxPoints: number;
};

export type ProfileStrength = {
  score: number;
  maxScore: number;
  reasons: ProfileStrengthReason[];
  /** Plain-language, guidance-only next steps — never phrased as a requirement or a deficiency. */
  suggestions: string[];
};

export type ProfileStrengthInput = {
  /** Only visible (non-archived) items count — an archived item was deliberately set aside by the student. */
  items: readonly PortfolioItem[];
  /** Portfolio item id -> number of files attached. */
  fileCountByItemId: ReadonlyMap<string, number>;
  /** Portfolio item ids that are attached as evidence to at least one application. */
  linkedItemIds: ReadonlySet<string>;
  /**
   * Portfolio item id -> current verification level (Milestone 10.5).
   * Optional and defaults to empty — an item with no entry here (or no
   * verification row at all) is treated exactly like `unverified`, which
   * earns zero trust-bonus points but never subtracts from anything else.
   * Every other scoring category above is computed identically regardless
   * of this map, by design (fairness rule below).
   */
  verificationLevelByItemId?: ReadonlyMap<string, PortfolioVerificationLevel>;
};

/**
 * Verification trust bonus (spec section 6) — small, transparent, and
 * strictly additive. `unverified` and items with no record at all earn 0;
 * a reviewer `rejected` finding also earns 0 (that specific piece of
 * evidence didn't hold up, but the bonus simply doesn't apply — it's never
 * a penalty, and every other point the item already earned above is
 * untouched). Fairness rules this must never violate:
 *   - paid programs and prestigious organizations get no extra weight —
 *     this function only ever reads `verification_level`, never
 *     `item_type`, `organization`, cost, or pay.
 *   - a student with no formal documents (community work, family
 *     responsibility, informal leadership, self-directed projects) is
 *     never penalized for staying at `unverified` — their coverage,
 *     volume, completeness, and proof points are computed exactly the
 *     same as anyone else's; this bonus can only ever add on top.
 */
const TRUST_MAX = 10;
const TRUST_WEIGHT_BY_LEVEL: Record<PortfolioVerificationLevel, number> = {
  unverified: 0,
  evidence_added: 0.5,
  needs_review: 0.25,
  externally_confirmed: 1,
  rejected: 0,
};

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function itemCompletenessFraction(item: PortfolioItem): number {
  const fields = [item.start_date !== null, item.outcome !== null && item.outcome.trim().length > 0, item.skills.length > 0];
  const filled = fields.filter(Boolean).length;
  return filled / fields.length;
}

/** An item with none of its core detail fields filled in — used by the Portfolio Center's "needs details" section and the dashboard's incomplete-item count. */
export function isPortfolioItemIncomplete(item: PortfolioItem): boolean {
  const hasCoreDetail =
    (item.description !== null && item.description.trim().length > 0) ||
    (item.outcome !== null && item.outcome.trim().length > 0) ||
    item.skills.length > 0 ||
    item.start_date !== null;
  return !hasCoreDetail;
}

const COVERAGE_MAX = 30;
const COVERAGE_TYPES_FOR_FULL_CREDIT = 6;
const VOLUME_MAX = 20;
const VOLUME_ITEMS_FOR_FULL_CREDIT = 10;
const COMPLETENESS_MAX = 25;
const PROOF_MAX = 15;
const LINKED_MAX = 10;

export function computeProfileStrength(input: ProfileStrengthInput): ProfileStrength {
  const { items, fileCountByItemId, linkedItemIds, verificationLevelByItemId } = input;
  const maxScore = COVERAGE_MAX + VOLUME_MAX + COMPLETENESS_MAX + PROOF_MAX + LINKED_MAX + TRUST_MAX;

  if (items.length === 0) {
    return {
      score: 0,
      maxScore,
      reasons: [],
      suggestions: ["Add your first portfolio item — an activity, award, project, or anything else you can document."],
    };
  }

  const distinctTypes = new Set(items.map((item) => item.item_type)).size;
  const coveragePoints = round(Math.min(distinctTypes / COVERAGE_TYPES_FOR_FULL_CREDIT, 1) * COVERAGE_MAX);

  const volumePoints = round(Math.min(items.length / VOLUME_ITEMS_FOR_FULL_CREDIT, 1) * VOLUME_MAX);

  const avgCompleteness = items.reduce((sum, item) => sum + itemCompletenessFraction(item), 0) / items.length;
  const completenessPoints = round(avgCompleteness * COMPLETENESS_MAX);

  const proofRelevantItems = items.filter((item) => PROOF_RELEVANT_ITEM_TYPES.has(item.item_type));
  const proofFraction =
    proofRelevantItems.length === 0
      ? 1
      : proofRelevantItems.filter((item) => (fileCountByItemId.get(item.id) ?? 0) > 0 || Boolean(item.url)).length /
        proofRelevantItems.length;
  const proofPoints = round(proofFraction * PROOF_MAX);

  const linkedFraction = items.filter((item) => linkedItemIds.has(item.id)).length / items.length;
  const linkedPoints = round(linkedFraction * LINKED_MAX);

  const trustFraction =
    items.reduce((sum, item) => sum + TRUST_WEIGHT_BY_LEVEL[verificationLevelByItemId?.get(item.id) ?? "unverified"], 0) / items.length;
  const trustPoints = round(trustFraction * TRUST_MAX);

  const reasons: ProfileStrengthReason[] = [
    { label: `${distinctTypes} type${distinctTypes === 1 ? "" : "s"} of evidence`, points: coveragePoints, maxPoints: COVERAGE_MAX },
    { label: `${items.length} item${items.length === 1 ? "" : "s"} documented`, points: volumePoints, maxPoints: VOLUME_MAX },
    { label: "How complete each item is (dates, outcome, skills)", points: completenessPoints, maxPoints: COMPLETENESS_MAX },
    { label: "Proof attached where it helps (files or links)", points: proofPoints, maxPoints: PROOF_MAX },
    { label: "Items backing up a real application", points: linkedPoints, maxPoints: LINKED_MAX },
    { label: "Evidence verification (optional bonus)", points: trustPoints, maxPoints: TRUST_MAX },
  ];

  const suggestions: string[] = [];
  if (distinctTypes < COVERAGE_TYPES_FOR_FULL_CREDIT) {
    suggestions.push("Add a different kind of item — awards, projects, and volunteer work all count.");
  }
  if (avgCompleteness < 1) {
    suggestions.push("Fill in dates, an outcome, or a few skills on your existing items.");
  }
  if (proofFraction < 1) {
    suggestions.push("Attach a file or link to items where you have proof.");
  }
  if (linkedFraction < 1) {
    suggestions.push("Attach evidence to an application from your Applications page.");
  }

  const score = Math.round(coveragePoints + volumePoints + completenessPoints + proofPoints + linkedPoints + trustPoints);

  return { score, maxScore, reasons, suggestions };
}
