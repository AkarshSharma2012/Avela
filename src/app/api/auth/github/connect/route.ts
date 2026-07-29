import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth/dal";
import { OAUTH_STATE_TTL_SECONDS } from "@/lib/identity/constants";
import { buildGithubAuthorizeUrl, isGithubOauthConfigured } from "@/lib/identity/github-oauth";
import { generateVerificationToken } from "@/lib/verification/tokens";

export const GITHUB_OAUTH_STATE_COOKIE = "avela_gh_oauth_state";

/**
 * Starts the "Connect GitHub" flow (spec section 4 student flow, step 1-2).
 * A plain redirecting GET Route Handler, not a Server Action — starting an
 * OAuth flow means navigating the whole page to github.com, which a Server
 * Action's fetch-based RPC call can't do.
 */
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"));
  }

  if (!isGithubOauthConfigured()) {
    return NextResponse.redirect(new URL("/portfolio?github_connect=unavailable", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"));
  }

  const state = generateVerificationToken();
  const authorizeUrl = buildGithubAuthorizeUrl(state);
  if (!authorizeUrl) {
    return NextResponse.redirect(new URL("/portfolio?github_connect=unavailable", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"));
  }

  const cookieStore = await cookies();
  cookieStore.set(GITHUB_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: OAUTH_STATE_TTL_SECONDS,
    path: "/",
  });

  return NextResponse.redirect(authorizeUrl);
}
