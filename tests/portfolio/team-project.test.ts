import { describe, expect, it } from "vitest";

import {
  hasDistinctPersonalContribution,
  validateTeamCollaboratorInput,
  validateTeamDetailsInput,
} from "@/lib/portfolio/team-project";

describe("validateTeamDetailsInput", () => {
  it("accepts every field blank — nothing here is ever required to save", () => {
    expect(validateTeamDetailsInput({})).toEqual({ valid: true });
  });

  it("accepts a fully filled-out set of fields", () => {
    expect(
      validateTeamDetailsInput({
        teamSize: 4,
        studentRole: "Lead builder",
        teamOutput: "The team built a robot for competition.",
        personalContribution: "I designed and wired the control board.",
      })
    ).toEqual({ valid: true });
  });

  it("rejects a non-integer or out-of-range team size", () => {
    expect(validateTeamDetailsInput({ teamSize: 0 })).toMatchObject({ valid: false });
    expect(validateTeamDetailsInput({ teamSize: 1.5 })).toMatchObject({ valid: false });
    expect(validateTeamDetailsInput({ teamSize: 5000 })).toMatchObject({ valid: false });
  });

  it("rejects an unreasonably long free-text field", () => {
    expect(validateTeamDetailsInput({ personalContribution: "a".repeat(3000) })).toMatchObject({ valid: false });
  });
});

describe("validateTeamCollaboratorInput", () => {
  it("requires only a name — email is never required (spec section 12)", () => {
    expect(validateTeamCollaboratorInput({ name: "Jordan" })).toEqual({ valid: true });
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(validateTeamCollaboratorInput({ name: "" })).toMatchObject({ valid: false });
    expect(validateTeamCollaboratorInput({ name: "   " })).toMatchObject({ valid: false });
  });

  it("accepts an optional email and role when present", () => {
    expect(validateTeamCollaboratorInput({ name: "Jordan", email: "jordan@example.com", role: "Co-builder" })).toEqual({ valid: true });
  });

  it("rejects an unreasonably long name", () => {
    expect(validateTeamCollaboratorInput({ name: "a".repeat(300) })).toMatchObject({ valid: false });
  });
});

describe("hasDistinctPersonalContribution", () => {
  it("is false when personal contribution is blank — no sole-creator status is implied by omission", () => {
    expect(hasDistinctPersonalContribution({ teamOutput: "We built a robot.", personalContribution: "" })).toBe(false);
    expect(hasDistinctPersonalContribution({})).toBe(false);
  });

  it("is false when personal contribution is identical to team output — merely restating team output proves nothing extra", () => {
    expect(
      hasDistinctPersonalContribution({ teamOutput: "We built a robot together.", personalContribution: "We built a robot together." })
    ).toBe(false);
  });

  it("is true only when a distinct personal contribution is actually recorded", () => {
    expect(
      hasDistinctPersonalContribution({ teamOutput: "We built a robot together.", personalContribution: "I wired the control board." })
    ).toBe(true);
  });
});
