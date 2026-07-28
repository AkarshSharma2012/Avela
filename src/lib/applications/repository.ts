import type { SupabaseClient } from "@supabase/supabase-js";

import type { CreatePlanDefaults, UpdatePlanPatch } from "@/lib/applications/plan";
import type { CreateTaskInput, UpdateTaskInput } from "@/lib/applications/tasks";
import type { Database } from "@/types/database";
import type { Opportunity } from "@/types/opportunity";
import type { ApplicationPlan, ApplicationTask } from "@/types/application";

type Client = SupabaseClient<Database>;

/** Postgres' unique_violation code — see the migration's `unique (user_id, opportunity_id)` on application_plans. */
const UNIQUE_VIOLATION = "23505";

export async function getApplicationPlanForOpportunity(
  supabase: Client,
  userId: string,
  opportunityId: string
): Promise<ApplicationPlan | null> {
  const { data, error } = await supabase
    .from("application_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();

  if (error) {
    console.error("[applications] failed to look up application plan:", error.message);
    return null;
  }
  return data;
}

export async function getApplicationPlan(
  supabase: Client,
  userId: string,
  planId: string
): Promise<ApplicationPlan | null> {
  const { data, error } = await supabase
    .from("application_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("id", planId)
    .maybeSingle();

  if (error) {
    console.error("[applications] failed to load application plan:", error.message);
    return null;
  }
  return data;
}

/**
 * "Help me apply" entry point: reuses an existing plan for this
 * (user, opportunity) pair, or creates one — select-then-insert, with the
 * migration's unique constraint as the race-safety backstop (same pattern
 * `student_discovery_runs` documents): if two near-simultaneous clicks both
 * miss the initial select, the second insert fails with a unique_violation
 * and falls back to re-selecting the row the first insert just created,
 * rather than surfacing an error or creating a duplicate.
 */
export async function createOrReuseApplicationPlan(
  supabase: Client,
  userId: string,
  opportunityId: string,
  defaults: CreatePlanDefaults
): Promise<{ planId: string | null; error: string | null }> {
  const existing = await getApplicationPlanForOpportunity(supabase, userId, opportunityId);
  if (existing) return { planId: existing.id, error: null };

  const { data, error } = await supabase
    .from("application_plans")
    .insert({
      user_id: userId,
      opportunity_id: opportunityId,
      status: defaults.status,
      official_deadline: defaults.officialDeadline,
      target_submit_date: defaults.targetSubmitDate,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      const raced = await getApplicationPlanForOpportunity(supabase, userId, opportunityId);
      return raced ? { planId: raced.id, error: null } : { planId: null, error: error.message };
    }
    return { planId: null, error: error.message };
  }

  return { planId: data.id, error: null };
}

function toPlanUpdate(patch: UpdatePlanPatch): Database["public"]["Tables"]["application_plans"]["Update"] {
  const update: Database["public"]["Tables"]["application_plans"]["Update"] = {};
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.targetSubmitDate !== undefined) update.target_submit_date = patch.targetSubmitDate;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.submittedAt !== undefined) update.submitted_at = patch.submittedAt;
  if (patch.decisionAt !== undefined) update.decision_at = patch.decisionAt;
  return update;
}

export async function writeApplicationPlanUpdate(
  supabase: Client,
  userId: string,
  planId: string,
  patch: UpdatePlanPatch
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("application_plans")
    .update(toPlanUpdate(patch))
    .eq("user_id", userId)
    .eq("id", planId);

  return { error: error?.message ?? null };
}

export async function removeApplicationPlan(
  supabase: Client,
  userId: string,
  planId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("application_plans").delete().eq("user_id", userId).eq("id", planId);
  return { error: error?.message ?? null };
}

export type ApplicationPlanBundle = {
  plan: ApplicationPlan;
  opportunity: Opportunity;
  tasks: ApplicationTask[];
};

/**
 * Every plan a student has, joined with its opportunity and task
 * checklist. Three queries rather than embedded joins — same reasoning
 * `getSavedOpportunities` documents in query.ts (hand-written
 * `Relationships` typing is fragile for embeds).
 */
