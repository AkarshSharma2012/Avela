/**
 * NVIDIA-hosted Nemotron provider for EvidenceSupportGrader (spec Part 7).
 * Server-only — this module must never be imported by a Client Component or
 * bundled into client JS; NVIDIA_API_KEY only ever lives in this process.
 *
 * IMPORTANT — documentation caveat: this session attempted to fetch NVIDIA's
 * current official docs for build.nvidia.com / integrate.api.nvidia.com
 * three times (nemotron model page, NIM API reference, NIM getting-started
 * guide) and all three failed (timeout / empty SPA shell / 404) — this
 * environment could not render or reach the live pages. The request shape
 * below follows NVIDIA's long-standing, widely-documented pattern for
 * hosted NIM models (OpenAI-chat-completions-compatible endpoint at
 * https://integrate.api.nvidia.com/v1/chat/completions, bearer auth), which
 * is consistent with every NVIDIA NIM integration guide previously seen —
 * but it was NOT re-verified against current docs in this session. Treat it
 * as a scaffold: re-confirm the endpoint path, model id string, and
 * request/response shape against the live docs before ever pointing this at
 * a real key. No real request has been made against this provider in this
 * session — NVIDIA_API_KEY was never configured here, so isConfigured()
 * always returns false and this code path never executed.
 *
 * Text-only, per spec Part 7: never sends images/audio/video, only
 * normalized text (OCR output, transcripts, captions, metadata, structured
 * claims, deterministic check results) built by the caller.
 */

import { getConfiguredModel, isNvidiaKeyConfigured } from "@/lib/ai/evidence-grader/config";
import type { EvidenceGraderInput, EvidenceGraderProvider } from "@/lib/ai/evidence-grader/types";

const NVIDIA_CHAT_COMPLETIONS_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

const SYSTEM_PROMPT = `You are EvidenceSupportGrader, a neutral evidence-support analyzer for a student portfolio product.
Compare the student's claims against the evidence provided and report which dimensions are supported.
Rules you must follow exactly:
- Never accuse the student of lying, fraud, dishonesty, cheating, or misrepresentation. Use neutral language only (e.g. "dates do not overlap" not "the student lied about dates").
- You are not the sole source of truth. Your output is one input among several deterministic checks a human system combines — never claim something is "confirmed" or "verified" yourself.
- Do not fabricate evidence you were not given. If something is unclear, say so.
- detailed thinking off — respond with the final JSON object only, no reasoning, no chain-of-thought, no commentary outside the JSON.
- Respond with a single JSON object matching exactly this shape, no markdown fences, no extra text:
{"artifact_relevance":"relevant|irrelevant|unclear","project_existence_support":"not_supported|partially_supported|strongly_supported|conflicting","ownership_control_support":"...","personal_contribution_support":"...","role_support":"...","date_support":"...","organization_support":"...","outcome_support":"...","award_result_support":"...","process_support":"...","detected_consistencies":["..."],"detected_gaps":["..."],"possible_conflicts":["..."],"suggested_next_evidence":"..."|null,"confidence":0.0,"short_explanation":"..."}`;

function buildUserPrompt(input: EvidenceGraderInput): string {
  const evidenceBlock = input.evidence.length
    ? input.evidence.map((e, i) => `Evidence ${i + 1} (${e.sourceKind}${e.label ? `, "${e.label}"` : ""}): ${e.extractedText.slice(0, 1200)}`).join("\n\n")
    : "No evidence was provided.";

  const checksBlock = input.deterministicChecks.length
    ? input.deterministicChecks.map((c) => `- ${c.dimension}: ${c.status}`).join("\n")
    : "None run yet.";

  return [
    `Item title: ${input.itemTitle}`,
    `Category: ${input.itemCategory ?? "unknown"}`,
    `Student's description: ${input.itemDescription ?? "(none provided)"}`,
    `Student's claimed role: ${input.studentClaimedRole ?? "(none provided)"}`,
    `Student's explanation of their personal contribution: ${input.studentExplanationOfContribution ?? "(none provided)"}`,
    `Claimed dates: ${input.claimedStartDate ?? "unknown"} to ${input.claimedEndDate ?? "unknown"}`,
    `Claimed organization: ${input.claimedOrganization ?? "(none)"}`,
    "",
    "Evidence:",
    evidenceBlock,
    "",
    "Deterministic checks already run (do not re-litigate these, only add what evidence text can tell you):",
    checksBlock,
  ].join("\n");
}

export function createNvidiaEvidenceGraderProvider(): EvidenceGraderProvider {
  return {
    name: "nvidia",
    isConfigured: isNvidiaKeyConfigured,

    async grade(input, { signal }) {
      const apiKey = process.env.NVIDIA_API_KEY;
      if (!apiKey) {
        throw new Error("NVIDIA_API_KEY is not configured");
      }

      const response = await fetch(NVIDIA_CHAT_COMPLETIONS_URL, {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model: getConfiguredModel(),
          temperature: 0.2,
          max_tokens: 1024,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(input) },
          ],
        }),
      });

      if (!response.ok) {
        // Never include the response body in the thrown error — it could
        // echo back request content in some error formats.
        throw new Error(`NVIDIA API request failed with status ${response.status}`);
      }

      const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("NVIDIA API response had no message content");
      }

      try {
        return JSON.parse(content);
      } catch {
        throw new Error("NVIDIA API response was not valid JSON");
      }
    },
  };
}
