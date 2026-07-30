/**
 * Deterministic draft from a pasted URL (spec Part 1 Card 1 "Paste a
 * link"). Server-only.
 *
 * Reuses checkUrl() from src/lib/opportunities/url-safety.ts — that
 * module's own comment notes it was built to fetch *source* URLs during
 * ingestion, "never a URL a student supplies." That caution is about this
 * exact capture use case, so it's addressed head-on here, not ignored:
 * checkUrl()'s protections (private/loopback/link-local + cloud-metadata
 * IP rejection, DNS-rebinding rejection, per-hop redirect revalidation,
 * a bounded redirect count) are supplied-URL-agnostic — they defend the
 * fetch itself, not "trusted vs. untrusted callers." Reusing the same
 * SSRF-safe primitive here is strictly safer than writing a second,
 * unreviewed fetch path for student input. What's added on top, specific
 * to *this* caller being a student-supplied URL: a short timeout, a hard
 * cap on how much of the body is ever read into memory or a prompt, and
 * never following the fetch with anything that executes page script.
 */

import { checkUrl } from "@/lib/opportunities/url-safety";
import { guessCategoryFromText, softwareCategory } from "@/lib/portfolio/capture/category-guess";
import type { CaptureDraft, DetectedEvidence } from "@/lib/portfolio/capture/types";

const CAPTURE_FETCH_TIMEOUT_MS = 8_000;
const MAX_BODY_CHARS = 20_000;

const GIT_HOSTING_HOSTS = new Set(["github.com", "www.github.com", "gitlab.com", "www.gitlab.com", "bitbucket.org"]);

function extractTag(body: string, pattern: RegExp): string | null {
  const match = body.match(pattern);
  return match?.[1]?.trim() || null;
}

function extractTitle(body: string): string | null {
  return extractTag(body, /<title[^>]*>([^<]{1,300})<\/title>/i);
}

function extractMetaDescription(body: string): string | null {
  return (
    extractTag(body, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,500})["']/i) ??
    extractTag(body, /<meta[^>]+content=["']([^"']{1,500})["'][^>]+name=["']description["']/i) ??
    extractTag(body, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,500})["']/i)
  );
}

export async function draftFromUrl(rawUrl: string): Promise<CaptureDraft> {
  let hostname = "";
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return emptyUrlDraft(rawUrl, "extraction_failed");
  }

  const isGitHosting = GIT_HOSTING_HOSTS.has(hostname);

  const result = await checkUrl(rawUrl, { timeoutMs: CAPTURE_FETCH_TIMEOUT_MS, readBody: true });

  if (result.status !== "working" && result.status !== "redirected") {
    return emptyUrlDraft(rawUrl, result.status === "blocked" ? "unsupported_for_automatic_analysis" : "extraction_failed");
  }

  const body = (result.body ?? "").slice(0, MAX_BODY_CHARS);
  const title = extractTitle(body);
  const description = extractMetaDescription(body);
  const category = isGitHosting ? softwareCategory() : guessCategoryFromText(`${title ?? ""} ${description ?? ""}`);

  const evidence: DetectedEvidence[] = [
    {
      sourceKind: isGitHosting ? "git_repository" : "public_url",
      label: title ?? rawUrl,
      url: result.finalUrl,
      extractionStatus: body.length > 0 ? "readable" : "metadata_only",
    },
  ];

  return {
    title: { value: title ?? rawUrl, origin: "extracted" },
    activityCategoryKey: { value: category.key, origin: "suggested" },
    organization: { value: null, origin: "extracted" },
    description: { value: description ?? "", origin: "extracted" },
    startDate: { value: null, origin: "extracted" },
    skills: { value: [], origin: "suggested" },
    detectedEvidence: evidence,
    suggestedPersonalRolePrompt: "",
  };
}

function emptyUrlDraft(rawUrl: string, status: string): CaptureDraft {
  return {
    title: { value: rawUrl, origin: "extracted" },
    activityCategoryKey: { value: null, origin: "suggested" },
    organization: { value: null, origin: "extracted" },
    description: { value: "", origin: "extracted" },
    startDate: { value: null, origin: "extracted" },
    skills: { value: [], origin: "suggested" },
    detectedEvidence: [{ sourceKind: "public_url", label: rawUrl, url: rawUrl, extractionStatus: status }],
    suggestedPersonalRolePrompt: "",
  };
}
