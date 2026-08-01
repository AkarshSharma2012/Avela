import type { Metadata } from "next";

import { VerifierResponseForm } from "@/components/verification/verifier-response-form";
import { PORTFOLIO_ITEM_TYPE_LABELS } from "@/lib/portfolio/constants";
import { getVerifierClaim } from "@/lib/verification/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Confirm a claim — Avela",
  robots: { index: false, follow: false },
};

type PageParams = { token: string };

/**
 * Public, unauthenticated route — a verifier reaches this from the one-time
 * link in their email, nothing more. Deliberately shows only the single
 * claim the token was issued for (spec section 8): never the student's
 * full portfolio, other entries, or applications.
 */
export default async function VerifyClaimPage({ params }: { params: Promise<PageParams> }) {
  const { token } = await params;
  const { claim, error } = await getVerifierClaim(token);

  return (
    <main id="main-content" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
      <p className="text-xs font-medium tracking-wide text-primary uppercase">Avela</p>
      <h1 className="mt-2 font-heading text-2xl text-foreground">Confirm a claim</h1>

      {!claim ? (
        <p className="mt-4 rounded-md border border-border bg-secondary px-4 py-3 text-sm text-muted-foreground">
          {error ?? "This verification link isn't valid."}
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <div className="rounded-md border border-border bg-card px-4 py-3.5">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{PORTFOLIO_ITEM_TYPE_LABELS[claim.itemType]}</p>
            <p className="mt-1 text-lg font-medium text-foreground">{claim.itemTitle}</p>
            {claim.itemOrganization && <p className="mt-0.5 text-sm text-muted-foreground">{claim.itemOrganization}</p>}
          </div>
          <p className="text-sm text-muted-foreground">
            A student asked you to confirm this one entry on their Avela portfolio. This page only shows this single
            claim — you won&apos;t see anything else about their account.
          </p>
          <VerifierResponseForm token={token} />
        </div>
      )}
    </main>
  );
}
