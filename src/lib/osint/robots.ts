/**
 * Minimal robots.txt compliance (spec section 8). Server-only. Deliberately
 * small: User-agent/Disallow/Allow/Crawl-delay only, matched by longest
 * applicable path prefix (the de-facto standard used by every major
 * crawler) — no wildcard/`$` extensions, since every source this engine
 * talks to is a well-behaved public site, not an adversarial one.
 *
 * A robots.txt that can't be fetched at all is treated as "allow" (the
 * same fail-open convention every standards-compliant crawler uses for a
 * missing file) — but a robots.txt that *is* fetched and disallows a path
 * is always obeyed, with no override.
 */

type RobotsGroup = { agents: string[]; disallow: string[]; allow: string[]; crawlDelayMs: number | null };

type RobotsRules = { groups: RobotsGroup[] };

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = new Map<string, { rules: RobotsRules; fetchedAt: number }>();

function parseRobots(text: string): RobotsRules {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let sawRuleSinceAgent = true;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (!line) continue;
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const field = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (field === "user-agent") {
      if (current && sawRuleSinceAgent) {
        current = null;
      }
      if (!current) {
        current = { agents: [], disallow: [], allow: [], crawlDelayMs: null };
        groups.push(current);
        sawRuleSinceAgent = false;
      }
      current.agents.push(value.toLowerCase());
    } else if (field === "disallow" && current) {
      sawRuleSinceAgent = true;
      if (value) current.disallow.push(value);
    } else if (field === "allow" && current) {
      sawRuleSinceAgent = true;
      if (value) current.allow.push(value);
    } else if (field === "crawl-delay" && current) {
      sawRuleSinceAgent = true;
      const seconds = Number(value);
      if (!Number.isNaN(seconds)) current.crawlDelayMs = seconds * 1000;
    }
  }
  return { groups };
}

function selectGroup(rules: RobotsRules, userAgentToken: string): RobotsGroup | null {
  const lowerToken = userAgentToken.toLowerCase();
  const specific = rules.groups.find((g) => g.agents.some((a) => a !== "*" && lowerToken.includes(a)));
  if (specific) return specific;
  return rules.groups.find((g) => g.agents.includes("*")) ?? null;
}

function pathIsMatchedBy(pattern: string, path: string): boolean {
  return path.startsWith(pattern);
}

function isPathAllowed(rules: RobotsRules, path: string, userAgentToken: string): boolean {
  const group = selectGroup(rules, userAgentToken);
  if (!group) return true;

  let bestMatch: { pattern: string; allowed: boolean } | null = null;
  for (const pattern of group.disallow) {
    if (pathIsMatchedBy(pattern, path) && (!bestMatch || pattern.length > bestMatch.pattern.length)) {
      bestMatch = { pattern, allowed: false };
    }
  }
  for (const pattern of group.allow) {
    if (pathIsMatchedBy(pattern, path) && (!bestMatch || pattern.length > bestMatch.pattern.length)) {
      bestMatch = { pattern, allowed: true };
    }
  }
  return bestMatch?.allowed ?? true;
}

async function fetchRobotsRules(origin: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<RobotsRules> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${origin}/robots.txt`, { method: "GET", redirect: "follow", signal: controller.signal });
    if (!response.ok) return { groups: [] };
    const text = await response.text();
    return parseRobots(text.slice(0, 100_000));
  } catch {
    return { groups: [] }; // fail open — see module doc
  } finally {
    clearTimeout(timer);
  }
}

export async function robotsAllows(
  url: string,
  userAgentToken: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const origin = parsed.origin;

  const cached = cache.get(origin);
  const rules = cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS ? cached.rules : await fetchRobotsRules(origin, fetchImpl, timeoutMs);
  if (!cached || Date.now() - cached.fetchedAt >= CACHE_TTL_MS) {
    cache.set(origin, { rules, fetchedAt: Date.now() });
  }

  return isPathAllowed(rules, parsed.pathname + parsed.search, userAgentToken);
}

/** Test-only: clears the in-memory robots.txt cache between test cases. */
export function clearRobotsCacheForTests(): void {
  cache.clear();
}
