import { afterEach, describe, expect, it } from "vitest";

import { agentReachResearchProvider, isAgentReachEnabled } from "@/lib/research/agent-reach-provider";

afterEach(() => {
  delete process.env.AGENT_REACH_ENABLED;
});

describe("isAgentReachEnabled", () => {
  it("is disabled by default — no real Agent-Reach integration exists in this environment", () => {
    expect(isAgentReachEnabled()).toBe(false);
  });

  it("is enabled only by the exact string 'true'", () => {
    process.env.AGENT_REACH_ENABLED = "1";
    expect(isAgentReachEnabled()).toBe(false);
    process.env.AGENT_REACH_ENABLED = "true";
    expect(isAgentReachEnabled()).toBe(true);
  });
});

describe("agentReachResearchProvider — every method is inert", () => {
  it("healthCheck reports unavailable whether or not the flag is set", async () => {
    expect(await agentReachResearchProvider.healthCheck()).toMatchObject({ ok: false });
    process.env.AGENT_REACH_ENABLED = "true";
    expect(await agentReachResearchProvider.healthCheck()).toMatchObject({ ok: false });
  });

  it.each([
    "searchWeb",
    "readPublicPage",
    "inspectGitHubRepository",
    "inspectPublicVideoMetadata",
    "inspectRssFeed",
    "inspectPublicDiscussion",
  ] as const)("%s never succeeds — no real integration exists to attempt", async (method) => {
    const result = await agentReachResearchProvider[method]({});
    expect(result.ok).toBe(false);
  });
});
