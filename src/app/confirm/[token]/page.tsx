import type { Metadata } from "next";

import { ConfirmationResponseForm } from "@/components/confirmations/confirmation-response-form";
import { getConfirmationRequestForReviewer } from "@/lib/confirmations/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = { title: "Confirm — Avela", robots: { index: false, follow: false } };

type PageParams = { token: string };

/**
 * Public, unauthenticated route (spec Part 10) — a reviewer sees only the
 * specific claim dimensions the student asked about for one item, never
 * anything else about the student's account. Designed for under 20
 * seconds: no account, no signup wall.
 */
export default async function ConfirmClaimPage({ params }: { params: Promise<PageParams> }) {
  const { token } = await params;
  const view = await getConfirmationRequestForReviewer(token);

  return (
    <main id="main-content" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
      <p className="text-xs font-medium tracking-wide text-primary uppercase">Avela</p>
      <h1 className="mt-2 font-heading text-2xl text-foreground">Quick confirmation</h1>

      {!view ? (
        <p className="mt-4 rounded-md border border-border bg-secondary px-4 py-3 text-sm text-muted-foreground">
          This confirmation link isn&apos;t available — it may have expired, already been used, or been withdrawn.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <div className="rounded-md border border-border bg-card px-4 py-3.5">
            <p className="text-lg font-medium text-foreground">{view.itemTitle}</p>
            <ul className="mt-2 flex flex-col gap-0.5">
              {view.claimDimensionLabels.map((label) => (
                <li key={label} className="text-sm text-muted-foreground">
                  · {label}
                </li>
              ))}
            </ul>
          </div>
          {view.studentContextNote && <p className="text-sm text-muted-foreground">&quot;{view.studentContextNote}&quot;</p>}
          <p className="text-sm text-muted-foreground">
            A student asked you to confirm the item above. This page only shows what you&apos;re being asked about — you won&apos;t see anything
            else about their account, and this doesn&apos;t require an account of your own.
          </p>
          <ConfirmationResponseForm token={token} />
        </div>
      )}
    </main>
  );
}
