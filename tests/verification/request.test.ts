import { describe, expect, it } from "vitest";

import {
  canStartNewRequest,
  checkRequestEligibility,
  checkResendEligibility,
  deriveRequestStatus,
  isSelfVerification,
  looksDisposableEmail,
  validateConsent,
} from "@/lib/verification/request";

describe("deriveRequestStatus", () => {
  const base = { requestedAt: null, verifiedAt: null, expiresAt: null, verificationLevel: "unverified" as const, metadata: {} };

  it("is not_requested when nothing has ever been requested", () => {
    expect(deriveRequestStatus(base)).toBe("not_requested");
  });

  it("is cancelled when the student cancelled it, even if it hasn't expired", () => {
    expect(
      deriveRequestStatus({ ...base, requestedAt: "2026-01-01T00:00:00Z", metadata: { cancelled_at: "2026-01-02T00:00:00Z" } })
    ).toBe("cancelled");
  });

  it("is declined when the verifier declined it", () => {
    expect(
      deriveRequestStatus({ ...base, requestedAt: "2026-01-01T00:00:00Z", metadata: { declined_at: "2026-01-02T00:00:00Z" } })
    ).toBe("declined");
  });

  it("is confirmed once the level is externally_confirmed and verified_at is set", () => {
    expect(
      deriveRequestStatus({
        ...base,
        requestedAt: "2026-01-01T00:00:00Z",
        verifiedAt: "2026-01-02T00:00:00Z",
        verificationLevel: "externally_confirmed",
      })
    ).toBe("confirmed");
  });

  it("is expired once past the expiry, absent any other terminal state", () => {
    expect(
      deriveRequestStatus(
        { ...base, requestedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-10T00:00:00Z" },
        new Date("2026-02-01T00:00:00Z")
      )
    ).toBe("expired");
  });

  it("is pending while requested, not yet expired, and no terminal state has fired", () => {
    expect(
      deriveRequestStatus(
        { ...base, requestedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-10T00:00:00Z" },
        new Date("2026-01-02T00:00:00Z")
      )
    ).toBe("pending");
  });
});

describe("canStartNewRequest / duplicate prevention", () => {
  it("only blocks starting a new request while one is pending", () => {
    expect(canStartNewRequest("pending")).toBe(false);
    for (const status of ["not_requested", "confirmed", "declined", "expired", "cancelled"] as const) {
      expect(canStartNewRequest(status)).toBe(true);
    }
  });
});

describe("validateConsent", () => {
  it("requires explicit consent before a request can be sent", () => {
    expect(validateConsent(false)).not.toBeNull();
    expect(validateConsent(true)).toBeNull();
  });
});

describe("isSelfVerification", () => {
  it("blocks a verifier email matching the student's own, case-insensitively", () => {
    expect(isSelfVerification("Student@Example.com", "student@example.com")).toBe(true);
    expect(isSelfVerification("teacher@example.com", "student@example.com")).toBe(false);
  });
});

describe("looksDisposableEmail", () => {
  it("flags a known disposable-email domain", () => {
    expect(looksDisposableEmail("someone@mailinator.com")).toBe(true);
  });

  it("does not flag an ordinary email", () => {
    expect(looksDisposableEmail("teacher@lincolnhigh.edu")).toBe(false);
  });
});

describe("checkRequestEligibility", () => {
  const validInput = { currentStatus: "not_requested" as const, consentGiven: true, verifierEmail: "teacher@school.edu", studentEmail: "student@example.com" };

  it("allows a well-formed, consented, non-duplicate request", () => {
    expect(checkRequestEligibility(validInput)).toEqual({ allowed: true });
  });

  it("blocks a duplicate active request", () => {
    const result = checkRequestEligibility({ ...validInput, currentStatus: "pending" });
    expect(result.allowed).toBe(false);
  });

  it("blocks without consent", () => {
    const result = checkRequestEligibility({ ...validInput, consentGiven: false });
    expect(result.allowed).toBe(false);
  });

  it("blocks a verifier email equal to the student's own", () => {
    const result = checkRequestEligibility({ ...validInput, verifierEmail: "student@example.com" });
    expect(result.allowed).toBe(false);
  });

  it("blocks an obviously disposable verifier email", () => {
    const result = checkRequestEligibility({ ...validInput, verifierEmail: "someone@mailinator.com" });
    expect(result.allowed).toBe(false);
  });
});

describe("checkResendEligibility — cooldown and resend cap", () => {
  it("allows a first resend with no prior history", () => {
    expect(checkResendEligibility({ resendCount: 0, lastSentAt: null })).toEqual({ allowed: true });
  });

  it("blocks a resend within the cooldown window", () => {
    const result = checkResendEligibility({ resendCount: 0, lastSentAt: "2026-01-01T00:00:00Z" }, new Date("2026-01-01T01:00:00Z"));
    expect(result.allowed).toBe(false);
  });

  it("allows a resend once the cooldown has elapsed", () => {
    const result = checkResendEligibility({ resendCount: 0, lastSentAt: "2026-01-01T00:00:00Z" }, new Date("2026-01-02T01:00:00Z"));
    expect(result.allowed).toBe(true);
  });

  it("blocks once the resend cap is reached, regardless of cooldown", () => {
    const result = checkResendEligibility({ resendCount: 3, lastSentAt: null });
    expect(result.allowed).toBe(false);
  });
});
