import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth/dal";
import { completeGithubConnect } from "@/lib/identity/actions";
import { exchangeGithubOauthCode } from "@/lib/identity/github-oauth";
import { GITHUB_OAUTH_STATE_COOKIE } from "@/app/api/auth/github/connect/route";

const SITE_URL = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

function redirectToPortfolio(status: string) {
  return NextResponse.redirect(new URL(`/portfolio?github_connect=${status}`, SITE_URL()));
}

/**
 * Completes the OAuth round trip. The `state` param is checked against the
 * short-lived httpOnly cookie set by connect/route.ts (constant-string
 * equality is fine here — state is a random CSRF token, not a secret we
 * need timing-safe comparison for, matching common OAuth-client practice)
 * before any code exchange happens, closing off a CSRF'd connect attempt
 * where an attacker's own GitHub authorization gets attached to a victim's
 * Avela session.
 */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return redirectToPortfolio("error");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GITHUB_OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(GITHUB_OAUTH_STATE_COOKIE);

  if (oauthError) return redirectToPortfolio("declined");
  if (!code || !state || !expectedState || state !== expectedState) return redirectToPortfolio("error");

  const exchangeResult = await exchangeGithubOauthCode(code);
  if (!exchangeResult.ok) return redirectToPortfolio("error");

  const connectResult = await completeGithubConnect(exchangeResult.accessToken, exchangeResult.scopes);
  if (!connectResult.ok) {
    return redirectToPortfolio(connectResult.error.includes("already connected to another student") ? "already_linked" : "error");
  }

  return redirectToPortfolio("success");
}
