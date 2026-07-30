"use client";

import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ACTIVITY_CATEGORIES, PASSION_GROUP_LABELS } from "@/lib/portfolio/taxonomy";
import type { CaptureDraft, FieldOrigin } from "@/lib/portfolio/capture/types";

const TEXTAREA_CLASS =
  "flex w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground transition-all duration-[var(--duration-fast)] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30";

const ORIGIN_LABEL: Record<FieldOrigin, string> = {
  student: "You entered this",
  extracted: "Found from your evidence",
  suggested: "Avela's suggestion",
};

function OriginBadge({ origin }: { origin: FieldOrigin }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-medium",
        origin === "student" && "bg-secondary text-secondary-foreground",
        origin === "extracted" && "bg-primary/10 text-primary",
        origin === "suggested" && "bg-signal/10 text-signal"
      )}
    >
      {ORIGIN_LABEL[origin]}
    </span>
  );
}

function DraftCard({
  draft,
  onChange,
  onBack,
  onContinue,
}: {
  draft: CaptureDraft;
  onChange: (next: CaptureDraft) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="flex items-center gap-2 font-heading text-2xl text-foreground sm:text-3xl">
          <Sparkles aria-hidden="true" className="size-6 text-signal" />
          Avela&apos;s draft
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Here&apos;s what we understood. Fix anything that isn&apos;t right.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="draft-title">Title</Label>
        <Input id="draft-title" value={draft.title.value} onChange={(e) => onChange({ ...draft, title: { value: e.target.value, origin: "student" } })} />
        <OriginBadge origin={draft.title.origin} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="draft-category">Category</Label>
        <select
          id="draft-category"
          value={draft.activityCategoryKey.value ?? ""}
          onChange={(e) => onChange({ ...draft, activityCategoryKey: { value: e.target.value || null, origin: "student" } })}
          className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <option value="">Choose a category…</option>
          {Object.entries(PASSION_GROUP_LABELS).map(([group, groupLabel]) => (
            <optgroup key={group} label={groupLabel}>
              {ACTIVITY_CATEGORIES.filter((c) => c.passionGroup === group).map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <OriginBadge origin={draft.activityCategoryKey.origin} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="draft-org">Organization (optional)</Label>
        <Input
          id="draft-org"
          value={draft.organization.value ?? ""}
          onChange={(e) => onChange({ ...draft, organization: { value: e.target.value || null, origin: "student" } })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="draft-description">Description</Label>
        <textarea
          id="draft-description"
          className={TEXTAREA_CLASS}
          rows={4}
          value={draft.description.value}
          onChange={(e) => onChange({ ...draft, description: { value: e.target.value, origin: "student" } })}
        />
        <OriginBadge origin={draft.description.origin} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="draft-start-date">Start date (optional)</Label>
        <Input
          id="draft-start-date"
          type="date"
          value={draft.startDate.value ?? ""}
          onChange={(e) => onChange({ ...draft, startDate: { value: e.target.value || null, origin: "student" } })}
        />
      </div>

      {draft.detectedEvidence.length > 0 && (
        <div className="rounded-md border border-dashed border-border bg-secondary/50 px-4 py-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Evidence detected</p>
          <ul className="mt-2 flex flex-col gap-1">
            {draft.detectedEvidence.map((e, i) => (
              <li key={i} className="text-sm text-foreground">
                {e.label} <span className="text-xs text-muted-foreground">({e.extractionStatus.replace(/_/g, " ")})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="size-4" /> Back
        </Button>
        <Button type="button" onClick={onContinue} disabled={draft.title.value.trim().length === 0}>
          Continue <ArrowRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export { DraftCard };
