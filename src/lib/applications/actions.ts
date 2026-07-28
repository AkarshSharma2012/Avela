"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUser } from "@/lib/auth/dal";
import { suggestStarterTasks } from "@/lib/applications/constants";
import {
  deleteApplicationPlanForUser,
  ensureApplicationPlanForUser,
  updateApplicationPlanForUser,
  type UpdatePlanInput,
} from "@/lib/applications/plan";
import * as repo from "@/lib/applications/repository";
import {
  createApplicationTaskForUser,
  deleteApplicationTaskForUser,
  setApplicationTaskCompletionForUser,
  updateApplicationTaskForUser,
  type UpdateTaskInput,
} from "@/lib/applications/tasks";
import { giveFeedbackForUser } from "@/lib/opportunities/feedback";
import { createClient } from "@/lib/supabase/server";

export type ApplicationActionResult = { error?: string };
export type StartApplicationResult = { planId?: string; error?: string };

function revalidateApplicationPages(planId?: string) {
  revalidatePath("/applications");
  revalidatePath("/dashboard");
  if (planId) revalidatePath(`/applications/${planId}`);
}

/**
 * "Help me apply" / "Move to my applications" entry point — creates or
 * reuses a plan (never a duplicate, see repository.ts), keeps the existing
 * recommendation_feedback "help_me_apply" signal in sync exactly like
 * before this milestone, and seeds a starter checklist only the first time
 * a plan is created (never re-added on a repeat click for an already
 * existing plan).
 */
export async function startApplicationPlan(opportunityId: string): Promise<StartApplicationResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in to start an application." };

  const supabase = await createClient();

  const { data: opportunity, error: opportunityError } = await supabase
    .from("opportunities")
    .select("application_deadline, opportunity_type, essay_required, recommendation_required, interview_required")
    .eq("id", opportunityId)
    .maybeSingle();

  if (opportunityError || !opportunity) {
    return { error: "Couldn't find that opportunity." };
  }

  const existingPlan = await repo.getApplicationPlanForOpportunity(supabase, user.id, opportunityId);

  const result = await ensureApplicationPlanForUser(
    user.id,
    opportunityId,
    opportunity.application_deadline,
    (userId, oppId, defaults) => repo.createOrReuseApplicationPlan(supabase, userId, oppId, defaults)
  );

  if (!result.success) return { error: result.error };

  // Best-effort — mirrors the "help_me_apply" recommendation feedback row
  // the same way it worked before this milestone; never blocks plan
  // creation on its own failure (giveFeedbackForUser logs internally).
  await giveFeedbackForUser(user.id, opportunityId, { feedbackType: "help_me_apply" }, async (userId, oppId, write) => {
    const { error } = await supabase.from("recommendation_feedback").upsert(
      { user_id: userId, opportunity_id: oppId, feedback_type: write.feedbackType },
      { onConflict: "user_id,opportunity_id,feedback_type" }
    );
    return { error: error?.message ?? null };
  });

  if (!existingPlan) {
    const suggestions = suggestStarterTasks(opportunity.opportunity_type, {
      essayRequired: opportunity.essay_required,
      recommendationRequired: opportunity.recommendation_required,
      interviewRequired: opportunity.interview_required,
    });
    await Promise.all(
      suggestions.map((task, index) =>
        repo.insertApplicationTask(supabase, user.id, result.planId, {
          title: task.title,
          description: task.description,
          sortOrder: index,
        })
      )
    );
  }

  revalidateApplicationPages(result.planId);
  return { planId: result.planId };
}

