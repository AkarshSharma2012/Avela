/**
 * Provider selection for the generic research adapter (spec section 13's
 * priority list, applied at this layer): native connectors always run
 * first; Agent-Reach is only ever consulted as a fallback when native
 * comes back unavailable, and only when explicitly enabled. Higher-level
 * priorities from the spec (official issuer API, connected-identity
 * provider API, a direct verifier) are handled by the OSINT/verification
 * modules that call into this one, not here.
 */

import { agentReachResearchProvider, isAgentReachEnabled } from "@/lib/research/agent-reach-provider";
import { nativeResearchProvider } from "@/lib/research/native-provider";
import type { PublicResearchProvider, ResearchOutcome, ResearchQuery } from "@/lib/research/types";

export type { PublicResearchProvider, ResearchOutcome, ResearchQuery, ResearchResult, ResearchAuthorityLevel, ResearchSourceType } from "@/lib/research/types";
export { nativeResearchProvider } from "@/lib/research/native-provider";
export { agentReachResearchProvider, isAgentReachEnabled } from "@/lib/research/agent-reach-provider";

type ResearchMethod = Exclude<keyof PublicResearchProvider, "name" | "healthCheck">;

/**
 * Runs one research method with native-first, Agent-Reach-fallback
 * ordering. Never throws — an unavailable native connector with
 * Agent-Reach disabled (the default in this environment) simply returns
 * the native provider's own `{ ok: false, reason }`, exactly like every
 * other OSINT connector's failure mode.
 */
export async function runResearch(method: ResearchMethod, query: ResearchQuery): Promise<ResearchOutcome> {
  const nativeResult = await nativeResearchProvider[method](query);
  if (nativeResult.ok) return nativeResult;
  if (!isAgentReachEnabled()) return nativeResult;

  const agentReachResult = await agentReachResearchProvider[method](query);
  return agentReachResult.ok ? agentReachResult : nativeResult;
}
