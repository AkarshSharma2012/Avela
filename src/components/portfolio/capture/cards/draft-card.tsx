"use client";

import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, CircleDashed, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategorySelector } from "@/components/portfolio/capture/category-selector";
import { cn } from "@/lib/utils";
import { friendlyExtractionStatus, SOURCE_KIND_ICON } from "@/lib/portfolio/evidence-labels";
import type { CaptureDraft, FieldOrigin } from "@/lib/portfolio/capture/types";

const TEXTAREA_CLASS =
  "flex w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground transition-all duration-[var(--duration-fast)] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30";

const ORIGIN_LABEL: Record<FieldOrigin, string> = {
  student: "You entered this",
  extracted: "Found from your evidence",
  suggested: "Avela's suggestion",
};

/** Only rendered when Avela actually did something to a field — the common "you typed this yourself" case shouldn't repeat a pill on every single field (spec: "avoid repeating the same source indicator unnecessarily"). */
function OriginHint({ origin }: { origin: FieldOrigin }) {
  if (origin === "student") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[0.7rem] font-medium",
        origin === "extracted" ? "text-primary" : "text-signal"
      )}
    >
      <Sparkles aria-hidden="true" className="size-3" />
      {ORIGIN_LABEL[origin]}
    </span>
  );
}

function FieldRow({ htmlFor, label, origin, children }: { htmlFor: string; label: string; origin?: FieldOrigin; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {origin && <OriginHint origin={origin} />}
      </div>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <p className="text-xs font-medium tracking-wide text-primary uppercase">{children}</p>;
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
    <div className="flex flex-col gap-7">
      <div>
        <h2 className="flex items-center gap-2 font-heading text-2xl text-foreground sm:text-3xl">
          <Sparkles aria-hidden="true" className="size-6 text-signal" />
          Avela&apos;s draft
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Here&apos;s what we understood. Fix anything that isn&apos;t right.</p>
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel>Project identity</SectionLabel>
        <FieldRow htmlFor="draft-title" label="Title" origin={draft.title.origin}>
          <Input id="draft-title" value={draft.title.value} onChange={(e) => onChange({ ...draft, title: { value: e.target.value, origin: "student" } })} />
        </FieldRow>

        <div className="flex flex-col gap-1.5">
          <Label id="draft-category-label">Category</Label>
          <CategorySelector
            value={draft.activityCategoryKey.value}
            ariaLabelledBy="draft-category-label"
            onChange={(categoryKey) => onChange({ ...draft, activityCategoryKey: { value: categoryKey, origin: "student" } })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel>What it is</SectionLabel>
        <FieldRow htmlFor="draft-description" label="Description" origin={draft.description.origin}>
          <textarea
            id="draft-description"
            className={TEXTAREA_CLASS}
            rows={4}
            value={draft.description.value}
            onChange={(e) => onChange({ ...draft, description: { value: e.target.value, origin: "student" } })}
          />
        </FieldRow>
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel>Context</SectionLabel>
        <FieldRow htmlFor="draft-org" label="Organization (optional)">
          <Input
            id="draft-org"
            value={draft.organization.value ?? ""}
            onChange={(e) => onChange({ ...draft, organization: { value: e.target.value || null, origin: "student" } })}
          />
        </FieldRow>
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel>Timeline</SectionLabel>
        <FieldRow htmlFor="draft-start-date" label="Start date (optional)">
          <Input
            id="draft-start-date"
            type="date"
            value={draft.startDate.value ?? ""}
            onChange={(e) => onChange({ ...draft, startDate: { value: e.target.value || null, origin: "student" } })}
          />
        </FieldRow>
      </div>

      {draft.detectedEvidence.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>What Avela detected</SectionLabel>
          <ul className="flex flex-col gap-1.5 rounded-md border border-dashed border-border bg-secondary/50 px-4 py-3">
            {draft.detectedEvidence.map((e, i) => {
              const Icon = SOURCE_KIND_ICON[e.sourceKind as keyof typeof SOURCE_KIND_ICON] ?? CircleDashed;
              return (
                <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                  <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  {e.label} <span className="text-xs text-muted-foreground">({friendlyExtractionStatus(e.extractionStatus)})</span>
                </li>
              );
            })}
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
