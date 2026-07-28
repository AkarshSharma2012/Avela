import { describe, expect, it } from "vitest";

import {
  DISCOVERY_SOURCES,
  MAX_DISCOVERY_SOURCES,
  scoreDiscoverySources,
  selectDiscoverySources,
} from "@/lib/opportunities/discovery-sources";
import { buildFeedbackProfile } from "@/lib/opportunities/feedback";
import type { MatchProfileInput } from "@/lib/opportunities/matching";

function makeProfile(overrides: Partial<MatchProfileInput> = {}): MatchProfileInput {
  return {
    gradeLevel: 11,
    city: null,
    state: null,
    weeklyAvailability: null,
    experienceLevel: null,
    interests: [],
    goals: [],
    preferences: [],
    ...overrides,
  };
}

describe("scoreDiscoverySources", () => {
  it("returns nothing for a profile with no interests and no goals", () => {
    expect(scoreDiscoverySources(makeProfile())).toEqual([]);
  });

  it("scores an interest match above no match, and always includes universal (interest-less) sources", () => {
    const scored = scoreDiscoverySources(makeProfile({ interests: ["Technology"] }));
    const keys = scored.map((s) => s.source.key);
    expect(keys).toContain("nist-ship"); // Technology-tagged
    expect(keys).toContain("elks-mvs"); // universal scholarship, always included
    expect(keys).not.toContain("youngarts"); // arts-only, no overlap

    const nist = scored.find((s) => s.source.key === "nist-ship")!;
    expect(nist.score).toBeGreaterThan(0);
    expect(nist.reasons.some((r) => r.includes("Technology"))).toBe(true);
  });

  it("scores a goal→type match", () => {
    const scored = scoreDiscoverySources(makeProfile({ goals: ["Find an internship"] }));
    const nist = scored.find((s) => s.source.key === "nist-ship");
    expect(nist).toBeDefined();
    expect(nist!.reasons.some((r) => r.includes("internship"))).toBe(true);
  });

  it("excludes a state-restricted source when the student's state doesn't match", () => {
    const noState = scoreDiscoverySources(makeProfile({ interests: ["Engineering"] }));
    expect(noState.some((s) => s.source.key === "nasa-hsas")).toBe(false);

    const wrongState = scoreDiscoverySources(makeProfile({ interests: ["Engineering"], state: "California" }));
    expect(wrongState.some((s) => s.source.key === "nasa-hsas")).toBe(false);

    const rightState = scoreDiscoverySources(makeProfile({ interests: ["Engineering"], state: "Texas" }));
    expect(rightState.some((s) => s.source.key === "nasa-hsas")).toBe(true);
  });

  it("sorts by score descending, then key ascending as a deterministic tiebreak", () => {
    const scored = scoreDiscoverySources(
      makeProfile({ interests: ["Technology", "Engineering", "Computer Science", "Mathematics"] })
    );
    for (let i = 1; i < scored.length; i++) {
      expect(scored[i - 1].score).toBeGreaterThanOrEqual(scored[i].score);
    }
  });
});

describe("scoreDiscoverySources — recommendation feedback", () => {
  it("can pull an otherwise-unscored source over the inclusion threshold", () => {
    const profile = makeProfile({ interests: ["Visual Arts"] });
    const withoutFeedback = scoreDiscoverySources(profile);
    expect(withoutFeedback.some((s) => s.source.key === "regeneron-sts")).toBe(false);

    const feedbackProfile = buildFeedbackProfile([{ feedbackType: "more_like_this", opportunityType: "competition" }]);
    const withFeedback = scoreDiscoverySources(profile, feedbackProfile);
    const boosted = withFeedback.find((s) => s.source.key === "regeneron-sts");
    expect(boosted).toBeDefined();
    expect(boosted!.score).toBeGreaterThan(0);
    expect(boosted!.reasons.some((r) => r.includes("responded well"))).toBe(true);
  });

  it("reduces (but never eliminates outright) an already-qualified source's score", () => {
    const profile = makeProfile({ interests: ["Technology"] });
    const withoutFeedback = scoreDiscoverySources(profile).find((s) => s.source.key === "nist-ship")!;

    const feedbackProfile = buildFeedbackProfile([{ feedbackType: "dismissed", opportunityType: "internship" }]);
    const withFeedback = scoreDiscoverySources(profile, feedbackProfile).find((s) => s.source.key === "nist-ship")!;

    expect(withFeedback).toBeDefined();
    expect(withFeedback.score).toBeLessThan(withoutFeedback.score);
  });
});

describe("selectDiscoverySources", () => {
  it("never returns more than MAX_DISCOVERY_SOURCES by default", () => {
    const selected = selectDiscoverySources(
      makeProfile({ interests: ["Technology", "Engineering", "Computer Science", "Mathematics", "Medicine"] })
    );
    expect(selected.length).toBeLessThanOrEqual(MAX_DISCOVERY_SOURCES);
    expect(selected.length).toBeLessThanOrEqual(5); // spec hard cap
  });

  it("respects an explicit maxSources cap", () => {
    const selected = selectDiscoverySources(makeProfile({ interests: ["Technology"] }), { maxSources: 1 });
    expect(selected.length).toBeLessThanOrEqual(1);
  });

  it("only ever selects from the fixed approved source list", () => {
    const approvedKeys = new Set(DISCOVERY_SOURCES.map((s) => s.key));
    const selected = selectDiscoverySources(makeProfile({ interests: ["Visual Arts"], goals: ["Enter competitions"] }));
    for (const source of selected) {
      expect(approvedKeys.has(source.key)).toBe(true);
    }
  });

  it("returns nothing for a profile with no signal, never a fallback default list", () => {
    expect(selectDiscoverySources(makeProfile())).toEqual([]);
  });
});
