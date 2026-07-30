/**
 * Server-only config gate for the AI evidence grader (spec Parts 6/7/14).
 * Never imported by a Client Component — every value here comes from
 * server-only env vars, and NVIDIA_API_KEY is never returned to a caller,
 * only consumed internally by nvidia-provider.ts.
 *
 * Disabled by default: with no AI_EVIDENCE_GRADER_PROVIDER set, or set to
 * an unrecognized value, or 'nvidia' without NVIDIA_API_KEY present, the
 * grader is off and every caller falls back to deterministic-only support.
 * This is the explicit server-side consent/config gate spec Part 14 asks
 * for — external AI analysis never runs merely because a student uploaded
 * evidence; it runs only when an operator has deliberately configured it.
 */

export type GraderProviderName = "nvidia" | "mock" | "disabled";

const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b";
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_RETRIES = 1;

export function getConfiguredProviderName(): GraderProviderName {
  const raw = process.env.AI_EVIDENCE_GRADER_PROVIDER?.trim().toLowerCase();
  if (raw === "nvidia") return "nvidia";
  if (raw === "mock") return "mock";
  return "disabled";
}

export function getConfiguredModel(): string {
  return process.env.AI_EVIDENCE_GRADER_MODEL?.trim() || DEFAULT_MODEL;
}

/** True only when a real (non-empty) NVIDIA_API_KEY is present — never logged, never returned. */
export function isNvidiaKeyConfigured(): boolean {
  return Boolean(process.env.NVIDIA_API_KEY && process.env.NVIDIA_API_KEY.trim().length > 0);
}

export function getGraderTimeoutMs(): number {
  const raw = Number(process.env.AI_EVIDENCE_GRADER_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

export function getGraderMaxRetries(): number {
  const raw = Number(process.env.AI_EVIDENCE_GRADER_MAX_RETRIES);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_MAX_RETRIES;
}
