import { describe, expect, it } from "vitest";

import { MAX_PORTFOLIO_FILE_SIZE_BYTES } from "@/lib/portfolio/constants";
import {
  buildPortfolioStoragePath,
  isAllowedPortfolioMimeType,
  sanitizeOriginalFilename,
  validatePortfolioFileSize,
  validatePortfolioFileType,
} from "@/lib/portfolio/storage";

describe("isAllowedPortfolioMimeType / validatePortfolioFileType", () => {
  it("accepts the four allowed types", () => {
    expect(isAllowedPortfolioMimeType("application/pdf")).toBe(true);
    expect(isAllowedPortfolioMimeType("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(true);
    expect(isAllowedPortfolioMimeType("image/png")).toBe(true);
    expect(isAllowedPortfolioMimeType("image/jpeg")).toBe(true);
  });

  it("rejects an executable or otherwise unsupported type", () => {
    expect(isAllowedPortfolioMimeType("application/x-msdownload")).toBe(false);
    expect(isAllowedPortfolioMimeType("application/octet-stream")).toBe(false);
    expect(isAllowedPortfolioMimeType("text/html")).toBe(false);
    expect(validatePortfolioFileType("application/x-sh")).toMatch(/isn't supported/i);
  });

  it("rejects a client-claimed MIME type it doesn't recognize, never trusting it blindly", () => {
    expect(validatePortfolioFileType("application/pdf;spoofed")).toMatch(/isn't supported/i);
  });
});

describe("validatePortfolioFileSize", () => {
  it("accepts a file within the limit", () => {
    expect(validatePortfolioFileSize(1024)).toBeNull();
    expect(validatePortfolioFileSize(MAX_PORTFOLIO_FILE_SIZE_BYTES)).toBeNull();
  });

  it("rejects an empty or invalid size", () => {
    expect(validatePortfolioFileSize(0)).toMatch(/empty or invalid/i);
    expect(validatePortfolioFileSize(-5)).toMatch(/empty or invalid/i);
    expect(validatePortfolioFileSize(Number.NaN)).toMatch(/empty or invalid/i);
  });

  it("rejects a file over the configurable limit", () => {
    expect(validatePortfolioFileSize(MAX_PORTFOLIO_FILE_SIZE_BYTES + 1)).toMatch(/too large/i);
  });
});

describe("sanitizeOriginalFilename", () => {
  it("replaces path separators so a filename can never inject extra path segments", () => {
    expect(sanitizeOriginalFilename("../../etc/passwd")).toBe(".._.._etc_passwd");
    expect(sanitizeOriginalFilename("a\\b\\c.pdf")).toBe("a_b_c.pdf");
  });

  it("strips control characters", () => {
    const withControlChars = `resume${String.fromCharCode(0)}${String.fromCharCode(31)}.pdf`;
    expect(sanitizeOriginalFilename(withControlChars)).toBe("resume.pdf");
  });

  it("falls back to a safe default when nothing printable remains", () => {
    expect(sanitizeOriginalFilename("   ")).toBe("file");
  });

  it("caps filename length", () => {
    const long = "a".repeat(300) + ".pdf";
    expect(sanitizeOriginalFilename(long).length).toBeLessThanOrEqual(150);
  });

  it("leaves an ordinary filename unchanged", () => {
    expect(sanitizeOriginalFilename("My Resume (2026).pdf")).toBe("My Resume (2026).pdf");
  });
});

describe("buildPortfolioStoragePath", () => {
  it("always starts with the user id as the first path segment — what the storage RLS policy trusts", () => {
    const path = buildPortfolioStoragePath("user-123", "item-456", "application/pdf", () => "random-id");
    expect(path).toBe("user-123/item-456/random-id.pdf");
    expect(path.split("/")[0]).toBe("user-123");
  });

  it("uses 'unfiled' when there's no portfolio item yet", () => {
    const path = buildPortfolioStoragePath("user-123", null, "image/png", () => "random-id");
    expect(path).toBe("user-123/unfiled/random-id.png");
  });

  it("never incorporates the original filename — the random id is the only thing after the item segment, closing off path traversal via a crafted filename", () => {
    const maliciousItemId = "item-456"; // item id always comes from a real DB row id, never client-controlled path text
    const path = buildPortfolioStoragePath("user-123", maliciousItemId, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", () => "abc123");
    expect(path).toBe("user-123/item-456/abc123.docx");
    expect(path).not.toContain("..");
  });

  it("maps every allowed MIME type to its own extension", () => {
    expect(buildPortfolioStoragePath("u", null, "application/pdf", () => "x")).toBe("u/unfiled/x.pdf");
    expect(buildPortfolioStoragePath("u", null, "image/jpeg", () => "x")).toBe("u/unfiled/x.jpg");
  });
});
