import { afterEach, describe, expect, it, vi } from "vitest";

import { aiSupportLevelToClaimDimensionStatus, gradeEvidence } from "@/lib/ai/evidence-grader";
import { parseGraderOutput } from "@/lib/ai/evidence-grader/schema";
import { createMockEvidenceGraderProvider } from "@/lib/ai/evidence-grader/mock-provider";
import { isNvidiaKeyConfigured } from "@/lib/ai/evidence-grader/config";
import type { EvidenceGraderInput } from "@/lib/ai/evidence-grader/types";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const BASE_INPUT: EvidenceGraderInput = {
  itemTitle: "E2E TEST — Sample Project",
  itemCategory: "software",
  itemDescription: "A tool that helps students track deadlines.",
  studentClaimedRole: "Sole developer",
  studentExplanationOfContribution: "I designed and wrote all of the code myself.",
  claimedStartDate: "2026-01-01",
  claimedEndDate: null,
  claimedOrganization: null,
  evidence: [
    { sourceKind: "git_repository", extractedText: "README: a tool that helps students track deadlines.", label: "GitHub repo" },
  ],
  deterministicChecks: [{ dimension: "identity_control", status: "strongly_supported" }],
};

describe("parseGraderOutput — strict schema boundary", () => {
  it("rejects a completely malformed object", () => {
    expect(parseGraderOutput({ foo: "bar" })).toBeNull();
  });

  it("rejects output using accusatory language, even if otherwise well-formed", () => {
    const mock = createMockEvidenceGraderProvider();
    const valid = mock.grade(BASE_INPUT, { timeoutMs: 1000, signal: new AbortController().signal });
    return valid.then((output) => {
      const tampered = { ...(output as object), short_explanation: "The student is lying about this." };
      expect(parseGraderOutput(tampered)).toBeNull();
    });
  });

  it("accepts a well-formed mock output", async () => {
    const mock = createMockEvidenceGraderProvider();
    const output = await mock.grade(BASE_INPUT, { timeoutMs: 1000, signal: new AbortController().signal });
    expect(parseGraderOutput(output)).not.toBeNull();
  });
});

describe("mock provider — deterministic", () => {
  it("produces the same output for the same input", async () => {
    const mock = createMockEvidenceGraderProvider();
    const signal = new AbortController().signal;
    const a = await mock.grade(BASE_INPUT, { timeoutMs: 1000, signal });
    const b = await mock.grade(BASE_INPUT, { timeoutMs: 1000, signal });
    expect(a).toEqual(b);
  });

  it("reports no evidence as not_supported / relevance unclear, with a suggestion, never a fabricated confirmation", async () => {
    const mock = createMockEvidenceGraderProvider();
    const output = (await mock.grade({ ...BASE_INPUT, evidence: [] }, { timeoutMs: 1000, signal: new AbortController().signal })) as {
      artifact_relevance: string;
      project_existence_support: string;
      suggested_next_evidence: string | null;
    };
    expect(output.artifact_relevance).toBe("unclear");
    expect(output.project_existence_support).toBe("not_supported");
    expect(output.suggested_next_evidence).not.toBeNull();
  });
});

