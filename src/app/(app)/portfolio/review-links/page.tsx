import type { Metadata } from "next";

import { ReviewLinksManager } from "@/components/portfolio/review-links/review-links-manager";
import { requireProfile } from "@/lib/auth/dal";
import { listMyReviewLinks } from "@/lib/review-links/actions";
import { listPortfolioItems } from "@/lib/portfolio/repository";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Review links — Avela" };

/** Student-facing management for private, no-login school review links (spec Part 9): create (select items), list, revoke. */
export default async function ReviewLinksPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [items, links] = await Promise.all([listPortfolioItems(supabase, profile.id), listMyReviewLinks()]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-6 py-10 sm:py-12">
      <h1 className="font-heading text-3xl text-foreground">Review links</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Share a private, read-only view of selected portfolio items with a school or reviewer — no account needed on their end.
      </p>
      <ReviewLinksManager items={items} links={links} />
    </div>
  );
}
