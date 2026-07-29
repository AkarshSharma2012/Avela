/**
 * GitHub public API connector (spec section 1) — public repository,
 * contributor, and commit data only, via api.github.com's unauthenticated
 * (or optionally token-authenticated, see GITHUB_TOKEN below) REST
 * endpoints. Applies only when the claim links directly to a github.com
 * repository — never searches GitHub on the student's behalf.
 *
 * Repository *ownership* is decided from the student's connected GitHub
 * username (claim.connectedGithubUsername, an exact-login comparison) —
 * as of Milestone 10.7 this is only ever populated from an OAuth-connected
 * identity (src/lib/identity/repository.ts's getActiveGithubUsernameForUser),
 * never from a manually typed username, which now earns zero identity
 * credit (spec section 4) — never from studentDisplayName: a GitHub login
 * routinely concatenates a
 * name with no separators (e.g. "AkarshSharma2012" for "Akarsh Sharma"),
 * so token-similarity name matching almost never fires for a real account
 * and almost never rules one out either — it's not a safe ownership
 * signal in either direction. Display-name/title matching still runs, but
 * only as the weakest possible fallback signal (see scoring.ts's
 * GITHUB_TITLE_ONLY_MATCH / GITHUB_DISPLAY_NAME_ONLY_MATCH), never as
 * proof of ownership and never on its own able to reach
 * confirmed_by_authoritative_source (see orchestrator.ts).
 *
 * All of a repo's signals (owner, contributors, commit authors, dates,
 * README/description, homepage) are folded into a single NormalizedEvidence
 * entry rather than one per signal, so the UI never shows "GitHub" as
 * several duplicate source cards for one check.
 */

import { safeFetch } from "@/lib/osint/safe-fetch";
import { loginContainsNameTokens } from "@/lib/osint/github-identity";
import { dateOverlap, textSimilarity, titleSimilarity } from "@/lib/osint/matching";
import { TITLE_SIMILARITY_STRONG_THRESHOLD } from "@/lib/osint/constants";
import type { ClaimInput, Connector, ConnectorOutcome, NormalizedEvidence } from "@/lib/osint/types";

