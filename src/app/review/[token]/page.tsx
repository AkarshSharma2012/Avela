import type { Metadata } from "next";

import { getReviewLinkForReviewer } from "@/lib/review-links/actions";
import { PrintButton } from "@/components/review/print-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Portfolio review — Avela",
  robots: { index: false, follow: false },
};

type PageParams = { token: string };

/**
 * Public, unauthenticated, read-only "Avela Review" (spec Part 9). No
 * account, no signup wall, no editing, no unrelated recommendations —
 * exactly the student-selected items and evidence, nothing else about
 * their account. Deliberately calmer than the student dashboard: no
 * gradients, no motion, restrained color, print-friendly.
 */
export default async function ReviewPage({ params }: { params: Promise<PageParams> }) {
  const { token } = await params;
  const view = await getReviewLinkForReviewer(token);

  if (!view) {
    return (
      <main id="main-content" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <p className="text-sm text-muted-foreground">
          This review link isn&apos;t available. It may have expired, been revoked, or the link may be incorrect.
        </p>
      </main>
    );
  }

  const lastUpdatedLabel = new Date(view.lastUpdated).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10 print:px-0">
      <header className="border-b border-border pb-6">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Avela Review</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">{view.title}</h1>
        {view.introSummary && <p className="mt-2 text-sm text-foreground">{view.introSummary}</p>}
        <p className="mt-3 text-xs text-muted-foreground">Last updated {lastUpdatedLabel}</p>
      </header>

      <main id="main-content" className="flex flex-col gap-6 print:gap-8">
        {view.items.map((item, index) => (
          <section key={index} className="rounded-md border border-border px-5 py-4 print:break-inside-avoid">
            <h2 className="text-lg font-medium text-foreground">{item.itemTitle}</h2>
            {item.organization && <p className="text-sm text-muted-foreground">{item.organization}</p>}
            {item.description && <p className="mt-2 text-sm text-foreground">{item.description}</p>}

            <div className="mt-3">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Support level: {item.claimSupportSummary.headline}</p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {item.claimSupportSummary.rows
                  .filter((row) => row.status !== "not_checked")
                  .map((row) => (
                    <li key={row.dimension} className="text-sm text-foreground">
                      {row.label}: {row.statusLabel}
                    </li>
                  ))}
              </ul>
            </div>

            {item.evidence.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Evidence</p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {item.evidence.map((e, i) => (
                    <li key={i} className="text-sm text-foreground">
                      {e.label ?? e.filename}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ))}
      </main>

      <footer className="border-t border-border pt-4 text-xs text-muted-foreground print:hidden">
        <p>
          This is a private, read-only summary shared by a student. AI-assisted interpretation is labeled as such above; anything not labeled
          &quot;confirmed&quot; is self-reported or in progress, not independently verified.
        </p>
        <PrintButton />
        <a href={`/review/${token}/export`} className="mt-2 block font-medium text-foreground underline-offset-4 hover:underline">
          Download plain-text summary
        </a>
        <a href={`/review/${token}/export?type=evidence_index`} className="mt-1 block font-medium text-foreground underline-offset-4 hover:underline">
          Download evidence index
        </a>
      </footer>
    </div>
  );
}
