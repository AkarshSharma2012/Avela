/**
 * Optional Agent-Reach (Panniantong/Agent-Reach) adapter — spec section 13.
 *
 * THE ACTUAL AGENT-REACH TOOL IS NEVER INSTALLED BY THIS MODULE. There is no
 * `panniantong`/`agent-reach` package in package.json, no subprocess spawned
 * anywhere in this file by default, and no code path that downloads,
 * imports, or shells out to it. This class is inert scaffolding: it exists
 * so the provider *boundary* (PublicResearchProvider) is real and typed
 * today, and so a future operator who deliberately wants Agent-Reach has a
 * documented, narrow integration point — never so that this milestone
 * quietly wires up a third-party tool.
 *
 * Disabled by default (`AGENT_REACH_ENABLED` unset/false) — every method
 * short-circuits to `{ ok: false, reason: "..." }` without attempting
 * anything. Native connectors (native-provider.ts) always run first and
 * never depend on this provider being available; the student workflow
 * never blocks or degrades because Agent-Reach is absent.
 *
 * If a real integration is ever built, it MUST (per spec section 13):
 *   - stay server-only, never imported into a Client Component or the
 *     client bundle,
 *   - run any subprocess via an exact executable + subcommand allowlist,
 *     argument arrays (never interpolated shell strings), a temporary
 *     working directory, a sanitized environment, a timeout, an
 *     output-size cap, and per-user/per-domain rate limits,
 *   - never inherit cookies, accept arbitrary user-supplied flags, write
 *     outside its temp directory, or fetch file:// / non-HTTP URLs / private
 *     network destinations,
 *   - normalize every result into ResearchResult (never a raw LLM summary),
 *   - never directly set externally_confirmed, identity confirmation,
 *     employment confirmation, organizational authority, or any
 *     admissions/eligibility field — those decisions belong to
 *     claims/research-signals.ts and the dimension-scoring logic alone.
 *
 * Uninstall instructions (for a future operator who *did* enable a real
 * integration): unset AGENT_REACH_ENABLED, remove any Agent-Reach binary/
 * config/cache from outside this repository (never committed here in the
 * first place), and this provider reverts to fully inert with no further
 * cleanup needed in this codebase.
 */

import type { PublicResearchProvider, ResearchOutcome } from "@/lib/research/types";

const UNAVAILABLE_REASON = "We could not check this source right now.";

export function isAgentReachEnabled(): boolean {
  return process.env.AGENT_REACH_ENABLED === "true";
}

function disabledOutcome(): ResearchOutcome {
  return { ok: false, reason: UNAVAILABLE_REASON };
}

export const agentReachResearchProvider: PublicResearchProvider = {
  name: "agent-reach",

  async healthCheck() {
    if (!isAgentReachEnabled()) return { ok: false, reason: "Agent-Reach is disabled." };
    // No real integration exists — even when the flag is set, this reports
    // unavailable rather than pretending to have checked anything.
    return { ok: false, reason: "Agent-Reach integration is not implemented in this environment." };
  },

  async searchWeb(): Promise<ResearchOutcome> {
    return disabledOutcome();
  },
  async readPublicPage(): Promise<ResearchOutcome> {
    return disabledOutcome();
  },
  async inspectGitHubRepository(): Promise<ResearchOutcome> {
    return disabledOutcome();
  },
  async inspectPublicVideoMetadata(): Promise<ResearchOutcome> {
    return disabledOutcome();
  },
  async inspectRssFeed(): Promise<ResearchOutcome> {
    return disabledOutcome();
  },
  async inspectPublicDiscussion(): Promise<ResearchOutcome> {
    return disabledOutcome();
  },
};
