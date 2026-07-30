import { describe, expect, it } from "vitest";

import { buildCaptureDraft, emptyManualDraft } from "@/lib/portfolio/capture/draft";
import { guessCategoryFromText, guessPassionGroupFromText } from "@/lib/portfolio/capture/category-guess";
import { draftFromText } from "@/lib/portfolio/capture/text-capture";
import { getYourPartPrompt } from "@/lib/portfolio/capture/category-prompts";

describe("draftFromText — offline, deterministic", () => {
  it("uses the first sentence as a title and the full text as the description", () => {
    const draft = draftFromText("I built a go-kart with my dad. We used a lawnmower engine and welded the frame ourselves.");
    expect(draft.title.value).toBe("I built a go-kart with my dad");
    expect(draft.title.origin).toBe("extracted");
    expect(draft.description.value).toContain("welded the frame");
    expect(draft.description.origin).toBe("student");
  });

  it("truncates very long single-sentence text for the title without throwing", () => {
    const longText = "a".repeat(200);
    const draft = draftFromText(longText);
    expect(draft.title.value.length).toBeLessThanOrEqual(80);
  });

  it("never produces detected evidence from text alone", () => {
    const draft = draftFromText("I organized a food drive for my neighborhood.");
    expect(draft.detectedEvidence).toEqual([]);
  });
});

describe("category guessing — deterministic, always overridable (origin: suggested)", () => {
  it("guesses software_and_technology for code/GitHub language", () => {
    expect(guessPassionGroupFromText("I built a github repository with a coding project")).toBe("software_and_technology");
  });

  it("guesses making_and_engineering for a go-kart build", () => {
    expect(guessPassionGroupFromText("I built a go-kart with my dad")).toBe("making_and_engineering");
  });

  it("guesses home_family_and_life_skills for sibling caregiving", () => {
    expect(guessPassionGroupFromText("I helped care for my younger sibling every afternoon")).toBe("home_family_and_life_skills");
  });

  it("returns null (never a fabricated guess) for text with no matching keywords", () => {
    expect(guessPassionGroupFromText("xyz")).toBeNull();
  });

  it("falls back to the generic category when nothing matches", () => {
    const category = guessCategoryFromText("xyz");
    expect(category.key).toBe("custom_activity");
  });
});

describe("category-aware Your Part prompts", () => {
  it("gives a software-specific prompt for software_and_technology", () => {
    expect(getYourPartPrompt("software_and_technology")).toMatch(/code|design|research|product/i);
  });

  it("gives a family-specific prompt for home_family_and_life_skills", () => {
    expect(getYourPartPrompt("home_family_and_life_skills")).toMatch(/responsibility/i);
  });

  it("falls back to the generic prompt for a null passion group", () => {
    expect(getYourPartPrompt(null)).toBe("What part did you personally do?");
  });
});

describe("buildCaptureDraft — Your Part prompt never leaks the generic-fallback category's own passion group", () => {
  it("shows the true generic prompt for text matching no category keyword — regression test for a bug caught by Playwright: GENERIC_CATEGORY_FALLBACK's passionGroup ('home_family_and_life_skills') was leaking into unrelated captures", async () => {
    const draft = await buildCaptureDraft({ method: "text", text: "I spent time on a special summer activity." });
    expect(draft.activityCategoryKey.value).toBe("custom_activity");
    expect(draft.suggestedPersonalRolePrompt).toBe("What part did you personally do?");
  });

  it("still shows a category-specific prompt when a real category is guessed", async () => {
    const draft = await buildCaptureDraft({ method: "text", text: "I painted a mural at my school." });
    expect(draft.activityCategoryKey.value).not.toBe("custom_activity");
    expect(draft.suggestedPersonalRolePrompt).toMatch(/create|choices/i);
  });
});

describe("buildCaptureDraft — every method returns a usable draft, never throws", () => {
  it("text method", async () => {
    const draft = await buildCaptureDraft({ method: "text", text: "I painted a mural at my school." });
    expect(draft.title.value.length).toBeGreaterThan(0);
    expect(draft.suggestedPersonalRolePrompt.length).toBeGreaterThan(0);
  });

  it("upload method — honestly marks the file as not automatically analyzed", async () => {
    const draft = await buildCaptureDraft({ method: "upload", filename: "certificate-of-completion.pdf", mimeType: "application/pdf" });
    expect(draft.detectedEvidence[0]?.extractionStatus).toBe("unsupported_for_automatic_analysis");
    expect(draft.title.value).toBe("certificate of completion");
  });

  it("photo method — same honest metadata-only status, never claims image understanding", async () => {
    const draft = await buildCaptureDraft({ method: "photo", filename: "build-photo.jpg", mimeType: "image/jpeg" });
    expect(draft.detectedEvidence[0]?.sourceKind).toBe("image");
    expect(draft.detectedEvidence[0]?.extractionStatus).toBe("unsupported_for_automatic_analysis");
  });

  it("connect (GitHub) method — always software category, evidence pending real extraction", async () => {
    const draft = await buildCaptureDraft({ method: "connect", provider: "github", repoFullName: "octocat/example-repo" });
    expect(draft.title.value).toBe("example-repo");
    expect(draft.detectedEvidence[0]?.sourceKind).toBe("git_repository");
  });

  it("link method with an unreachable/private-network URL degrades gracefully instead of throwing", async () => {
    const draft = await buildCaptureDraft({ method: "link", url: "http://169.254.169.254/latest/meta-data/" });
    expect(draft.detectedEvidence[0]?.extractionStatus).toBe("unsupported_for_automatic_analysis");
  });

  it("link method with a malformed URL degrades gracefully instead of throwing", async () => {
    const draft = await buildCaptureDraft({ method: "link", url: "not a url" });
    expect(draft.detectedEvidence[0]?.extractionStatus).toBe("extraction_failed");
  });
});

describe("emptyManualDraft — Skip/Start manually always available", () => {
  it("returns an empty, fully student-owned draft with no network call", () => {
    const draft = emptyManualDraft();
    expect(draft.title.value).toBe("");
    expect(draft.title.origin).toBe("student");
    expect(draft.detectedEvidence).toEqual([]);
  });
});
