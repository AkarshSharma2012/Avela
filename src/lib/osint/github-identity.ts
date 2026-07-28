/**
 * Normalizes whatever format a student types for their GitHub identity
 * (spec: "GitHub identity support") into a bare, comparable username —
 * `github.com/username`, `https://github.com/username`, `@username`, or
 * just `username` all resolve to the same value, so the ownership checks
 * in connectors/github.ts always compare exact logins, never raw
 * student-typed text.
 */

// GitHub usernames: 1-39 chars, alphanumeric or single hyphens, no leading/trailing hyphen.
const GITHUB_USERNAME_PATTERN = /^[a-z0-9](?:-?[a-z0-9])*$/i;
const MAX_GITHUB_USERNAME_LENGTH = 39;

export function normalizeGithubUsername(input: string | null | undefined): string | null {
  if (!input) return null;
  let value = input.trim();
  if (!value) return null;

  value = value.replace(/^@/, "");
  value = value.replace(/^https?:\/\//i, "");
  value = value.replace(/^(www\.)?github\.com\//i, "");
  value = value.split(/[/?#]/)[0] ?? "";
  value = value.trim();

  if (!value || value.length > MAX_GITHUB_USERNAME_LENGTH) return null;
  if (!GITHUB_USERNAME_PATTERN.test(value)) return null;
  return value;
}

export function githubProfileUrl(username: string): string {
  return `https://github.com/${username}`;
}

/** Whether the student's connected GitHub username is present verbatim as a substring of a repo login — a weak, non-ownership fallback signal for logins that concatenate a name with no separators (e.g. "AkarshSharma2012"). Never used to establish ownership on its own. */
export function loginContainsNameTokens(login: string, displayName: string): boolean {
  const bareLogin = login.toLowerCase().replace(/[^a-z0-9]/g, "");
  const tokens = displayName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
  if (tokens.length === 0) return false;
  return tokens.every((token) => bareLogin.includes(token));
}
