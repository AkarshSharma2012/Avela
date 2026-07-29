"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PORTFOLIO_ITEM_TYPES } from "@/lib/portfolio/constants";
import { createPortfolioItem, updatePortfolioItem } from "@/lib/portfolio/actions";
import type { EntryNarrativeInput } from "@/lib/portfolio/entry-narrative";
import type { PortfolioItemFields } from "@/lib/portfolio/item";
import { PROJECT_CONTEXTS } from "@/lib/portfolio/project-context";
import { PASSION_GROUPS, PASSION_GROUP_LABELS, listCategoriesByPassionGroup } from "@/lib/portfolio/taxonomy";
import { resolveCategoryTemplate } from "@/lib/portfolio/templates";
import type { PortfolioItemProjectContext, PortfolioItemType } from "@/types/database";
import type { PortfolioItem } from "@/types/portfolio";

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-card px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

const TEXTAREA_CLASS =
  "flex w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground transition-all duration-[var(--duration-fast)] placeholder:text-muted-foreground hover:border-foreground/25 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

type FormState = {
  itemType: PortfolioItemType;
  title: string;
  organization: string;
  role: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  hoursPerWeek: string;
  weeksPerYear: string;
  description: string;
  outcome: string;
  skills: string;
  tags: string;
  url: string;
  githubUsername: string;
  activityCategoryKey: string;
  projectContext: PortfolioItemProjectContext | "";
  whatYouDid: string;
  whyYouDidIt: string;
  yourPart: string;
};

