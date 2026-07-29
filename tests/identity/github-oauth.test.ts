import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildGithubAuthorizeUrl,
  exchangeGithubOauthCode,
  fetchGithubAuthenticatedUser,
  isGithubOauthConfigured,
  listGithubUserRepositories,
} from "@/lib/identity/github-oauth";

const ENV_KEYS = ["GITHUB_OAUTH_CLIENT_ID", "GITHUB_OAUTH_CLIENT_SECRET", "GITHUB_OAUTH_REDIRECT_URI"] as const;

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

function configure() {
  process.env.GITHUB_OAUTH_CLIENT_ID = "client-id";
  process.env.GITHUB_OAUTH_CLIENT_SECRET = "client-secret";
  process.env.GITHUB_OAUTH_REDIRECT_URI = "https://example.com/api/auth/github/callback";
}

describe("isGithubOauthConfigured / buildGithubAuthorizeUrl", () => {
  it("is unconfigured (and builds no URL) by default — no real GitHub OAuth App exists in this environment", () => {
    expect(isGithubOauthConfigured()).toBe(false);
    expect(buildGithubAuthorizeUrl("state")).toBeNull();
  });

  it("builds an authorize URL with no scope param (minimum read-only permissions) once configured", () => {
    configure();
    expect(isGithubOauthConfigured()).toBe(true);
    const url = new URL(buildGithubAuthorizeUrl("some-state")!);
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("state")).toBe("some-state");
    expect(url.searchParams.has("scope")).toBe(false);
  });
});

describe("exchangeGithubOauthCode", () => {
  it("fails closed when unconfigured, without making a request", async () => {
    const fetchImpl = vi.fn();
    const result = await exchangeGithubOauthCode("code", fetchImpl);
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns the access token and parsed scopes on success", async () => {
    configure();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ access_token: "tok", scope: "read:user,public_repo" }), { status: 200 }));
    const result = await exchangeGithubOauthCode("code", fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: true, accessToken: "tok", scopes: ["read:user", "public_repo"] });
  });

  it("treats a GitHub error payload as a failure", async () => {
    configure();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "bad_verification_code" }), { status: 200 }));
    const result = await exchangeGithubOauthCode("code", fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(false);
  });
});

describe("fetchGithubAuthenticatedUser", () => {
  it("normalizes the GitHub profile response", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ id: 42, login: "octocat", name: "The Octocat", avatar_url: "https://a.example/x.png", html_url: "https://github.com/octocat" }), { status: 200 })
    );
    const result = await fetchGithubAuthenticatedUser("token", fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({
      ok: true,
      user: { id: 42, login: "octocat", name: "The Octocat", avatarUrl: "https://a.example/x.png", htmlUrl: "https://github.com/octocat" },
    });
  });

  it("reports an invalid connection on a 401", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 401 }));
    const result = await fetchGithubAuthenticatedUser("token", fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: false, reason: "This GitHub connection is no longer valid." });
  });
});

describe("listGithubUserRepositories", () => {
  it("filters out private repositories — only public repos are ever offered for selection", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            { full_name: "octocat/public-repo", name: "public-repo", owner: { login: "octocat", type: "User" }, fork: false, private: false, html_url: "https://github.com/octocat/public-repo" },
            { full_name: "octocat/secret-repo", name: "secret-repo", owner: { login: "octocat", type: "User" }, fork: false, private: true, html_url: "https://github.com/octocat/secret-repo" },
          ]),
          { status: 200 }
        )
    );
    const result = await listGithubUserRepositories("token", fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.repos).toHaveLength(1);
      expect(result.repos[0].fullName).toBe("octocat/public-repo");
    }
  });
});
