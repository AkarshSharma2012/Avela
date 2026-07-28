"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Sparkles, Trash2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/applications/progress-bar";
import {
  addApplicationTask,
  addSuggestedTasks,
  removeApplicationTask,
  setApplicationTaskCompletion,
  updateApplicationTask,
} from "@/lib/applications/actions";
import { computePlanProgress } from "@/lib/applications/summary";
import { isTaskOverdue } from "@/lib/applications/tasks";
import { cn } from "@/lib/utils";
import type { ApplicationTask } from "@/types/application";

function TaskRow({
  task,
  onToggle,
  onDueDateChange,
  onDelete,
  disabled,
}: {
  task: ApplicationTask;
  onToggle: (task: ApplicationTask) => void;
  onDueDateChange: (task: ApplicationTask, value: string) => void;
  onDelete: (task: ApplicationTask) => void;
  disabled: boolean;
}) {
  const completed = task.completed_at !== null;
  const overdue = isTaskOverdue(task.due_date, task.completed_at);
  const checkboxId = `task-${task.id}`;

  return (
    <li className="flex items-start gap-3 rounded-md border border-border bg-card px-3.5 py-3">
      <Checkbox
        id={checkboxId}
        checked={completed}
        onCheckedChange={() => onToggle(task)}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <label
          htmlFor={checkboxId}
          className={cn("block cursor-pointer text-sm font-medium text-foreground", completed && "text-muted-foreground line-through")}
        >
          {task.title}
        </label>
        {task.description && <p className="mt-0.5 text-xs text-muted-foreground">{task.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label htmlFor={`${checkboxId}-due`} className="text-xs text-muted-foreground">
            Due
          </label>
          <Input
            id={`${checkboxId}-due`}
            type="date"
            value={task.due_date ?? ""}
            onChange={(event) => onDueDateChange(task, event.target.value)}
            disabled={disabled}
            className="h-7 w-fit px-2 py-1 text-xs"
          />
          {overdue && (
            <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
              <TriangleAlert aria-hidden="true" className="size-3" />
              Overdue
            </span>
          )}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onDelete(task)}
        disabled={disabled}
        aria-label={`Remove task: ${task.title}`}
      >
        <Trash2 aria-hidden="true" className="size-3.5" />
      </Button>
    </li>
  );
}

function TaskChecklist({ planId, initialTasks }: { planId: string; initialTasks: ApplicationTask[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [syncedTasks, setSyncedTasks] = useState(initialTasks);
  const [newTitle, setNewTitle] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Re-syncs from the server's own copy whenever it changes (after any
  // action here triggers Next.js's automatic route refresh) — adjusted
  // during render rather than in an effect (React's recommended pattern
  // for "reset state when a prop changes"), so local optimistic edits in
  // between are never overwritten by a stale extra render.
  if (initialTasks !== syncedTasks) {
    setSyncedTasks(initialTasks);
    setTasks(initialTasks);
  }

  const progress = computePlanProgress(tasks);

  function toggleTask(task: ApplicationTask) {
    const nextCompletedAt = task.completed_at === null ? new Date().toISOString() : null;
    setTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, completed_at: nextCompletedAt } : item)));
    startTransition(async () => {
      const result = await setApplicationTaskCompletion(task.id, nextCompletedAt !== null);
      if (result.error) {
        setTasks((prev) => prev.map((item) => (item.id === task.id ? task : item)));
        setAnnouncement(result.error);
      }
    });
  }

  function changeDueDate(task: ApplicationTask, value: string) {
    const nextDueDate = value === "" ? null : value;
    setTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, due_date: nextDueDate } : item)));
    startTransition(async () => {
      const result = await updateApplicationTask(task.id, { dueDate: nextDueDate });
      if (result.error) {
        setTasks((prev) => prev.map((item) => (item.id === task.id ? task : item)));
        setAnnouncement(result.error);
      }
    });
  }

  function deleteTask(task: ApplicationTask) {
    setTasks((prev) => prev.filter((item) => item.id !== task.id));
    startTransition(async () => {
      const result = await removeApplicationTask(task.id);
      if (result.error) {
        setTasks((prev) => [...prev, task].sort((a, b) => a.sort_order - b.sort_order));
        setAnnouncement(result.error);
      }
    });
  }

  function handleAddTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    startTransition(async () => {
      const result = await addApplicationTask(planId, { title });
      if (result.error) {
        setAnnouncement(result.error);
        return;
      }
      router.refresh();
      setAnnouncement(`Added "${title}".`);
    });
  }

  function handleAddSuggestions() {
    startTransition(async () => {
      const result = await addSuggestedTasks(planId);
      if (result.error) {
        setAnnouncement(result.error);
        return;
      }
      router.refresh();
      setAnnouncement("Added suggested tasks.");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ProgressBar completed={progress.completed} total={progress.total} />

      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks yet — add your own, or start from a few suggestions.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={toggleTask}
              onDueDateChange={changeDueDate}
              onDelete={deleteTask}
              disabled={isPending}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <form onSubmit={handleAddTask} className="flex flex-1 items-center gap-2">
          <Input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="Add a task"
            aria-label="New task title"
            className="h-8 flex-1 text-sm"
            disabled={isPending}
          />
          <Button type="submit" variant="outline" size="sm" disabled={isPending || newTitle.trim().length === 0}>
            <Plus aria-hidden="true" className="size-3.5" />
            Add
          </Button>
        </form>
        <Button type="button" variant="ghost" size="sm" onClick={handleAddSuggestions} disabled={isPending}>
          <Sparkles aria-hidden="true" className="size-3.5" />
          Add suggested tasks
        </Button>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

export { TaskChecklist };