function toFormState(item?: PortfolioItem): FormState {
  return {
    itemType: item?.item_type ?? "activity",
    title: item?.title ?? "",
    organization: item?.organization ?? "",
    role: item?.role ?? "",
    startDate: item?.start_date ?? "",
    endDate: item?.end_date ?? "",
    isCurrent: item?.is_current ?? false,
    hoursPerWeek: item?.hours_per_week !== null && item?.hours_per_week !== undefined ? String(item.hours_per_week) : "",
    weeksPerYear: item?.weeks_per_year !== null && item?.weeks_per_year !== undefined ? String(item.weeks_per_year) : "",
    description: item?.description ?? "",
    outcome: item?.outcome ?? "",
    skills: item?.skills.join(", ") ?? "",
    tags: item?.tags.join(", ") ?? "",
    url: item?.url ?? "",
    githubUsername: item?.github_username ?? "",
    activityCategoryKey: item?.activity_category_key ?? "",
    projectContext: (item?.project_context as PortfolioItemProjectContext | null) ?? "",
    whatYouDid: "",
    whyYouDidIt: "",
    yourPart: "",
  };
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function toFields(state: FormState): PortfolioItemFields {
  return {
    itemType: state.itemType,
    title: state.title,
    organization: state.organization.trim() === "" ? null : state.organization.trim(),
    role: state.role.trim() === "" ? null : state.role.trim(),
    startDate: state.startDate === "" ? null : state.startDate,
    endDate: state.isCurrent || state.endDate === "" ? null : state.endDate,
    isCurrent: state.isCurrent,
    hoursPerWeek: state.hoursPerWeek === "" ? null : Number(state.hoursPerWeek),
    weeksPerYear: state.weeksPerYear === "" ? null : Number(state.weeksPerYear),
    description: state.description.trim() === "" ? null : state.description.trim(),
    outcome: state.outcome.trim() === "" ? null : state.outcome.trim(),
    skills: splitList(state.skills),
    tags: splitList(state.tags),
    url: state.url.trim() === "" ? null : state.url.trim(),
    githubUsername: state.githubUsername.trim() === "" ? null : state.githubUsername.trim(),
    activityCategoryKey: state.activityCategoryKey.trim() === "" ? null : state.activityCategoryKey.trim(),
    projectContext: state.projectContext === "" ? null : state.projectContext,
  };
}

function toNarrative(state: FormState): EntryNarrativeInput {
  return { whatYouDid: state.whatYouDid, whyYouDidIt: state.whyYouDidIt, yourPart: state.yourPart };
}

/** Used both to add a new item (/portfolio) and to edit an existing one (the item workspace page) — the same fields, the same validation, just a different submit target. */
function PortfolioItemForm({
  item,
  onSaved,
  onCancel,
}: {
  item?: PortfolioItem;
  onSaved?: (itemId: string) => void;
  onCancel?: () => void;
}) {
  const [state, setState] = useState<FormState>(() => toFormState(item));
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = toFields(state);

    startTransition(async () => {
      if (item) {
        const result = await updatePortfolioItem(item.id, fields);
        if (result.error) {
          setError(result.error);
          return;
        }
        setError(null);
        setAnnouncement("Saved.");
        router.refresh();
        onSaved?.(item.id);
      } else {
        const result = await createPortfolioItem(fields, toNarrative(state));
        if (result.error || !result.itemId) {
          setError(result.error ?? "Couldn't save that item. Please try again.");
          return;
        }
        setError(null);
        onSaved?.(result.itemId);
        router.push(`/portfolio/items/${result.itemId}`);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" aria-describedby={error ? "portfolio-item-form-error" : undefined}>
      {!item && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-type">What kind of item is this?</Label>
          <select
            id="item-type"
            className={SELECT_CLASS}
            value={state.itemType}
            onChange={(event) => update("itemType", event.target.value as PortfolioItemType)}
            disabled={isPending}
          >
            {PORTFOLIO_ITEM_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {!item && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-category">What kind of activity or project is it?</Label>
              <select
                id="item-category"
                className={SELECT_CLASS}
                value={state.activityCategoryKey}
                onChange={(event) => update("activityCategoryKey", event.target.value)}
                disabled={isPending}
              >
                <option value="">Choose one (optional)</option>
                {PASSION_GROUPS.map((group) => (
                  <optgroup key={group} label={PASSION_GROUP_LABELS[group]}>
                    {listCategoriesByPassionGroup(group).map((category) => (
                      <option key={category.key} value={category.key}>
                        {category.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-context">What&apos;s the context?</Label>
              <select
                id="item-context"
                className={SELECT_CLASS}
                value={state.projectContext}
                onChange={(event) => update("projectContext", event.target.value as PortfolioItemProjectContext)}
                disabled={isPending}
              >
                <option value="">Choose one (optional)</option>
                {PROJECT_CONTEXTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(() => {
            const template = resolveCategoryTemplate(state.activityCategoryKey || null, state.projectContext || null);
            return (
              <div className="flex flex-col gap-4 rounded-md border border-border bg-secondary/30 px-4 py-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="item-what-you-did">{template.requiredPrompts.whatPrompt}</Label>
                  <textarea
                    id="item-what-you-did"
                    className={TEXTAREA_CLASS}
                    rows={2}
                    value={state.whatYouDid}
                    onChange={(event) => update("whatYouDid", event.target.value)}
                    placeholder="A sentence or two is enough."
                    disabled={isPending}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="item-why">{template.requiredPrompts.whyPrompt}</Label>
                  <textarea
                    id="item-why"
                    className={TEXTAREA_CLASS}
                    rows={2}
                    value={state.whyYouDidIt}
                    onChange={(event) => update("whyYouDidIt", event.target.value)}
                    placeholder="A sentence or two is enough."
                    disabled={isPending}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="item-your-part">{template.requiredPrompts.yourPartPrompt}</Label>
                  <textarea
                    id="item-your-part"
                    className={TEXTAREA_CLASS}
                    rows={2}
                    value={state.yourPart}
                    onChange={(event) => update("yourPart", event.target.value)}
                    placeholder="A sentence or two is enough."
                    disabled={isPending}
                    required
                  />
                </div>
              </div>
            );
          })()}
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="item-title">Title</Label>
        <Input
          id="item-title"
          value={state.title}
          onChange={(event) => update("title", event.target.value)}
          placeholder="e.g. Varsity Debate Team Captain"
          disabled={isPending}
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-organization">Organization</Label>
          <Input
            id="item-organization"
            value={state.organization}
            onChange={(event) => update("organization", event.target.value)}
            placeholder="e.g. Lincoln High School"
            disabled={isPending}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-role">Your role</Label>
          <Input
            id="item-role"
            value={state.role}
            onChange={(event) => update("role", event.target.value)}
            placeholder="e.g. Team captain"
            disabled={isPending}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-start-date">Start date</Label>
          <Input
            id="item-start-date"
            type="date"
            value={state.startDate}
            onChange={(event) => update("startDate", event.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-end-date">End date</Label>
          <Input
            id="item-end-date"
            type="date"
            value={state.endDate}
            onChange={(event) => update("endDate", event.target.value)}
            disabled={isPending || state.isCurrent}
          />
        </div>
      </div>

      <label htmlFor="item-is-current" className="flex w-fit cursor-pointer items-center gap-2 text-sm text-foreground">
        <Checkbox
          id="item-is-current"
          checked={state.isCurrent}
          onCheckedChange={(checked) => update("isCurrent", checked === true)}
          disabled={isPending}
        />
        I&apos;m still doing this
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-hours">Hours per week</Label>
          <Input
            id="item-hours"
            type="number"
            min={0}
            max={168}
            value={state.hoursPerWeek}
            onChange={(event) => update("hoursPerWeek", event.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-weeks">Weeks per year</Label>
          <Input
            id="item-weeks"
            type="number"
            min={0}
            max={52}
            value={state.weeksPerYear}
            onChange={(event) => update("weeksPerYear", event.target.value)}
            disabled={isPending}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="item-description">Description</Label>
        <textarea
          id="item-description"
          className={TEXTAREA_CLASS}
          rows={3}
          value={state.description}
          onChange={(event) => update("description", event.target.value)}
          placeholder="What is this, in your own words?"
          disabled={isPending}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="item-outcome">Outcome</Label>
        <textarea
          id="item-outcome"
          className={TEXTAREA_CLASS}
          rows={3}
          value={state.outcome}
          onChange={(event) => update("outcome", event.target.value)}
          placeholder="What actually happened or what you accomplished — just the facts."
          disabled={isPending}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-skills">Skills</Label>
          <Input
            id="item-skills"
            value={state.skills}
            onChange={(event) => update("skills", event.target.value)}
            placeholder="Comma separated, e.g. Public speaking, Excel"
            disabled={isPending}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-tags">Tags</Label>
          <Input
            id="item-tags"
            value={state.tags}
            onChange={(event) => update("tags", event.target.value)}
            placeholder="Comma separated, e.g. STEM, weekend"
            disabled={isPending}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="item-url">Link</Label>
        <Input
          id="item-url"
          type="url"
          value={state.url}
          onChange={(event) => update("url", event.target.value)}
          placeholder="https://..."
          disabled={isPending}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="item-github-username" className="text-xs text-muted-foreground">
          GitHub username (optional)
        </Label>
        <Input
          id="item-github-username"
          value={state.githubUsername}
          onChange={(event) => update("githubUsername", event.target.value)}
          placeholder="yourusername"
          disabled={isPending}
          className="h-8 max-w-xs text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Optional — used only to help find public repositories. It does not verify account ownership.
        </p>
      </div>

      {error && <FieldError id="portfolio-item-form-error" errors={[error]} />}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          disabled={
            isPending ||
            state.title.trim().length === 0 ||
            (!item && (state.whatYouDid.trim().length === 0 || state.whyYouDidIt.trim().length === 0 || state.yourPart.trim().length === 0))
          }
        >
          {item ? "Save changes" : "Add item"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
        )}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </form>
  );
}

export { PortfolioItemForm };