export async function getApplicationPlans(supabase: Client, userId: string): Promise<ApplicationPlanBundle[]> {
  const { data: plans, error: plansError } = await supabase
    .from("application_plans")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (plansError) {
    console.error("[applications] failed to load application plans:", plansError.message);
    return [];
  }
  if (!plans || plans.length === 0) return [];

  const opportunityIds = plans.map((plan) => plan.opportunity_id);
  const planIds = plans.map((plan) => plan.id);

  const [{ data: opportunities, error: opportunitiesError }, { data: tasks, error: tasksError }] = await Promise.all([
    supabase.from("opportunities").select("*").in("id", opportunityIds),
    supabase
      .from("application_tasks")
      .select("*")
      .eq("user_id", userId)
      .in("application_plan_id", planIds)
      .order("sort_order", { ascending: true }),
  ]);

  if (opportunitiesError) {
    console.error("[applications] failed to load application opportunities:", opportunitiesError.message);
    return [];
  }
  if (tasksError) {
    console.error("[applications] failed to load application tasks:", tasksError.message);
    return [];
  }

  const opportunityById = new Map((opportunities ?? []).map((opportunity) => [opportunity.id, opportunity]));
  const tasksByPlan = new Map<string, ApplicationTask[]>();
  for (const task of tasks ?? []) {
    const existing = tasksByPlan.get(task.application_plan_id) ?? [];
    existing.push(task);
    tasksByPlan.set(task.application_plan_id, existing);
  }

  return plans
    .map((plan) => {
      const opportunity = opportunityById.get(plan.opportunity_id);
      if (!opportunity) return null;
      return { plan, opportunity, tasks: tasksByPlan.get(plan.id) ?? [] };
    })
    .filter((entry): entry is ApplicationPlanBundle => entry !== null);
}

export async function getApplicationPlanBundle(
  supabase: Client,
  userId: string,
  planId: string
): Promise<ApplicationPlanBundle | null> {
  const plan = await getApplicationPlan(supabase, userId, planId);
  if (!plan) return null;

  const [{ data: opportunity, error: opportunityError }, { data: tasks, error: tasksError }] = await Promise.all([
    supabase.from("opportunities").select("*").eq("id", plan.opportunity_id).maybeSingle(),
    supabase
      .from("application_tasks")
      .select("*")
      .eq("user_id", userId)
      .eq("application_plan_id", planId)
      .order("sort_order", { ascending: true }),
  ]);

  if (opportunityError || !opportunity) {
    if (opportunityError) console.error("[applications] failed to load plan opportunity:", opportunityError.message);
    return null;
  }
  if (tasksError) {
    console.error("[applications] failed to load plan tasks:", tasksError.message);
    return null;
  }

  return { plan, opportunity, tasks: tasks ?? [] };
}

// --- Tasks -------------------------------------------------------------

/** Used to place a newly added manual task after every existing one on the checklist. */
export async function countApplicationTasks(supabase: Client, userId: string, planId: string): Promise<number> {
  const { count, error } = await supabase
    .from("application_tasks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("application_plan_id", planId);

  if (error) {
    console.error("[applications] failed to count application tasks:", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function getApplicationTask(
  supabase: Client,
  userId: string,
  taskId: string
): Promise<ApplicationTask | null> {
  const { data, error } = await supabase
    .from("application_tasks")
    .select("*")
    .eq("user_id", userId)
    .eq("id", taskId)
    .maybeSingle();

  if (error) {
    console.error("[applications] failed to load application task:", error.message);
    return null;
  }
  return data;
}

export async function insertApplicationTask(
  supabase: Client,
  userId: string,
  planId: string,
  input: CreateTaskInput
): Promise<{ taskId: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from("application_tasks")
    .insert({
      user_id: userId,
      application_plan_id: planId,
      title: input.title.trim(),
      description: input.description ?? null,
      due_date: input.dueDate ?? null,
      sort_order: input.sortOrder ?? 0,
    })
    .select("id")
    .single();

  if (error) return { taskId: null, error: error.message };
  return { taskId: data.id, error: null };
}

function toTaskUpdate(patch: UpdateTaskInput): Database["public"]["Tables"]["application_tasks"]["Update"] {
  const update: Database["public"]["Tables"]["application_tasks"]["Update"] = {};
  if (patch.title !== undefined) update.title = patch.title.trim();
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  return update;
}

export async function writeApplicationTaskUpdate(
  supabase: Client,
  userId: string,
  taskId: string,
  patch: UpdateTaskInput
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("application_tasks").update(toTaskUpdate(patch)).eq("user_id", userId).eq("id", taskId);
  return { error: error?.message ?? null };
}

export async function writeApplicationTaskCompletion(
  supabase: Client,
  userId: string,
  taskId: string,
  completedAt: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("application_tasks")
    .update({ completed_at: completedAt })
    .eq("user_id", userId)
    .eq("id", taskId);
  return { error: error?.message ?? null };
}

export async function removeApplicationTask(
  supabase: Client,
  userId: string,
  taskId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("application_tasks").delete().eq("user_id", userId).eq("id", taskId);
  return { error: error?.message ?? null };
}
