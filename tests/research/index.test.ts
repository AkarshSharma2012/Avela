import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/research/native-provider", () => ({
  nativeResearchProvider: { readPublicPage: vi.fn(), searchWeb: vi.fn() },
}));
vi.mock("@/lib/research/agent-reach-provider", () => ({
  agentReachResearchProvider: { readPublicPage: vi.fn(), searchWeb: vi.fn() },
  isAgentReachEnabled: vi.fn(() => false),
}));

import { agentReachResearchProvider, isAgentReachEnabled } from "@/lib/research/agent-reach-provider";
import { nativeResearchProvider } from "@/lib/research/native-provider";
import { runResearch } from "@/lib/research/index";

const mockNative = vi.mocked(nativeResearchProvider.readPublicPage);
const mockAgentReach = vi.mocked(agentReachResearchProvider.readPublicPage);
const mockIsEnabled = vi.mocked(isAgentReachEnabled);

afterEach(() => {
  vi.clearAllMocks();
  mockIsEnabled.mockReturnValue(false);
});

describe("runResearch — native-first, Agent-Reach-fallback ordering", () => {
  it("returns the native result directly when it succeeds — Agent-Reach is never even consulted", async () => {
    mockNative.mockResolvedValueOnce({ ok: true, results: [] });
    const result = await runResearch("readPublicPage", {});
    expect(result).toEqual({ ok: true, results: [] });
    expect(mockAgentReach).not.toHaveBeenCalled();
  });

  it("returns the native failure as-is when native fails and Agent-Reach is disabled (the default)", async () => {
    mockNative.mockResolvedValueOnce({ ok: false, reason: "native failed" });
    const result = await runResearch("readPublicPage", {});
    expect(result).toEqual({ ok: false, reason: "native failed" });
    expect(mockAgentReach).not.toHaveBeenCalled();
  });

  it("falls back to Agent-Reach only when native fails AND Agent-Reach is explicitly enabled", async () => {
    mockIsEnabled.mockReturnValue(true);
    mockNative.mockResolvedValueOnce({ ok: false, reason: "native failed" });
    mockAgentReach.mockResolvedValueOnce({ ok: true, results: [] });
    const result = await runResearch("readPublicPage", {});
    expect(result).toEqual({ ok: true, results: [] });
    expect(mockAgentReach).toHaveBeenCalledOnce();
  });

  it("returns the native failure when both native and the enabled Agent-Reach fallback fail — never blocks or throws", async () => {
    mockIsEnabled.mockReturnValue(true);
    mockNative.mockResolvedValueOnce({ ok: false, reason: "native failed" });
    mockAgentReach.mockResolvedValueOnce({ ok: false, reason: "agent-reach failed" });
    const result = await runResearch("readPublicPage", {});
    expect(result).toEqual({ ok: false, reason: "native failed" });
  });
});
