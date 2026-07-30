"use server";

/**
 * Server actions for private, no-login school review links (spec Part 9).
 * Creation/listing/revocation always run as the authenticated student, via
 * the normal RLS-enforced client — only the reviewer's own read
 * (getReviewLinkForReviewer, called from the /review/[token] route) uses
 * the service-role connection in repository.ts.
 */

import { getAuthenticatedUser } from "@/lib/auth/dal";
import { hashVerificationToken, generateVerificationToken, computeVerificationExpiry, isTokenExpired } from "@/lib/verification/tokens";
import {
  getReviewLinkByTokenHash,
  insertReviewLink,
  listReviewLinksForUser,
  recordReviewLinkView,
  revokeReviewLink,
  type ReviewLinkView,
} from "@/lib/review-links/repository";
import { listDimensionsForItem } from "@/lib/claims/repository";
import { summarizeClaimDimensions, type ClaimSupportSummary } from "@/lib/claims/rollup";
import { createReviewLinkServiceRoleClient } from "@/lib/review-links/repository";
import { createClient } from "@/lib/supabase/server";
import type { PortfolioReviewLink } from "@/types/portfolio";

const REVIEW_LINK_DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export type CreateReviewLinkResult = { token?: string; linkId?: string; error?: string };

export async function createReviewLinkAction(input: {
  title: string;
  introSummary: string | null;
  items: { portfolioItemId: string; selectedFileIds: string[] }[];
}): Promise<CreateReviewLinkResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in to create a review link." };

  const title = input.title.trim();
  if (title.length === 0) return { error: "Give this review link a title." };
  if (input.items.length === 0) return { error: "Select at least one item to share." };

  const supabase = await createClient();
  const rawToken = generateVerificationToken();
  const tokenHash = hashVerificationToken(rawToken);
  const expiresAt = computeVerificationExpiry(new Date(), REVIEW_LINK_DEFAULT_TTL_SECONDS).toISOString();

  const { linkId, error } = await insertReviewLink(supabase, user.id, {
    title,
    introSummary: input.introSummary?.trim() || null,
    tokenHash,
    expiresAt,
    items: input.items,
  });

  if (error || !linkId) {
    console.error("[review-links] failed to create review link:", error);
    return { error: "Couldn't create that review link. Please try again." };
  }

  return { token: rawToken, linkId };
}

export async function listMyReviewLinks(): Promise<PortfolioReviewLink[]> {
  const user = await getAuthenticatedUser();
  if (!user) return [];
  const supabase = await createClient();
  return listReviewLinksForUser(supabase, user.id);
}

export async function revokeReviewLinkAction(linkId: string): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in to revoke a review link." };
  const supabase = await createClient();
  const { error } = await revokeReviewLink(supabase, user.id, linkId);
  return error ? { error: "Couldn't revoke that link. Please try again." } : {};
}

export type ReviewerItemView = {
  itemTitle: string;
  organization: string | null;
  description: string | null;
  claimSupportSummary: ClaimSupportSummary;
  evidence: { filename: string; label: string | null }[];
};

export type ReviewerPageView = {
  title: string;
  introSummary: string | null;
  lastUpdated: string;
  items: ReviewerItemView[];
};

/**
 * The only reviewer-facing read. Fails closed on every invalid state
 * (bad token, expired, revoked) by returning null — the route renders a
 * generic "this link is no longer available" message either way, never
 * distinguishing "wrong token" from "expired" (spec: resist URL guessing).
 */
export async function getReviewLinkForReviewer(rawToken: string): Promise<ReviewerPageView | null> {
  if (!rawToken || rawToken.length < 16) return null;

  const tokenHash = hashVerificationToken(rawToken);
  const view: ReviewLinkView | null = await getReviewLinkByTokenHash(tokenHash);
  if (!view) return null;
  if (view.link.revoked_at) return null;
  if (isTokenExpired(view.link.expires_at)) return null;

  await recordReviewLinkView(view.link.id);

  const serviceClient = createReviewLinkServiceRoleClient();
  const items: ReviewerItemView[] = await Promise.all(
    view.items.map(async (linkItem) => {
      const dimensions = await listDimensionsForItem(serviceClient, linkItem.item.user_id, linkItem.item.id);
      return {
        itemTitle: linkItem.item.title,
        organization: linkItem.item.organization,
        description: linkItem.item.description,
        claimSupportSummary: summarizeClaimDimensions(dimensions),
        evidence: linkItem.files.map((f) => ({ filename: f.original_filename, label: f.label })),
      };
    })
  );

  return {
    title: view.link.title,
    introSummary: view.link.intro_summary,
    lastUpdated: view.link.updated_at,
    items,
  };
}
