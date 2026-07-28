/**
 * Dependency-free application-task logic — same split as `plan.ts`/`save.ts`:
 * identity and validation here, real Supabase calls only in `repository.ts`.
 */

export type TaskMutationResult = { success: true } | { success: false; error: string };
export type TaskCreateResult = { success: true; taskId: string } | { success: false; error: string };

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;

export function validateTaskTitle(title: string): string | null {
  if (title.trim().length === 0) return "Give this task a title.";
  if (title.length > MAX_TITLE_LENGTH) return "Task title is too long.";
  return null;
}

export function validateTaskDescription(description: string | null): string | null {
  if (description !== null && description.length > MAX_DESCRIPTION_LENGTH) {
    return "Task description is too long.";
  }
  return null;
}

export type CreateTaskInput = {
  title: string;
  description?: string | null;
  dueDate?: string | null;
  sortOrder?: number;
};

export type CreateTaskFn = (userId: string, planId: string, input: CreateTaskInput) => Promise<{ taskId: string | null; error: string | null }>;

export async function createApplicationTaskForUser(
  userId: string | null,
  planId: string,
  input: CreateTaskInput,
  create: CreateTaskFn
): Promise<TaskCreateResult> {
  if (userId === null) {
    return { success: false, error: "You need to be signed in to add a task." };
  }

  const titleError = validateTaskTitle(input.title);
  if (titleError) return { success: false, error: titleError };

  const descriptionError = validateTaskDescription(input.description ?? null);
  if (descriptionError) return { success: false, error: descriptionError };

  const { taskId, error } = await create(userId, planId, input);
  if (error || taskId === null) {
    console.error("[applications] failed to create application task:", error);
    return { success: false, error: "Couldn't add that task. Please try again." };
  }

  return { success: true, taskId };
}

export type UpdateTaskInput = {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  sortOrder?: number;
};

export type WriteTaskFn = (userId: string, taskId: string, patch: UpdateTaskInput) => Promise<{ error: string | null }>;

export async function updateApplicationTaskForUser(
  userId: string | null,
  taskId: string,
  input: UpdateTaskInput,
  write: WriteTaskFn
): Promise<TaskMutationResult> {
  if (userId === null) {
    return { success: false, error: "You need to be signed in to edit this task." };
  }

  if (input.title !== undefined) {
    const titleError = validateTaskTitle(input.title);
    if (titleError) return { success: false, error: titleError };
  }
  if (input.description !== undefined) {
    const descriptionError = validateTaskDescription(input.description);
    if (descriptionError) return { success: false, error: descriptionError };
  }

  const { error } = await write(userId, taskId, input);
  if (error) {
    console.error("[applications] failed to update application task:", error);
    return { success: false, error: "Couldn't save that change. Please try again." };
  }

  return { success: true };
}

export type SetTaskCompletionFn = (userId: string, taskId: string, completedAt: string | null) => Promise<{ error: string | null }>;

/** Toggles a task's completion — a real timestamp when marking done, `null` when unchecking, never a plain boolean, so overdue/progress math always has a real "when" to work from. */
export async function setApplicationTaskCompletionForUser(
  userId: string | null,
  taskId: string,
  completed: boolean,
  write: SetTaskCompletionFn,
  now: Date = new Date()
): Promise<TaskMutationResult> {
  if (userId === null) {
    return { success: false, error: "You need to be signed in to update this task." };
  }

  const { error } = await write(userId, taskId, completed ? now.toISOString() : null);
  if (error) {
    console.error("[applications] failed to update application task completion:", error);
    return { success: false, error: "Couldn't update that task. Please try again." };
  }

  return { success: true };
}

export type RemoveTaskFn = (userId: string, taskId: string) => Promise<{ error: string | null }>;

export async function deleteApplicationTaskForUser(
  userId: string | null,
  taskId: string,
  remove: RemoveTaskFn
): Promise<TaskMutationResult> {
  if (userId === null) {
    return { success: false, error: "You need to be signed in to remove this task." };
  }

  const { error } = await remove(userId, taskId);
  if (error) {
    console.error("[applications] failed to delete application task:", error);
    return { success: false, error: "Couldn't remove that task. Please try again." };
  }

  return { success: true };
}

/** A date-only comparison — `due_date` has no time component, so "overdue" starts the day *after* it, not the instant it arrives. Never overdue once completed, regardless of when. */
export function isTaskOverdue(dueDate: string | null, completedAt: string | null, now: Date = new Date()): boolean {
  if (dueDate === null || completedAt !== null) return false;
  return dueDate < now.toISOString().slice(0, 10);
}
