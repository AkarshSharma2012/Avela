import { describe, expect, it } from "vitest";

import {
  detectCircularVerification,
  detectConnectDisconnectAroundVerification,
  detectDomainMismatchOrSuspicious,
  detectEditShortlyAfterConfirmation,
  detectForkHistoryCopied,
  detectNearIdenticalNarratives,
  detectRepeatedEvidenceHash,
  detectRequestVelocity,
  detectVerifierReusedAcrossStudents,
  detectVerifierScopeNarrowerThanClaim,
  highestRiskLevel,
} from "@/lib/integrity/signals";

describe("detectRepeatedEvidenceHash", () => {
  it("flags a hash shared across more than one distinct student", () => {
    const signals = detectRepeatedEvidenceHash([{ contentHash: "abc", distinctUserCount: 2 }]);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ signalType: "repeated_evidence_hash", riskLevel: "additional_evidence_recommended" });
  });

  it("never flags a hash used by only one student — that's a profile-strength concern, not an integrity signal", () => {
    expect(detectRepeatedEvidenceHash([{ contentHash: "abc", distinctUserCount: 1 }])).toEqual([]);
  });
});

describe("detectNearIdenticalNarratives", () => {
  it("flags two different items with near-identical narratives", () => {
    const signals = detectNearIdenticalNarratives([
      { itemId: "a", narrative: "Built a robot for the science fair with my team of five students." },
      { itemId: "b", narrative: "Built a robot for the science fair with my team of five students." },
    ]);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.details.itemIds).toEqual(["a", "b"]);
  });

  it("never flags genuinely different projects", () => {
    const signals = detectNearIdenticalNarratives([
      { itemId: "a", narrative: "Built a robot for the science fair." },
      { itemId: "b", narrative: "Painted a mural for the community center." },
    ]);
    expect(signals).toEqual([]);
  });

  it("skips items with no narrative at all rather than falsely matching two empty strings", () => {
    expect(detectNearIdenticalNarratives([{ itemId: "a", narrative: "" }, { itemId: "b", narrative: "" }])).toEqual([]);
  });
});

describe("detectVerifierReusedAcrossStudents", () => {
  it("does not flag a small number of students — a real teacher legitimately verifies several", () => {
    expect(detectVerifierReusedAcrossStudents(2)).toBeNull();
  });

  it("flags an unusually high distinct-student count as manual_review, never a rejection", () => {
    const signal = detectVerifierReusedAcrossStudents(10);
    expect(signal).toMatchObject({ signalType: "verifier_reused_across_students", riskLevel: "manual_review" });
  });
});

describe("detectCircularVerification", () => {
  it("produces one signal per pair, carrying the related student's id", () => {
    const signals = detectCircularVerification([{ studentAId: "a", studentBId: "b" }]);
    expect(signals[0]).toMatchObject({ signalType: "circular_student_verification", relatedUserId: "b", riskLevel: "manual_review" });
  });
});

describe("detectDomainMismatchOrSuspicious", () => {
  it("signals only the two most severe classifications", () => {
    expect(detectDomainMismatchOrSuspicious("domain_mismatch")).toMatchObject({ signalType: "domain_mismatch_or_suspicious" });
    expect(detectDomainMismatchOrSuspicious("suspicious_or_disposable")).toMatchObject({ riskLevel: "manual_review" });
  });

  it("never signals a merely unconfirmed or free-email classification", () => {
    expect(detectDomainMismatchOrSuspicious("organization_domain_unconfirmed")).toBeNull();
    expect(detectDomainMismatchOrSuspicious("personal_or_free_email")).toBeNull();
  });
});

describe("detectRequestVelocity", () => {
  it("flags only counters that actually hit their limit", () => {
    const signals = detectRequestVelocity([
      { bucket: "verification_request", count: 5, limit: 5 },
      { bucket: "osint_check", count: 2, limit: 10 },
    ]);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.details.bucket).toBe("verification_request");
  });
});

describe("detectEditShortlyAfterConfirmation", () => {
  it("flags an edit within the window after confirmation", () => {
    const signals = detectEditShortlyAfterConfirmation([{ confirmedAt: "2026-01-01T00:00:00Z", editedAt: "2026-01-01T00:30:00Z" }]);
    expect(signals).toHaveLength(1);
  });

  it("does not flag an edit long after confirmation", () => {
    const signals = detectEditShortlyAfterConfirmation([{ confirmedAt: "2026-01-01T00:00:00Z", editedAt: "2026-01-05T00:00:00Z" }]);
    expect(signals).toEqual([]);
  });
});

describe("detectConnectDisconnectAroundVerification", () => {
  it("flags a connect immediately followed by a disconnect", () => {
    const signals = detectConnectDisconnectAroundVerification([{ connectedAt: "2026-01-01T00:00:00Z", disconnectedAt: "2026-01-01T00:10:00Z" }]);
    expect(signals).toHaveLength(1);
  });
});

describe("detectForkHistoryCopied", () => {
  it("flags a fork claimed as sole creation with no independent ownership match", () => {
    const signals = detectForkHistoryCopied([{ isFork: true, hasOwnershipMatch: false, claimsSoleCreator: true }]);
    expect(signals).toHaveLength(1);
  });

  it("does not flag a fork where ownership is independently matched, or a non-fork repo", () => {
    expect(detectForkHistoryCopied([{ isFork: true, hasOwnershipMatch: true, claimsSoleCreator: true }])).toEqual([]);
    expect(detectForkHistoryCopied([{ isFork: false, hasOwnershipMatch: false, claimsSoleCreator: true }])).toEqual([]);
  });
});

describe("detectVerifierScopeNarrowerThanClaim", () => {
  it("does not flag a small gap between confirmed and displayed fields", () => {
    expect(detectVerifierScopeNarrowerThanClaim(4, 5)).toBeNull();
  });

  it("flags a large gap", () => {
    expect(detectVerifierScopeNarrowerThanClaim(1, 5)).toMatchObject({ signalType: "verifier_scope_narrower_than_claim" });
  });
});

describe("highestRiskLevel", () => {
  it("returns normal for an empty batch", () => {
    expect(highestRiskLevel([])).toBe("normal");
  });

  it("returns the most severe level present", () => {
    const signals = [
      { signalType: "request_velocity" as const, riskLevel: "additional_evidence_recommended" as const, details: {} },
      { signalType: "verifier_reused_across_students" as const, riskLevel: "manual_review" as const, details: {} },
    ];
    expect(highestRiskLevel(signals)).toBe("manual_review");
  });
});
