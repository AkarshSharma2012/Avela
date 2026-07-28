/**
 * A small, allowlist-based reviewer check — not a role system. Kept out of
 * actions.ts because a "use server" file may only export async functions;
 * this one is a plain synchronous predicate.
 */
export function isAuthorizedReviewer(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = (process.env.REVIEWER_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.trim().toLowerCase());
}
