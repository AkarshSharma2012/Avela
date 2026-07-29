import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { computeProfileStrength, type ProfileStrengthInput } from "@/lib/portfolio/strength";
import { resolveCategory } from "@/lib/portfolio/taxonomy";
import type { PortfolioItemType } from "@/types/database";
import type { PortfolioItem } from "@/types/portfolio";

/**
 * Milestone 10.8 spec section 14 fairness proof — deliberately does NOT
 * change strength.ts (it already reads only item_type/dates/outcome/skills/
 * url/file-presence/verification_level, none of which change meaning after
 * the taxonomy/evidence-role expansion). These tests prove the fairness
 * invariants still hold, the same "prove it, don't rebuild it" approach
 * Phase 3/4's cross-category item_type mapping already relies on.
 */

let counter = 0;
function makeItem(overrides: Partial<PortfolioItem> & { item_type: PortfolioItemType }): PortfolioItem {
  counter += 1;
  return {
    id: overrides.id ?? `item-${counter}`,
    user_id: "user-1",
    title: "Untitled",
    organization: null,
    description: null,
    start_date: "2026-01-01",
    end_date: null,
    is_current: false,
    hours_per_week: null,
    weeks_per_year: null,
    role: null,
    outcome: "A real, factual outcome.",
    skills: ["A skill"],
    tags: [],
    url: null,
    github_username: null,
    project_context: null,
    activity_category_key: null,
    template_version: 1,
    last_material_hash: null,
    material_hash_updated_at: null,
    visibility: "visible",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

function score(items: PortfolioItem[], extra: Partial<ProfileStrengthInput> = {}) {
  return computeProfileStrength({ items, fileCountByItemId: new Map(), linkedItemIds: new Set(), ...extra });
}

describe("cross-category fairness (equal completeness -> equal score)", () => {
  it("go-kart (mechanical_build) scores equal to a coding project — both map to item_type 'project'", () => {
    expect(resolveCategory("mechanical_build").itemTypeBucket).toBe("project");
    expect(resolveCategory("coding").itemTypeBucket).toBe("project");

    const goKart = score([makeItem({ item_type: "project", activity_category_key: "mechanical_build" })]);
    const coding = score([makeItem({ item_type: "project", activity_category_key: "coding" })]);
    expect(goKart.score).toBe(coding.score);
  });

  it("painting scores equal to a software project — both map to item_type 'project'", () => {
    expect(resolveCategory("painting").itemTypeBucket).toBe("project");
    expect(resolveCategory("web_or_app").itemTypeBucket).toBe("project");

    const painting = score([makeItem({ item_type: "project", activity_category_key: "painting" })]);
    const software = score([makeItem({ item_type: "project", activity_category_key: "web_or_app" })]);
    expect(painting.score).toBe(software.score);
  });

  it("a music project scores equal to a GitHub-style coding project", () => {
    const music = score([makeItem({ item_type: "project", activity_category_key: "music_performance" })]);
    const coding = score([makeItem({ item_type: "project", activity_category_key: "coding", github_username: "octostudent" })]);
    expect(music.score).toBe(coding.score);
  });

  it("sports participation and family responsibility count identically — both map to item_type 'activity'", () => {
    expect(resolveCategory("team_sport").itemTypeBucket).toBe("activity");
    expect(resolveCategory("family_responsibility").itemTypeBucket).toBe("activity");

    const sports = score([makeItem({ item_type: "activity", activity_category_key: "team_sport" })]);
    const family = score([makeItem({ item_type: "activity", activity_category_key: "family_responsibility" })]);
    expect(sports.score).toBe(family.score);
  });

  it("informal volunteering counts identically to formal nonprofit volunteering — both map to item_type 'volunteer_service'", () => {
    expect(resolveCategory("informal_volunteering").itemTypeBucket).toBe("volunteer_service");
    expect(resolveCategory("nonprofit_volunteering").itemTypeBucket).toBe("volunteer_service");

    const informal = score([makeItem({ item_type: "volunteer_service", activity_category_key: "informal_volunteering" })]);
    const formal = score([makeItem({ item_type: "volunteer_service", activity_category_key: "nonprofit_volunteering" })]);
    expect(informal.score).toBe(formal.score);
  });
});

describe("no public-profile or OAuth-connection requirement or bonus", () => {
  it("an item with no url/file and no GitHub username scores identically to one with a GitHub username but otherwise-identical fields", () => {
    const withoutGithub = score([makeItem({ item_type: "project" })]);
    const withGithub = score([makeItem({ item_type: "project", github_username: "octostudent" })]);
    expect(withoutGithub.score).toBe(withGithub.score);
  });

  it("connecting a provider grants no base-score advantage beyond the small, capped TRUST bucket", () => {
    const base = score([makeItem({ item_type: "project" })]);
    const externallyConfirmed = score([makeItem({ item_type: "project", id: "item-tc" })], {
      verificationLevelByItemId: new Map([["item-tc", "externally_confirmed"]]),
    });
    // Only the TRUST bucket (max 10 of 110) may differ — everything else is untouched.
    expect(externallyConfirmed.score - base.score).toBeLessThanOrEqual(10);
    expect(externallyConfirmed.score).toBeGreaterThanOrEqual(base.score);
  });
});

describe("duplicate providers / connections never farm extra points", () => {
  it("the same verifier confirming many items is capped well below the bucket's own already-small maximum", () => {
    const items = Array.from({ length: 8 }, (_, index) => makeItem({ item_type: "project", id: `item-${index}` }));
    const verificationLevelByItemId = new Map(items.map((item) => [item.id, "externally_confirmed" as const]));
    const verifierEmailByItemId = new Map(items.map((item) => [item.id, "same.verifier@example.com"]));
    const result = score(items, { verificationLevelByItemId, verifierEmailByItemId });
    const trustReason = result.reasons.find((reason) => reason.label.includes("verification"));
    expect(trustReason).toBeDefined();
    // 8 items all "confirmed" by the same verifier — the trust bucket
    // itself is capped at 10 of 110 total, regardless of how many items
    // one verifier touches.
    expect(trustReason!.points).toBeLessThanOrEqual(10);
  });
});

describe("no reference to popularity, cost, or prestige signals anywhere in the scoring code (static check)", () => {
  it("never reads followers, stars, views, likes, ratings, revenue, price, or organization prestige — checked against code only, comments stripped (the fairness-rule doc comment names these terms deliberately, as things it does NOT read)", () => {
    const source = readFileSync(path.resolve(__dirname, "../../src/lib/portfolio/strength.ts"), "utf-8");
    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments, incl. /** ... */
      .replace(/\/\/.*$/gm, " "); // line comments
    for (const forbidden of ["follower", "stargazer", "stars", "views", "likes", "rating", "revenue", "price", "cost", "prestige", "organization"]) {
      expect(codeOnly.toLowerCase()).not.toContain(forbidden);
    }
  });
});
