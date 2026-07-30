"use client";

import { ArrowLeft, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { ItemTypeBadge } from "@/components/portfolio/item-type-badge";
import { resolveCategory } from "@/lib/portfolio/taxonomy";
import type { CaptureDraft } from "@/lib/portfolio/capture/types";

/** No single headline percentage here — spec Part 4/5's claim-level support only exists once real evidence/checks have run, which happens after saving. This card shows an honest, plain-language summary of what's filled in instead. */
function ReadyCard({
  draft,
  yourPart,
  isSaving,
  error,
  onBack,
  onSave,
}: {
  draft: CaptureDraft;
  yourPart: string;
  isSaving: boolean;
  error: string | null;
  onBack: () => void;
  onSave: () => void;
}) {
  const category = resolveCategory(draft.activityCategoryKey.value);
  const evidenceCount = draft.detectedEvidence.length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading text-2xl text-foreground sm:text-3xl">Ready</h2>
        <p className="mt-1 text-sm text-muted-foreground">Here&apos;s a preview of your portfolio item.</p>
      </div>

      <div className="rounded-xl border border-border bg-card px-5 py-5 shadow-sm">
        <ItemTypeBadge itemType={category.itemTypeBucket} />
        <h3 className="mt-2 font-heading text-xl text-foreground">{draft.title.value || "Untitled item"}</h3>
        {draft.organization.value && <p className="mt-0.5 text-sm text-muted-foreground">{draft.organization.value}</p>}
        {draft.description.value && <p className="mt-3 text-sm text-foreground">{draft.description.value}</p>}
        {yourPart && (
          <div className="mt-3 rounded-md bg-secondary px-3 py-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Your part</p>
            <p className="mt-1 text-sm text-foreground">{yourPart}</p>
          </div>
        )}
      </div>

      <div className="rounded-md border border-dashed border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
        {evidenceCount > 0 ? (
          <p>
            {evidenceCount} piece{evidenceCount === 1 ? "" : "s"} of evidence attached. Claim-level support (what&apos;s confirmed, what&apos;s still
            developing) will show once this is saved — never a single headline percentage.
          </p>
        ) : (
          <p>No evidence attached yet — that&apos;s okay. You can strengthen this anytime from your portfolio.</p>
        )}
      </div>

      <FieldError errors={error ? [error] : undefined} />

      <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={onBack} disabled={isSaving}>
          <ArrowLeft aria-hidden="true" className="size-4" /> Back
        </Button>
        <Button type="button" onClick={onSave} disabled={isSaving}>
          <CheckCircle2 aria-hidden="true" className="size-4" />
          {isSaving ? "Saving…" : "Save to my portfolio"}
        </Button>
      </div>
    </div>
  );
}

export { ReadyCard };
