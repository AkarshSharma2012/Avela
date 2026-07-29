import { describe, expect, it } from "vitest";

import {
  buildInternalEntryNarrative,
  resolveEntryNarrative,
  validateEntryNarrativeInput,
  type EntryNarrativeInput,
} from "@/lib/portfolio/entry-narrative";

const VALID: EntryNarrativeInput = {
  whatYouDid: "Built a go-kart from scratch.",
  whyYouDidIt: "I wanted to learn how engines work.",
  yourPart: "I designed, welded, and wired the whole thing myself.",
};

describe("validateEntryNarrativeInput", () => {
  it("accepts three short required answers with no optional fields", () => {
    expect(validateEntryNarrativeInput(VALID)).toEqual({ valid: true });
  });

  it("rejects an empty or whitespace-only required field", () => {
    expect(validateEntryNarrativeInput({ ...VALID, whatYouDid: "" })).toMatchObject({ valid: false });
    expect(validateEntryNarrativeInput({ ...VALID, yourPart: "   " })).toMatchObject({ valid: false });
  });

  it("rejects a required answer that's unreasonably long rather than rewarding length", () => {
    expect(validateEntryNarrativeInput({ ...VALID, whyYouDidIt: "a".repeat(700) })).toMatchObject({ valid: false });
  });

  it("accepts all seven optional fields when present and short", () => {
    expect(
      validateEntryNarrativeInput({
        ...VALID,
        whoItHelped: "My family",
        materialsOrTools: "Welder, old lawnmower engine",
        collaborators: "My dad helped with the frame",
        challenges: "Getting the steering to align",
        result: "It runs and drives well",
        whatYouLearned: "Basic welding and engine timing",
        wouldImprove: "Better brakes next time",
      })
    ).toEqual({ valid: true });
  });

  it("rejects an optional field only when far too long", () => {
    expect(validateEntryNarrativeInput({ ...VALID, whoItHelped: "a".repeat(500) })).toMatchObject({ valid: false });
  });
});

describe("buildInternalEntryNarrative", () => {
  it("joins only the answers actually provided", () => {
    const narrative = buildInternalEntryNarrative(VALID);
    expect(narrative).toContain("go-kart");
    expect(narrative).toContain("welded");
  });

  it("skips blank optional fields rather than inserting filler", () => {
    const narrative = buildInternalEntryNarrative({ ...VALID, result: "  " });
    expect(narrative.split("  ").length).toBe(1);
  });
});

describe("resolveEntryNarrative", () => {
  it("prefers the universal entry_narrative row when present", () => {
    const resolved = resolveEntryNarrative(
      { what_you_did: "New flow", why_you_did_it: "Reason", your_part: "All of it" },
      { what_you_made: "Old flow", why_you_made_it: "Old reason", your_part: "Some of it" }
    );
    expect(resolved).toMatchObject({ whatYouDid: "New flow", source: "entry_narrative" });
  });

  it("falls back to personal_project_details for pre-Milestone-10.8 items", () => {
    const resolved = resolveEntryNarrative(null, {
      what_you_made: "A wooden bookshelf",
      why_you_made_it: "Needed storage",
      your_part: "Built it solo",
    });
    expect(resolved).toMatchObject({ whatYouDid: "A wooden bookshelf", source: "personal_project_details" });
  });

  it("returns null when neither source has a row for this item", () => {
    expect(resolveEntryNarrative(null, null)).toBeNull();
  });
});
