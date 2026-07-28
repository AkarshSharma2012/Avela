import { describe, expect, it } from "vitest";

import { suggestMissingEvidence, type OpportunityEvidenceFlags } from "@/lib/applications/evidence-suggestions";

const UNKNOWN: OpportunityEvidenceFlags = { essay_required: null, recommendation_required: null, transcript_required: null };

describe("suggestMissingEvidence", () => {
  it("suggests nothing when every requirement is unknown (null)", () => {
    expect(suggestMissingEvidence(UNKNOWN, new Set())).toEqual([]);
  });

  it("never suggests for a requirement explicitly confirmed false", () => {
    const flags: OpportunityEvidenceFlags = { ...UNKNOWN, essay_required: false };
    expect(suggestMissingEvidence(flags, new Set())).toEqual([]);
  });

  it("suggests only for requirements explicitly known to be true", () => {
    const flags: OpportunityEvidenceFlags = { essay_required: true, recommendation_required: null, transcript_required: false };
    const suggestions = suggestMissingEvidence(flags, new Set());
    expect(suggestions).toEqual([{ purpose: "essay", label: expect.stringMatching(/^Suggested:/) }]);
  });

  it("never suggests a purpose that's already attached", () => {
    const flags: OpportunityEvidenceFlags = { essay_required: true, recommendation_required: true, transcript_required: null };
    const suggestions = suggestMissingEvidence(flags, new Set(["essay"]));
    expect(suggestions.map((s) => s.purpose)).toEqual(["recommendation"]);
  });

  it("every suggestion's label is explicitly marked as a suggestion, never phrased as a requirement", () => {
    const flags: OpportunityEvidenceFlags = { essay_required: true, recommendation_required: true, transcript_required: true };
    const suggestions = suggestMissingEvidence(flags, new Set());
    for (const suggestion of suggestions) {
      expect(suggestion.label).toMatch(/^Suggested:/);
      expect(suggestion.label).not.toMatch(/required|must|need to/i);
    }
  });
});
