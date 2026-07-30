/**
 * Single entry point for turning a Card 1 capture into a Card 2 draft
 * (spec Part 1). Deterministic and synchronous/near-synchronous — every
 * branch returns a usable draft even with AI fully disabled, per spec:
 * "Portfolio creation must work when AI is disabled, unavailable, slow, or
 * malformed."
 */

import { getYourPartPrompt } from "@/lib/portfolio/capture/category-prompts";
import { draftFromText } from "@/lib/portfolio/capture/text-capture";
import { draftFromUrl } from "@/lib/portfolio/capture/url-capture";
import { softwareCategory } from "@/lib/portfolio/capture/category-guess";
import type { CaptureDraft, CaptureInput, DetectedEvidence } from "@/lib/portfolio/capture/types";
import { GENERIC_CATEGORY_FALLBACK, resolveCategory } from "@/lib/portfolio/taxonomy";

/**
 * GENERIC_CATEGORY_FALLBACK has a real passionGroup
 * ("home_family_and_life_skills", chosen only for its item_type bucket —
 * see taxonomy.ts) that must never be read as an actual category guess: a
 * capture with no determinable category (activityCategoryKey null, or
 * resolved to the fallback itself) always gets the true generic prompt via
 * getYourPartPrompt(null), the same guard empty-draft.ts uses. Without
 * this check every un-categorizable text capture would incorrectly show
 * the family-responsibility prompt.
 */
function withYourPartPrompt(draft: CaptureDraft): CaptureDraft {
  const key = draft.activityCategoryKey.value;
  const passionGroup = key && key !== GENERIC_CATEGORY_FALLBACK.key ? resolveCategory(key).passionGroup : null;
  return { ...draft, suggestedPersonalRolePrompt: getYourPartPrompt(passionGroup) };
}

/** Upload/photo captures never claim automatic understanding of the file's *content* — only what's honestly known (filename, mime type) until an OCR/transcription extractor exists (spec Part 8: "do not claim an image was understood when only metadata was extracted"). */
function draftFromFileMetadata(filename: string, mimeType: string, method: "upload" | "photo"): CaptureDraft {
  const isImage = mimeType.startsWith("image/");
  const evidence: DetectedEvidence[] = [
    {
      sourceKind: method === "photo" || isImage ? "image" : "document",
      label: filename,
      url: null,
      extractionStatus: "unsupported_for_automatic_analysis",
    },
  ];
  const titleFromFilename = filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();

  return {
    title: { value: titleFromFilename || filename, origin: "extracted" },
    activityCategoryKey: { value: null, origin: "suggested" },
    organization: { value: null, origin: "extracted" },
    description: { value: "", origin: "extracted" },
    startDate: { value: null, origin: "extracted" },
    skills: { value: [], origin: "suggested" },
    detectedEvidence: evidence,
    suggestedPersonalRolePrompt: "",
  };
}

function draftFromGithubConnect(repoFullName: string): CaptureDraft {
  const [, repoName] = repoFullName.split("/");
  const category = softwareCategory();
  return {
    title: { value: repoName ?? repoFullName, origin: "extracted" },
    activityCategoryKey: { value: category.key, origin: "suggested" },
    organization: { value: null, origin: "extracted" },
    description: { value: "", origin: "extracted" },
    startDate: { value: null, origin: "extracted" },
    skills: { value: [], origin: "suggested" },
    detectedEvidence: [{ sourceKind: "git_repository", label: repoFullName, url: `https://github.com/${repoFullName}`, extractionStatus: "extraction_pending" }],
    suggestedPersonalRolePrompt: "",
  };
}

export async function buildCaptureDraft(input: CaptureInput): Promise<CaptureDraft> {
  switch (input.method) {
    case "text":
      return withYourPartPrompt(draftFromText(input.text));
    case "link":
      return withYourPartPrompt(await draftFromUrl(input.url));
    case "upload":
      return withYourPartPrompt(draftFromFileMetadata(input.filename, input.mimeType, "upload"));
    case "photo":
      return withYourPartPrompt(draftFromFileMetadata(input.filename, input.mimeType, "photo"));
    case "connect":
      return withYourPartPrompt(draftFromGithubConnect(input.repoFullName));
  }
}

export { emptyManualDraft } from "@/lib/portfolio/capture/empty-draft";
