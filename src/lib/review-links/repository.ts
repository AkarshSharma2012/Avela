/**
 * DB access for private no-login school review links (spec Part 9).
 * Student-facing reads/writes use the caller's own authenticated Supabase
 * client (RLS-enforced); the anonymous reviewer's read
 * (getReviewLinkByTokenHash) always uses a service-role connection, since a
 * reviewer never has a Supabase session at all — mirrors
 * src/lib/verification/repository.ts's getVerifierClaimByHash pattern
 * exactly.
 */

import { createVerificationServiceRoleClient } from "@/lib/verification/repository";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { PortfolioFile, PortfolioItem, PortfolioReviewLink, PortfolioReviewLinkItem } from "@/types/portfolio";

export { createVerificationServiceRoleClient as createReviewLinkServiceRoleClient };

type Client = SupabaseClient<Database>;

export type CreateReviewLinkInput = {
  title: string;
  introSummary: string | null;
  tokenHash: string;
  expiresAt: string;
  items: { portfolioItemId: string; selectedFileIds: string[] }[];
};

export async function insertReviewLink(
  supabase: Client,
  userId: string,
  input: CreateReviewLinkInput
): Promise<{ linkId: string | null; error: string | null }> {
  const { data: link, error: linkError } = await supabase
    .from("portfolio_review_links")
    .insert({ user_id: userId, title: input.title, intro_summary: input.introSummary, token_hash: input.tokenHash, expires_at: input.expiresAt })
    .select("id")
    .single();

  if (linkError || !link) return { linkId: null, error: linkError?.message ?? "insert failed" };

  if (input.items.length > 0) {
    const { error: itemsError } = await supabase.from("portfolio_review_link_items").insert(
      input.items.map((item) => ({
        user_id: userId,
        review_link_id: link.id,
        portfolio_item_id: item.portfolioItemId,
        selected_file_ids: item.selectedFileIds,
      }))
    );
    if (itemsError) return { linkId: null, error: itemsError.message };
  }

  return { linkId: link.id, error: null };
}

export async function listReviewLinksForUser(supabase: Client, userId: string): Promise<PortfolioReviewLink[]> {
  const { data } = await supabase.from("portfolio_review_links").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  return data ?? [];
}

export async function revokeReviewLink(supabase: Client, userId: string, linkId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("portfolio_review_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .eq("user_id", userId);
  return { error: error?.message ?? null };
}

export type ReviewLinkView = {
  link: PortfolioReviewLink;
  items: (PortfolioReviewLinkItem & { item: PortfolioItem; files: PortfolioFile[] })[];
};

/** Service-role only — the reviewer has no session, so this is the one read path in this module that never goes through RLS. Always re-checks expiry/revocation itself; never trusts a caller to have already checked. */
export async function getReviewLinkByTokenHash(tokenHash: string): Promise<ReviewLinkView | null> {
  const supabase = createVerificationServiceRoleClient();

  const { data: link } = await supabase.from("portfolio_review_links").select("*").eq("token_hash", tokenHash).maybeSingle();
  if (!link) return null;

  const { data: linkItems } = await supabase.from("portfolio_review_link_items").select("*").eq("review_link_id", link.id);
  const items = linkItems ?? [];

  const itemIds = items.map((i) => i.portfolio_item_id);
  const { data: portfolioItems } = itemIds.length
    ? await supabase.from("portfolio_items").select("*").in("id", itemIds)
    : { data: [] as PortfolioItem[] };

  const allFileIds = items.flatMap((i) => i.selected_file_ids);
  const { data: files } = allFileIds.length ? await supabase.from("portfolio_files").select("*").in("id", allFileIds) : { data: [] as PortfolioFile[] };

  const itemById = new Map((portfolioItems ?? []).map((i) => [i.id, i]));
  const filesById = new Map((files ?? []).map((f) => [f.id, f]));

  const resolvedItems = items
    .filter((linkItem) => itemById.has(linkItem.portfolio_item_id))
    .map((linkItem) => ({
      ...linkItem,
      item: itemById.get(linkItem.portfolio_item_id)!,
      files: linkItem.selected_file_ids.map((id) => filesById.get(id)).filter((f): f is PortfolioFile => Boolean(f)),
    }));

  return { link, items: resolvedItems };
}

export async function recordReviewLinkView(linkId: string): Promise<void> {
  const supabase = createVerificationServiceRoleClient();
  const { data } = await supabase.from("portfolio_review_links").select("view_count").eq("id", linkId).maybeSingle();
  await supabase
    .from("portfolio_review_links")
    .update({ last_viewed_at: new Date().toISOString(), view_count: (data?.view_count ?? 0) + 1 })
    .eq("id", linkId);
}
