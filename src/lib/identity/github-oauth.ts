/**
 * GitHub OAuth App flow (spec section 4: "Use GitHub OAuth or a GitHub App
 * authorization flow with minimum read-only permissions"). Every function
 * here talks only to fixed, hardcoded github.com endpoints — never a
 * student-supplied URL — so this intentionally does not go through
 * osint/safe-fetch.ts's SSRF layer, which exists for exactly the opposite
 * case (fetching a URL discovered/supplied by a student).
 *
 * No real GitHub OAuth App exists in this environment: GITHUB_OAUTH_CLIENT_ID
 * and GITHUB_OAUTH_CLIENT_SECRET are unset. Every function below fails
 * closed with `isGithubOauthConfigured() === false` rather than attempting a
 * request with empty credentials — see docs/security.md for what a real
 * deployment needs to configure.
 *
 * Scope is deliberately minimal and read-only: no scope parameter is sent
 * at all, which grants only read access to the user's public profile and
 * public repositories — never private repos, never write access, never
 * organization administration.
 */

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_BASE = "https://api.github.com";

export function isGithubOauthConfigured(): boolean {
  return Boolean(process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET && process.env.GITHUB_OAUTH_REDIRECT_URI);
}

/** Null when unconfigured — callers must show "Connect GitHub" as unavailable rather than starting a flow that can't finish. */
export function buildGithubAuthorizeUrl(state: string): string | null {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const redirectUri = process.env.GITHUB_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) return null;

  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  // No `scope` param — public-profile/public-repo read only, the narrowest
  // grant GitHub's OAuth flow offers.
  return url.toString();
}

export type GithubOauthExchangeResult =
  | { ok: true; accessToken: string; scopes: string[] }
  | { ok: false; reason: string };

export async function exchangeGithubOauthCode(code: string, fetchImpl: typeof fetch = fetch): Promise<GithubOauthExchangeResult> {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GITHUB_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return { ok: false, reason: "GitHub connect isn't configured yet." };
  }

  let response: Response;
  try {
    response = await fetchImpl(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
    });
  } catch {
    return { ok: false, reason: "Couldn't reach GitHub. Please try again." };
  }

  if (!response.ok) {
    return { ok: false, reason: "GitHub didn't accept that connection request." };
  }

  let data: { access_token?: string; scope?: string; error?: string };
  try {
    data = await response.json();
  } catch {
    return { ok: false, reason: "GitHub returned an unexpected response." };
  }

  if (data.error || !data.access_token) {
    return { ok: false, reason: "GitHub didn't accept that connection request." };
  }

  const scopes = data.scope ? data.scope.split(",").filter(Boolean) : [];
  return { ok: true, accessToken: data.access_token, scopes };
}

export type GithubOauthUser = {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  htmlUrl: string;
};

export type GithubOauthUserResult = { ok: true; user: GithubOauthUser } | { ok: false; reason: string };

async function fetchGithubApi(path: string, accessToken: string, fetchImpl: typeof fetch): Promise<{ ok: true; data: unknown } | { ok: false; reason: string }> {
  let response: Response;
  try {
    response = await fetchImpl(`${GITHUB_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
    });
  } catch {
    return { ok: false, reason: "Couldn't reach GitHub. Please try again." };
  }
  if (!response.ok) {
    return { ok: false, reason: response.status === 401 ? "This GitHub connection is no longer valid." : "GitHub request failed." };
  }
  try {
    return { ok: true, data: await response.json() };
  } catch {
    return { ok: false, reason: "GitHub returned an unexpected response." };
  }
}

export async function fetchGithubAuthenticatedUser(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<GithubOauthUserResult> {
  const result = await fetchGithubApi("/user", accessToken, fetchImpl);
  if (!result.ok) return result;
  const data = result.data as { id?: number; login?: string; name?: string | null; avatar_url?: string; html_url?: string };
  if (!data.id || !data.login) return { ok: false, reason: "GitHub returned an incomplete profile." };
  return {
    ok: true,
    user: {
      id: data.id,
      login: data.login,
      name: data.name ?? null,
      avatarUrl: data.avatar_url ?? null,
      htmlUrl: data.html_url ?? `https://github.com/${data.login}`,
    },
  };
}

export type GithubOauthRepo = {
  fullName: string;
  name: string;
  ownerLogin: string;
  ownerType: string | null;
  isFork: boolean;
  private: boolean;
  htmlUrl: string;
};

export type GithubOauthReposResult = { ok: true; repos: GithubOauthRepo[] } | { ok: false; reason: string };

/**
 * The connect flow's "select one of their repositories" step (spec section
 * 4's student flow). Deliberately capped at a single page (100) and
 * public-only, sorted by most-recently pushed — no student portfolio flow
 * needs more than that to pick one repository.
 */
export async function listGithubUserRepositories(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<GithubOauthReposResult> {
  const result = await fetchGithubApi("/user/repos?type=owner&sort=pushed&per_page=100", accessToken, fetchImpl);
  if (!result.ok) return result;
  if (!Array.isArray(result.data)) return { ok: false, reason: "GitHub returned an unexpected response." };

  const repos = (result.data as {
    full_name?: string;
    name?: string;
    owner?: { login?: string; type?: string };
    fork?: boolean;
    private?: boolean;
    html_url?: string;
  }[])
    .filter((repo) => !repo.private)
    .map((repo) => ({
      fullName: repo.full_name ?? "",
      name: repo.name ?? "",
      ownerLogin: repo.owner?.login ?? "",
      ownerType: repo.owner?.type ?? null,
      isFork: repo.fork ?? false,
      private: repo.private ?? false,
      htmlUrl: repo.html_url ?? "",
    }))
    .filter((repo) => repo.fullName && repo.htmlUrl);

  return { ok: true, repos };
}
