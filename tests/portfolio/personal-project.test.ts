import { describe, expect, it } from "vitest";

import { buildInternalNarrative, validatePersonalProjectInput, type PersonalProjectInput } from "@/lib/portfolio/personal-project";

const VALID: PersonalProjectInput = {
  whatYouMade: "A wooden bookshelf.",
  whyYouMadeIt: "My room needed more storage.",
  yourPart: "I designed and built the whole thing myself.",
};

describe("validatePersonalProjectInput", () => {
  it("accepts three short one-sentence required answers with no optional fields at all", () => {
    expect(validatePersonalProjectInput(VALID)).toEqual({ valid: true });
  });

  it("rejects an empty or whitespace-only required field — never rewards or requires length beyond that", () => {
    expect(validatePersonalProjectInput({ ...VALID, whatYouMade: "" })).toMatchObject({ valid: false });
    expect(validatePersonalProjectInput({ ...VALID, yourPart: "   " })).toMatchObject({ valid: false });
  });

  it("rejects a required answer that's unreasonably long rather than rewarding length", () => {
    const tooLong = "a".repeat(700);
    expect(validatePersonalProjectInput({ ...VALID, whyYouMadeIt: tooLong })).toMatchObject({ valid: false });
  });

  it("accepts optional fields when present and rejects them only when far too long", () => {
    expect(validatePersonalProjectInput({ ...VALID, result: "It looks great and holds all my books." })).toEqual({ valid: true });
    expect(validatePersonalProjectInput({ ...VALID, madeFor: "a".repeat(500) })).toMatchObject({ valid: false });
  });
});

describe("buildInternalNarrative", () => {
  it("joins only the answers that were actually provided", () => {
    const narrative = buildInternalNarrative(VALID);
    expect(narrative).toContain("wooden bookshelf");
    expect(narrative).toContain("designed and built");
  });

  it("skips empty optional fields rather than inserting blank filler", () => {
    const narrative = buildInternalNarrative({ ...VALID, result: "  " });
    expect(narrative.split("  ").length).toBe(1);
  });
});
