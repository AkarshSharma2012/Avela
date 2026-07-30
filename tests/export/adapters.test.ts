import { describe, expect, it } from "vitest";

import { buildExportFilename } from "@/lib/export/filename";
import { evidenceIndexAdapter } from "@/lib/export/evidence-index-adapter";
import { textSummaryAdapter } from "@/lib/export/text-summary-adapter";
import type { ExportBundle } from "@/lib/export/types";

const BUNDLE: ExportBundle = {
  studentDisplayName: "E2E TEST — Student",
  title: "E2E TEST — Review",
  items: [
    {
      title: "E2E TEST — Sample Project",
      organization: "Sample Org",
      description: "A sample project.",
      claimSupportHeadline: "Strong",
      evidence: [{ filename: "repo.png", label: "GitHub repository" }],
    },
    {
      title: "E2E TEST — No Evidence Item",
      organization: null,
      description: null,
      claimSupportHeadline: "Not yet supported",
      evidence: [],
    },
  ],
};

describe("buildExportFilename — never includes internal ids", () => {
  it("produces a lowercase, hyphenated filename", () => {
    expect(buildExportFilename("My Cool Project!", "project-overview", "txt")).toBe("my-cool-project_project-overview.txt");
  });

  it("is deterministic for the same input", () => {
    const a = buildExportFilename("Same Title", "evidence-index", "txt");
    const b = buildExportFilename("Same Title", "evidence-index", "txt");
    expect(a).toBe(b);
  });

  it("never contains a uuid-shaped internal id even if one leaks into the subject", () => {
    const filename = buildExportFilename("abc123-4567-89ab-cdef-000000000000", "project-overview", "txt");
    expect(filename).not.toMatch(/^[0-9a-f-]{36}_/);
  });

  it("falls back to 'untitled' for an empty/unusable subject", () => {
    expect(buildExportFilename("!!!", "project-overview", "txt")).toBe("untitled_project-overview.txt");
  });
});

describe("textSummaryAdapter", () => {
  it("includes every item's title, org, description, and claim support headline", () => {
    const text = textSummaryAdapter.generate(BUNDLE);
    expect(text).toContain("E2E TEST — Sample Project");
    expect(text).toContain("Sample Org");
    expect(text).toContain("A sample project.");
    expect(text).toContain("Strong");
    expect(text).toContain("Not yet supported");
  });

  it("never includes a headline percentage", () => {
    const text = textSummaryAdapter.generate(BUNDLE);
    expect(text).not.toMatch(/\d+%/);
  });
});

describe("evidenceIndexAdapter", () => {
  it("lists evidence only for items that have any", () => {
    const text = evidenceIndexAdapter.generate(BUNDLE);
    expect(text).toContain("GitHub repository");
    expect(text.indexOf("E2E TEST — No Evidence Item")).toBe(-1);
  });

  it("says so honestly when nothing has any evidence", () => {
    const empty: ExportBundle = { ...BUNDLE, items: [{ ...BUNDLE.items[1]! }] };
    const text = evidenceIndexAdapter.generate(empty);
    expect(text).toContain("No evidence was included");
  });
});