/** Re-adds any starter suggestion not already on the checklist (by title) — for a student who cleared their list and wants the suggestions back. Never duplicates an existing task. */
export async function addSuggestedTasks(planId: string): Promise<ApplicationActionResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in to add tasks." };

  const supabase = await createClient();
  const bundle = await repo.getApplicationPlanBundle(supabase, user.id, planId);
  if (!bundle) return { error: "Couldn't find that application." };

  const suggestions = suggestStarterTasks(bundle.opportunity.opportunity_type, {
    essayRequired: bundle.opportunity.essay_required,
    recommendationRequired: bundle.opportunity.recommendation_required,
    interviewRequired: bundle.opportunity.interview_required,
  });
  const existingTitles = new Set(bundle.tasks.map((task) => task.title));
  const toAdd = suggestions.filter((task) => !existingTitles.has(task.title));
  const startOrder = bundle.tasks.length;

  await Promise.all(
    toAdd.map((task, index) =>
      repo.insertApplicationTask(supabase, user.id, planId, {
        title: task.title,
        description: task.description,
        sortOrder: startOrder + index,
      })
    )
  );

  revalidateApplicationPages(planId);
  return {};
}

export async function updateApplicationPlan(planId: string, input: UpdatePlanInput): Promise<ApplicationActionResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in to update your application." };

  const supabase = await createClient();
  const current = await repo.getApplicationPlan(supabase, user.id, planId);
  if (!current) return { error: "Couldn't find that application." };

  const result = await updateApplicationPlanForUser(
    user.id,
    planId,
    {
      status: current.status,
      officialDeadline: current.official_deadline,
      submittedAt: current.submitted_at,
      decisionAt: current.decision_at,
    },
    input,
    (userId, id, patch) => repo.writeApplicationPlanUpdate(supabase, userId, id, patch)
  );

  if (!result.success) return { error: result.error };
  revalidateApplicationPages(planId);
  return {};
}

export async function deleteApplicationPlan(planId: string): Promise<ApplicationActionResult> {
  const user = await getAuthenticatedUser();
  const supabase = await createClient();

  const result = await deleteApplicationPlanForUser(user?.id ?? null, planId, (userId, id) =>
    repo.removeApplicationPlan(supabase, userId, id)
  );

  if (!result.success) return { error: result.error };
  revalidateApplicationPages();
  return {};
}

export type AddTaskResult = { taskId?: string; error?: string };

export async function addApplicationTask(
  planId: string,
  input: { title: string; description?: string | null; dueDate?: string | null }
): Promise<AddTaskResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in to add a task." };

  const supabase = await createClient();
  const plan = await repo.getApplicationPlan(supabase, user.id, planId);
  if (!plan) return { error: "Couldn't find that application." };

  const sortOrder = await repo.countApplicationTasks(supabase, user.id, planId);

  const result = await createApplicationTaskForUser(user.id, planId, { ...input, sortOrder }, (userId, id, taskInput) =>
    repo.insertApplicationTask(supabase, userId, id, taskInput)
  );

  if (!result.success) return { error: result.error };
  revalidateApplicationPages(planId);
  return { taskId: result.taskId };
}

export async function updateApplicationTask(taskId: string, input: UpdateTaskInput): Promise<ApplicationActionResult> {
  const user = await getAuthenticatedUser();
  const supabase = await createClient();

  const result = await updateApplicationTaskForUser(user?.id ?? null, taskId, input, (userId, id, patch) =>
    repo.writeApplicationTaskUpdate(supabase, userId, id, patch)
  );

  if (!result.success) return { error: result.error };
  revalidateApplicationPages();
  return {};
}

export async function setApplicationTaskCompletion(taskId: string, completed: boolean): Promise<ApplicationActionResult> {
  const user = await getAuthenticatedUser();
  const supabase = await createClient();

  const result = await setApplicationTaskCompletionForUser(user?.id ?? null, taskId, completed, (userId, id, completedAt) =>
    repo.writeApplicationTaskCompletion(supabase, userId, id, completedAt)
  );

  if (!result.success) return { error: result.error };
  revalidateApplicationPages();
  return {};
}

export async function removeApplicationTask(taskId: string): Promise<ApplicationActionResult> {
  const user = await getAuthenticatedUser();
  const supabase = await createClient();

  const result = await deleteApplicationTaskForUser(user?.id ?? null, taskId, (userId, id) =>
    repo.removeApplicationTask(supabase, userId, id)
  );

  if (!result.success) return { error: result.error };
  revalidateApplicationPages();
  return {};
}