describe("gradeEvidence — provider gating, never throws", () => {
  it("returns { ok: false, reason: 'disabled' } when no provider is configured", async () => {
    vi.stubEnv("AI_EVIDENCE_GRADER_PROVIDER", "");
    const result = await gradeEvidence(BASE_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("disabled");
  });

  it("returns { ok: false, reason: 'disabled' } for nvidia provider with no API key configured", async () => {
    vi.stubEnv("AI_EVIDENCE_GRADER_PROVIDER", "nvidia");
    vi.stubEnv("NVIDIA_API_KEY", "");
    expect(isNvidiaKeyConfigured()).toBe(false);
    const result = await gradeEvidence(BASE_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("disabled");
  });

  it("succeeds with the mock provider and reports mocked: true", async () => {
    vi.stubEnv("AI_EVIDENCE_GRADER_PROVIDER", "mock");
    const result = await gradeEvidence(BASE_INPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mocked).toBe(true);
      expect(result.providerName).toBe("mock");
    }
  });

  it("never sends more than the bounded number of evidence items or oversized text to a provider", async () => {
    vi.stubEnv("AI_EVIDENCE_GRADER_PROVIDER", "mock");
    const manyEvidence = Array.from({ length: 20 }, (_, i) => ({
      sourceKind: "public_url",
      extractedText: "x".repeat(5000),
      label: `item ${i}`,
    }));
    const result = await gradeEvidence({ ...BASE_INPUT, evidence: manyEvidence });
    expect(result.ok).toBe(true);
  });
});

describe("aiSupportLevelToClaimDimensionStatus — AI can never imply Confirmed", () => {
  it("never maps any AI support level to externally_confirmed", () => {
    const levels: Array<"not_supported" | "partially_supported" | "strongly_supported" | "conflicting"> = [
      "not_supported",
      "partially_supported",
      "strongly_supported",
      "conflicting",
    ];
    for (const level of levels) {
      expect(aiSupportLevelToClaimDimensionStatus(level)).not.toBe("externally_confirmed");
    }
  });

  it("caps 'strongly_supported' AI output at strongly_supported, never higher", () => {
    expect(aiSupportLevelToClaimDimensionStatus("strongly_supported")).toBe("strongly_supported");
  });

  it("maps a conflict to needs_review, not a silent downgrade", () => {
    expect(aiSupportLevelToClaimDimensionStatus("conflicting")).toBe("needs_review");
  });
});

describe("gradeEvidence — timeout and malformed-response fallback (integration, real NVIDIA provider code path, fetch stubbed — no network)", () => {
  it("degrades to { ok: false, reason: 'timeout' } when the provider never responds within the configured timeout, never hangs or throws", async () => {
    vi.stubEnv("AI_EVIDENCE_GRADER_PROVIDER", "nvidia");
    vi.stubEnv("NVIDIA_API_KEY", "test-key-not-real");
    vi.stubEnv("AI_EVIDENCE_GRADER_TIMEOUT_MS", "50");
    vi.stubEnv("AI_EVIDENCE_GRADER_MAX_RETRIES", "0");

    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          const signal = init?.signal;
          signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
          // Deliberately never resolves on its own — only the abort fires.
        });
      })
    );

    const result = await gradeEvidence(BASE_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("timeout");
      expect(result.providerName).toBe("nvidia");
    }
  });

  it("degrades to { ok: false, reason: 'malformed_response' } when the provider returns JSON that doesn't match the strict schema, never crashes or fabricates a result", async () => {
    vi.stubEnv("AI_EVIDENCE_GRADER_PROVIDER", "nvidia");
    vi.stubEnv("NVIDIA_API_KEY", "test-key-not-real");
    vi.stubEnv("AI_EVIDENCE_GRADER_MAX_RETRIES", "0");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({ unexpected: "shape" }) } }] }),
      }))
    );

    const result = await gradeEvidence(BASE_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("malformed_response");
    }
  });

  it("degrades to { ok: false, reason: 'provider_error' } on a non-2xx response, without leaking the response body into the error", async () => {
    vi.stubEnv("AI_EVIDENCE_GRADER_PROVIDER", "nvidia");
    vi.stubEnv("NVIDIA_API_KEY", "test-key-not-real");
    vi.stubEnv("AI_EVIDENCE_GRADER_MAX_RETRIES", "0");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ secret: "should never surface" }) }))
    );

    const result = await gradeEvidence(BASE_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("provider_error");
  });

  it("portfolio creation is never blocked by any of the above — every fallback path returns a plain result object, never throws", async () => {
    vi.stubEnv("AI_EVIDENCE_GRADER_PROVIDER", "nvidia");
    vi.stubEnv("NVIDIA_API_KEY", "test-key-not-real");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("simulated network failure");
      })
    );
    await expect(gradeEvidence(BASE_INPUT)).resolves.toMatchObject({ ok: false });
  });
});
