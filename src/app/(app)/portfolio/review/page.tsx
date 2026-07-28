import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OsintReviewerDecisionForm } from "@/components/portfolio/osint/osint-reviewer-decision-form";
import { OsintSupportBadge } from "@/components/portfolio/osint/osint-support-badge";
import { ReviewerDecisionForm } from "@/components/verification/reviewer-decision-form";
import { VerificationBadge } from "@/components/verification/verification-badge";
import { getOsintReviewQueueForReviewer } from "@/lib/osint/actions";
import { PORTFOLIO_ITEM_TYPE_LABELS } from "@/lib/portfolio/constants";
import { getReviewQueueForReviewer } from "@/lib/verification/actions";

export const metadata: Metadata = { title: "Verification Review — Avela" };

/**
 * A small, internal-only queue of `needs_review` portfolio items — not a
 * full admin panel (spec section 3D). Gated by getReviewQueueForReviewer's
 * own allowlist check (REVIEWER_EMAILS); anyone else gets a 404, same as a
 * page that doesn't exist for them.
 */
export default async function VerificationReviewPage() {
  const { entries, error } = await getReviewQueueForReviewer();
  if (error) {
    notFound();
  }
  const { entries: osintEntries } = await getOsintReviewQueueForReviewer();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-6 py-10 sm:py-12">
      <p className="text-xs font-medium tracking-wide text-primary uppercase">Internal</p>
      <h1 className="mt-2 font-heading text-3xl text-foreground">Verification review</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Portfolio entries flagged as needing a closer look. Notes you write here are shown to the student — describe
        what&apos;s missing or mismatched, specifically and respectfully.
      </p>

      {entries.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Nothing needs review right now.</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-4">
          {entries.map((entry) => (
            <li key={entry.verification.id} className="rounded-md border border-border bg-card px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <VerificationBadge level={entry.verification.verification_level} />
                <span className="text-xs text-muted-foreground">{PORTFOLIO_ITEM_TYPE_LABELS[entry.itemType]}</span>
              </div>
              <p className="mt-1.5 text-base font-medium text-foreground">{entry.itemTitle}</p>
              {entry.verification.review_notes && (
                <p className="mt-1 text-sm text-muted-foreground">Current note: {entry.verification.review_notes}</p>
              )}
              <div className="mt-3">
                <ReviewerDecisionForm verificationId={entry.verification.id} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-12 font-heading text-2xl text-foreground">Public-source review</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Portfolio entries whose public-source check needs a closer, human look — never a claim that the entry is
        false, only that the automated check couldn&apos;t confidently score it.
      </p>

      {osintEntries.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Nothing needs review right now.</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-4">
          {osintEntries.map((entry) => (
            <li key={entry.check.id} className="rounded-md border border-border bg-card px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                {entry.check.final_support_level && <OsintSupportBadge level={entry.check.final_support_level} />}
                {typeof entry.check.score === "number" && <span className="text-xs text-muted-foreground">Score: {entry.check.score}/100</span>}
              </div>
              <p className="mt-1.5 text-base font-medium text-foreground">{entry.itemTitle}</p>
              <div className="mt-3">
                <OsintReviewerDecisionForm checkId={entry.check.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