const REPO_URL_PATTERN = /^https?:\/\/(www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(\.git)?\/?(?:[#?].*)?$/i;

export function parseGithubRepoUrl(url: string): { owner: string; repo: string } | null {
  const match = REPO_URL_PATTERN.exec(url.trim());
  if (!match) return null;
  return { owner: match[2]!, repo: match[3]! };
}

/** Used by official-page.ts to skip treating a github.com repo link as a generic web page — the dedicated logic here already covers it, and fetching it a second time as an "official organization" page is exactly the duplicate-evidence bug this connector rewrite fixes. */
export function isGithubRepositoryUrl(url: string): boolean {
  return parseGithubRepoUrl(url) !== null;
}

type GithubRepo = {
  full_name?: string;
  description?: string | null;
  owner?: { login?: string; type?: string };
  html_url?: string;
  homepage?: string | null;
  created_at?: string;
  updated_at?: string;
  pushed_at?: string;
  default_branch?: string;
  stargazers_count?: number;
  forks_count?: number;
  archived?: boolean;
  fork?: boolean;
  private?: boolean;
};

/**
 * GitHub's REST API is served as JSON but with a vendor content-type; the
 * shared allowlist in constants.ts already includes it, so no per-call
 * override is needed here — see safe-fetch.ts's ALLOWED_CONTENT_TYPES.
 */
async function fetchGithubJson(url: string): Promise<{ ok: true; data: unknown } | { ok: false; reason: string }> {
  const token = process.env.GITHUB_TOKEN; // optional — server-only, raises the otherwise-low unauthenticated rate limit; never sent to the client.
  const result = await safeFetch(url, {
    fetchImpl: token
      ? ((input, init) =>
          fetch(input, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` } })) as typeof fetch
      : undefined,
  });
  if (result.status !== "ok") return { ok: false, reason: `GitHub API request failed (${result.status}).` };
  try {
    return { ok: true, data: JSON.parse(result.body) };
  } catch {
    return { ok: false, reason: "GitHub API returned an unparsable response." };
  }
}

function decodeBase64Readme(content: string): string {
  try {
    return Buffer.from(content, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

/** Best-effort README fetch — a missing/unreadable README is never an error for the connector as a whole, just one fewer signal. */
async function fetchReadmeText(owner: string, repo: string): Promise<string | null> {
  const result = await fetchGithubJson(`https://api.github.com/repos/${owner}/${repo}/readme`);
  if (!result.ok) return null;
  const data = result.data as { content?: string; encoding?: string };
  if (!data.content) return null;
  return decodeBase64Readme(data.content).slice(0, 5000);
}

async function fetchContributorLogins(owner: string, repo: string): Promise<string[]> {
  const result = await fetchGithubJson(`https://api.github.com/repos/${owner}/${repo}/contributors?per_page=100`);
  if (!result.ok || !Array.isArray(result.data)) return [];
  return (result.data as { login?: string; type?: string }[])
    .filter((c) => c.type !== "Bot")
    .map((c) => c.login)
    .filter((login): login is string => Boolean(login));
}

/** Whether the connected username authored at least one commit — checked directly via the commits API's author filter rather than inferred from the (sometimes truncated, sometimes squash-merged-away) contributors list. */
async function hasAuthoredCommit(owner: string, repo: string, username: string): Promise<boolean> {
  const result = await fetchGithubJson(`https://api.github.com/repos/${owner}/${repo}/commits?author=${encodeURIComponent(username)}&per_page=1`);
  return result.ok && Array.isArray(result.data) && result.data.length > 0;
}

/** Best-effort, publicly-visible org membership check — silently false on any failure (private membership, rate limit, non-org owner), never treated as an error. */
async function isPublicOrgMember(org: string, username: string): Promise<boolean> {
  const result = await fetchGithubJson(`https://api.github.com/orgs/${org}/public_members?per_page=100`);
  if (!result.ok || !Array.isArray(result.data)) return false;
  return (result.data as { login?: string }[]).some((m) => m.login?.toLowerCase() === username.toLowerCase());
}

function homepageMentioned(homepage: string | null | undefined, description: string | null): boolean {
  if (!homepage || !description) return false;
  try {
    const host = new URL(homepage).hostname.toLowerCase();
    return description.toLowerCase().includes(host);
  } catch {
    return false;
  }
}

export const githubConnector: Connector = {
  name: "github",
  applies(claim: ClaimInput): boolean {
    return Boolean(claim.url && parseGithubRepoUrl(claim.url));
  },
  async run(claim: ClaimInput): Promise<ConnectorOutcome> {
    const parsed = claim.url ? parseGithubRepoUrl(claim.url) : null;
    if (!parsed) return { ok: false, reason: "Claim URL is not a GitHub repository link." };

    const repoResult = await fetchGithubJson(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`);
    if (!repoResult.ok) return { ok: false, reason: repoResult.reason };
    const repo = repoResult.data as GithubRepo;
    if (repo.private) return { ok: false, reason: "Repository is not public." };

    const ownerLogin = repo.owner?.login ?? parsed.owner;
    const ownerType = repo.owner?.type ?? null;
    const connectedUsername = claim.connectedGithubUsername;

    const [contributors, readmeText] = await Promise.all([
      fetchContributorLogins(parsed.owner, parsed.repo),
      fetchReadmeText(parsed.owner, parsed.repo),
    ]);

    const ownerLoginMatch = Boolean(connectedUsername && ownerLogin.toLowerCase() === connectedUsername.toLowerCase());
    const contributorLoginMatch = Boolean(
      connectedUsername && contributors.some((login) => login.toLowerCase() === connectedUsername.toLowerCase())
    );
    const commitAuthorLoginMatch = connectedUsername ? await hasAuthoredCommit(parsed.owner, parsed.repo, connectedUsername) : false;
    const orgMemberMatch =
      connectedUsername && ownerType === "Organization" ? await isPublicOrgMember(parsed.owner, connectedUsername) : false;

    const hasOwnershipMatch = ownerLoginMatch || contributorLoginMatch || commitAuthorLoginMatch || orgMemberMatch;

    const datesAlign =
      dateOverlap(claim.startDate, claim.endDate, repo.created_at ?? null, repo.updated_at ?? repo.pushed_at ?? null) === 1;

    const combinedRepoText = [repo.description ?? "", readmeText ?? ""].join(" ");
    const readmeOrDescriptionMatch =
      titleSimilarity(claim.title, repo.description ?? "") >= TITLE_SIMILARITY_STRONG_THRESHOLD ||
      textSimilarity(claim.title, combinedRepoText) >= TITLE_SIMILARITY_STRONG_THRESHOLD;

    const deploymentUrlMatch = homepageMentioned(repo.homepage, claim.description);

    // Weak, name-only fallback signals (spec section 5: "name matching is
    // weighted too heavily" — these are deliberately the smallest point
    // values in scoring.ts and never gate ownership or manual review).
    const titleOnlyMatch = titleSimilarity(claim.title, repo.description ?? repo.full_name ?? "") >= TITLE_SIMILARITY_STRONG_THRESHOLD;
    const displayNameOnlyMatch = !hasOwnershipMatch && loginContainsNameTokens(ownerLogin, claim.studentDisplayName);

    const connectedUsernameMissing = !connectedUsername;
    const ownershipUnclear = !connectedUsernameMissing && !hasOwnershipMatch;

    const retrievedAt = new Date().toISOString();
    const evidence: NormalizedEvidence = {
      sourceType: "github",
      sourceUrl: repo.html_url ?? claim.url!,
      sourceDomain: "github.com",
      authorityLevel: hasOwnershipMatch ? "trusted_registry" : "unknown",
      extractedFields: {
        repoFullName: repo.full_name ?? `${parsed.owner}/${parsed.repo}`,
        ownerLogin,
        ownerType,
        connectedUsername: connectedUsername ?? null,
        ownerLoginMatch,
        contributorLoginMatch,
        commitAuthorLoginMatch,
        orgMemberMatch,
        datesAlign,
        readmeOrDescriptionMatch,
        deploymentUrlMatch,
        titleOnlyMatch,
        displayNameOnlyMatch,
        connectedUsernameMissing,
        ownershipUnclear,
        createdAt: repo.created_at ?? null,
        updatedAt: repo.updated_at ?? repo.pushed_at ?? null,
        defaultBranch: repo.default_branch ?? null,
        forks: repo.forks_count ?? null,
        stars: repo.stargazers_count ?? null,
        archived: repo.archived ?? false,
        isFork: repo.fork ?? false,
        homepage: repo.homepage ?? null,
      },
      confidence: ownerLoginMatch ? 90 : contributorLoginMatch || orgMemberMatch ? 80 : commitAuthorLoginMatch ? 75 : titleOnlyMatch || displayNameOnlyMatch ? 30 : 15,
      retrievedAt,
    };

    return { ok: true, evidence: [evidence] };
  },
};
