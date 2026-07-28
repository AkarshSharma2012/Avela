/**
 * Dependency-free application-plan logic, separated from `actions.ts` (the
 * "use server" entry point) and `repository.ts` (the Supabase queries) the
 * same way `save.ts`/`feedback.ts` are — so identity (never a
 * client-supplied user_id) and validation are unit-testable without
 * mocking Next.js or Supabase.
 */

import type { ApplicationPlanStatus } from "@/types/database";

export type ApplicationPlanCreateResult =
  | { success: true; planId: string }
  | { success: false; error: string };

export type ApplicationPlanMutationResult = { success: true } | { success: false; error: string };

export type CreatePlanDefaults = {
  status: ApplicationPlanStatus;
  officialDeadline: string | null;
  targetSubmitDate: string | null;
};

const TARGET_DATE_BUFFER_MS = 3 * 86_400_000;

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Defaults a plan's target submit date to a few days before the official
 * deadline (spec section 8: "target submit date should default before the
 * official deadline") — never after it, and never in the past. When the
 * deadline is unknown, or already fewer than a few days out, there's no
 * safe buffer to default to, so the student sets it themselves.
 */
export function computeDefaultTargetSubmitDate(
  officialDeadline: string | null,
  now: Date = new Date()
): string | null {
  if (officialDeadline === null) return null;
  const deadline = new Date(officialDeadline);
  if (deadline.getTime() <= now.getTime()) return null;

  const buffered = new Date(deadline.getTime() - TARGET_DATE_BUFFER_MS);
  const target = buffered.getTime() > now.getTime() ? buffered : now;
  return toDateOnly(target);
}

/** A newly created plan always starts at `planning` (spec section 3) with a snapshotted deadline — see the migration's own comment on why that snapshot is never later overwritten automatically. */
export function buildPlanDefaults(officialDeadline: string | null, now: Date = new Date()): CreatePlanDefaults {
  return {
    status: "planning",
    officialDeadline,
    targetSubmitDate: computeDefaultTargetSubmitDate(officialDeadline, now),
  };
}

/** A decision can only ever follow having actually applied — prevents e.g. jumping straight from "interested" to "accepted". Every other transition (including backward ones, like undoing a mistaken "withdrawn") is allowed; this is guardrails against corrupting the timeline, not a rigid linear pipeline. */
const DECISION_STATUSES: ReadonlySet<ApplicationPlanStatus> = new Set(["accepted", "rejected"]);

export function validateStatusTransition(
  current: ApplicationPlanStatus,
  next: ApplicationPlanStatus
): string | null {
  if (current === next) return null;
  if (DECISION_STATUSES.has(next) && current !== "applied" && !DECISION_STATUSES.has(current)) {
    return "Mark this as applied before recording a decision.";
  }
  return null;
}

/** A target date after the official deadline can never be met — reject it outright rather than silently accepting a contradictory plan. Both null (deadline unknown) are left unchecked — nothing to compare against. */
export function validateTargetSubmitDate(
  targetSubmitDate: string | null,
  officialDeadline: string | null
): string | null {
  if (targetSubmitDate === null || officialDeadline === null) return null;
  if (new Date(targetSubmitDate).getTime() > new Date(officialDeadline).getTime()) {
    return "Your target date can't be after the official deadline.";
  }
  return null;
}

const MAX_NOTES_LENGTH = 5000;

export function validateNotes(notes: string | null): string | null {
  if (notes !== null && notes.length > MAX_NOTES_LENGTH) {
    return "Notes are too long.";
  }
  return null;
}

export type EnsurePlanFn = (
  userId: string,
  opportunityId: string,
  defaults: CreatePlanDefaults
) => Promise<{ planId: string | null; error: string | null }>;

/**
 * "Help me apply" / "Move to my applications" entry point — creates a plan
 * on first click, reuses it on every later one (spec section 3: "never
 * create duplicate plans"). The actual dedupe/race-safety lives in
 * `repository.ts`'s `createOrReuseApplicationPlan` (a unique constraint
 * backstop, same pattern `student_discovery_runs` documents); this function
 * only owns identity and the friendly-error boundary.
 */
export async function ensureApplicationPlanForUser(
  userId: string | null,
  opportunityId: string,
  officialDeadline: string | null,
  ensure: EnsurePlanFn,
  now: Date = new Date()
): Promise<ApplicationPlanCreateResult> {
  if (userId === null) {
    return { success: false, error: "You need to be signed in to start an application." };
  }

  const defaults = buildPlanDefaults(officialDeadline, now);
  const { planId, error } = await ensure(userId, opportunityId, defaults);

  if (error || planId === null) {
    console.error("[applications] failed to create or reuse application plan:", error);
    return { success: false, error: "Couldn't start your application. Please try again." };
  }

  return { success: true, planId };
}

export type UpdatePlanInput = {
  status?: ApplicationPlanStatus;
  targetSubmitDate?: string | null;
  notes?: string | null;
};

export type UpdatePlanPatch = UpdatePlanInput & {
  submittedAt?: string;
  decisionAt?: string;
};

export type CurrentPlanState = {
  status: ApplicationPlanStatus;
  officialDeadline: string | null;
  submittedAt: string | null;
  decisionAt: string | null;
};

export type WritePlanFn = (userId: string, planId: string, patch: UpdatePlanPatch) => Promise<{ error: string | null }>;

/**
 * Validates a status/date/notes edit against the plan's current state, then
 * derives `submitted_at`/`decision_at` from the status change itself rather
 * than trusting a client-supplied timestamp — set once, the first time a
 * status crosses into `applied`/a decision, and never cleared or
 * overwritten by a later, unrelated edit.
 */
export async function updateApplicationPlanForUser(
  userId: string | null,
  planId: string,
  current: CurrentPlanState,
  input: UpdatePlanInput,
  write: WritePlanFn,
  now: Date = new Date()
): Promise<ApplicationPlanMutationResult> {
  if (userId === null) {
    return { success: false, error: "You need to be signed in to update your application." };
  }

  if (input.status !== undefined) {
    const transitionError = validateStatusTransition(current.status, input.status);
    if (transitionError) return { success: false, error: transitionError };
  }

  if (input.targetSubmitDate !== undefined) {
    const dateError = validateTargetSubmitDate(input.targetSubmitDate, current.officialDeadline);
    if (dateError) return { success: false, error: dateError };
  }

  if (input.notes !== undefined) {
    const notesError = validateNotes(input.notes);
    if (notesError) return { success: false, error: notesError };
  }

  const patch: UpdatePlanPatch = { ...input };
  if (input.status === "applied" && current.submittedAt === null) {
    patch.submittedAt = now.toISOString();
  }
  if (input.status !== undefined && DECISION_STATUSES.has(input.status) && current.decisionAt === null) {
    patch.decisionAt = now.toISOString();
  }

  const { error } = await write(userId, planId, patch);
  if (error) {
    console.error("[applications] failed to update application plan:", error);
    return { success: false, error: "Couldn't save your changes. Please try again." };
  }

  return { success: true };
}

export type RemovePlanFn = (userId: string, planId: string) => Promise<{ error: string | null }>;

export async function deleteApplicationPlanForUser(
  userId: string | null,
  planId: string,
  remove: RemovePlanFn
): Promise<ApplicationPlanMutationResult> {
  if (userId === null) {
    return { success: false, error: "You need to be signed in to remove an application." };
  }

  const { error } = await remove(userId, planId);
  if (error) {
    console.error("[applications] failed to delete application plan:", error);
    return { success: false, error: "Couldn't remove this application. Please try again." };
  }

  return { success: true };
}
