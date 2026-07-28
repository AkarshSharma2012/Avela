import { describe, expect, it } from "vitest";

import {
  checkDatesConsistent,
  checkDuplicateEvidenceReuse,
  checkEvidenceExists,
  checkEvidenceExpired,
  checkFilenameSafe,
  checkFileReadable,
  checkFileTypeAllowed,
  checkOrganizationConsistent,
  checkUrlHttps,
  runEvidenceChecks,
} from "@/lib/verification/evidence-checks";
import { containsForbiddenLanguage } from "@/lib/verification/messages";

describe("checkEvidenceExists", () => {
  it("flags missing evidence, never says the claim is false", () => {
    const finding = checkEvidenceExists(false);
    expect(finding?.code).toBe("no_evidence");
    expect(containsForbiddenLanguage(finding!.message)).toBe(false);
  });

  it("passes when evidence exists", () => {
    expect(checkEvidenceExists(true)).toBeNull();
  });
});

describe("checkFileTypeAllowed", () => {
  it("allows every type from the portfolio allowlist", () => {
    expect(checkFileTypeAllowed("application/pdf")).toBeNull();
    expect(checkFileTypeAllowed("image/png")).toBeNull();
  });

  it("rejects a disallowed type", () => {
    expect(checkFileTypeAllowed("application/x-msdownload")?.code).toBe("file_type_not_allowed");
  });

  it("skips the check entirely when no file is involved (e.g. URL evidence)", () => {
    expect(checkFileTypeAllowed(null)).toBeNull();
  });
});

describe("checkFileReadable", () => {
  it("flags an unreadable file", () => {
    expect(checkFileReadable(false)?.code).toBe("file_unreadable");
  });
});

describe("checkFilenameSafe", () => {
  it("rejects path traversal and separators", () => {
    expect(checkFilenameSafe("../../etc/passwd")?.code).toBe("filename_unsafe");
    expect(checkFilenameSafe("folder/file.pdf")?.code).toBe("filename_unsafe");
    expect(checkFilenameSafe("folder\\file.pdf")?.code).toBe("filename_unsafe");
  });

  it("rejects control characters and null bytes", () => {
    expect(checkFilenameSafe("resume\x00.pdf")?.code).toBe("filename_unsafe");
  });

  it("rejects an empty or excessively long name", () => {
    expect(checkFilenameSafe("")?.code).toBe("filename_unsafe");
    expect(checkFilenameSafe("a".repeat(300))?.code).toBe("filename_unsafe");
  });

  it("allows an ordinary filename", () => {
    expect(checkFilenameSafe("award-certificate.pdf")).toBeNull();
  });
});

describe("checkDatesConsistent", () => {
  it("passes when the evidence date falls within the item's range", () => {
    expect(checkDatesConsistent("2026-01-01", "2026-06-01", "2026-03-15")).toBeNull();
  });

  it("passes within the tolerance window just outside the range", () => {
    expect(checkDatesConsistent("2026-01-01", "2026-06-01", "2026-06-20")).toBeNull();
  });

  it("flags a date clearly outside the item's range — a consistency finding, never a truth claim", () => {
    const finding = checkDatesConsistent("2026-01-01", "2026-06-01", "2024-01-01");
    expect(finding?.code).toBe("date_mismatch");
    expect(containsForbiddenLanguage(finding!.message)).toBe(false);
  });

  it("skips the check when either side is unknown", () => {
    expect(checkDatesConsistent(null, null, "2026-01-01")).toBeNull();
    expect(checkDatesConsistent("2026-01-01", "2026-06-01", null)).toBeNull();
  });
});

describe("checkOrganizationConsistent", () => {
  it("passes for an exact match", () => {
    expect(checkOrganizationConsistent("Lincoln High School", "Lincoln High School")).toBeNull();
  });

  it("passes for a loose/abbreviated match", () => {
    expect(checkOrganizationConsistent("Lincoln High School Robotics Club", "Lincoln High School")).toBeNull();
  });

  it("flags a clearly different organization", () => {
    expect(checkOrganizationConsistent("Lincoln High School", "Acme Corporation")?.code).toBe("organization_mismatch");
  });

  it("skips the check when either side is unknown", () => {
    expect(checkOrganizationConsistent(null, "Acme Corporation")).toBeNull();
  });
});

describe("checkUrlHttps", () => {
  it("passes for https", () => {
    expect(checkUrlHttps("https://example.org")).toBeNull();
  });

  it("flags http and malformed URLs", () => {
    expect(checkUrlHttps("http://example.org")?.code).toBe("url_not_https");
    expect(checkUrlHttps("not a url")?.code).toBe("url_not_https");
  });
});

describe("checkEvidenceExpired", () => {
  it("flags evidence past its own expiration date — 'appears expired,' never 'forged'", () => {
    const finding = checkEvidenceExpired("2020-01-01", new Date("2026-01-01"));
    expect(finding?.code).toBe("evidence_expired");
    expect(finding?.message).toMatch(/appears expired/i);
  });

  it("passes for evidence not yet expired, or with no expiration at all", () => {
    expect(checkEvidenceExpired("2030-01-01", new Date("2026-01-01"))).toBeNull();
    expect(checkEvidenceExpired(null)).toBeNull();
  });
});

describe("checkDuplicateEvidenceReuse", () => {
  it("is only ever a warning, never blocking", () => {
    expect(checkDuplicateEvidenceReuse(true)?.severity).toBe("warning");
  });
});

describe("runEvidenceChecks — aggregate recommendation", () => {
  it("recommends evidence_added when nothing is wrong", () => {
    const result = runEvidenceChecks({ hasEvidence: true, itemType: "award", fileMimeType: "application/pdf" });
    expect(result.recommendedLevel).toBe("evidence_added");
    expect(result.findings).toEqual([]);
  });

  it("recommends needs_review the moment any blocking finding fires", () => {
    const result = runEvidenceChecks({
      hasEvidence: true,
      itemType: "award",
      portfolioOrganization: "Lincoln High School",
      evidenceOrganization: "Some Other Org",
    });
    expect(result.recommendedLevel).toBe("needs_review");
    expect(result.findings.some((f) => f.code === "organization_mismatch")).toBe(true);
  });

  it("a warning-only finding (duplicate reuse) does not push the recommendation to needs_review", () => {
    const result = runEvidenceChecks({ hasEvidence: true, itemType: "award", isReusedOnUnrelatedItem: true });
    expect(result.recommendedLevel).toBe("evidence_added");
    expect(result.findings.some((f) => f.code === "duplicate_evidence_reused")).toBe(true);
  });

  it("every message in every finding avoids forbidden language", () => {
    const result = runEvidenceChecks({
      hasEvidence: false,
      itemType: "award",
      fileMimeType: "application/x-msdownload",
      fileReadable: false,
      originalFilename: "../evil.pdf",
      evidenceUrl: "http://insecure.example",
      portfolioOrganization: "A",
      evidenceOrganization: "Completely Different Org",
      evidenceExpiresAt: "2020-01-01",
      isReusedOnUnrelatedItem: true,
      now: new Date("2026-01-01"),
    });
    expect(result.findings.length).toBeGreaterThan(0);
    for (const finding of result.findings) {
      expect(containsForbiddenLanguage(finding.message)).toBe(false);
    }
  });
});
