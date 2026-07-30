import { Clock, Lock, Share2, Users } from "lucide-react";

import { ItemTypeBadge } from "@/components/portfolio/item-type-badge";
import { cn } from "@/lib/utils";
import { resolveCategory } from "@/lib/portfolio/taxonomy";
import type { GuidedFlowState } from "@/components/portfolio/capture/flow-state";

const EVIDENCE_CHOICE_META: Record<GuidedFlowState["evidenceChoice"], { label: string; icon: typeof Lock }> = {
  keep_private: { label: "Private", icon: Lock },
  share_summary: { label: "Summary shared", icon: Users },
  share_selected: { label: "Selected evidence shared", icon: Share2 },
  skip_for_now: { label: "Not decided yet", icon: Clock },
};

/**
 * The persistent "what this is becoming" preview (spec's desktop RIGHT/
 * PREVIEW AREA + mobile drawer) — reads directly off the same flow state
 * the cards themselves write to, so it updates the instant a field changes,
 * with no separate data fetch. Never renders blank: every field has a
 * placeholder that reads as an invitation rather than an empty box.
 */
function LivePreviewCard({ state }: { state: Pick<GuidedFlowState, "draft" | "yourPart" | "evidenceChoice"> }) {
  const { draft, yourPart, evidenceChoice } = state;
  const category = resolveCategory(draft?.activityCategoryKey.value);
  const hasCategory = Boolean(draft?.activityCategoryKey.value);
  const title = draft?.title.value.trim();
  const description = draft?.description.value.trim();
  const evidenceCount = draft?.detectedEvidence.length ?? 0;
  const EvidenceIcon = EVIDENCE_CHOICE_META[evidenceChoice].icon;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card px-5 py-5 shadow-glow">
      <p className="text-xs font-medium tracking-wide text-primary uppercase">Your portfolio card</p>

      <div className="flex flex-col gap-2">
        <ItemTypeBadge itemType={category.itemTypeBucket} className={cn(!hasCategory && "opacity-50")} />
        <h3 className={cn("font-heading text-xl", title ? "text-foreground" : "text-muted-foreground italic")}>
          {title || "Your project title will appear here"}
        </h3>
        {draft?.organization.value && <p className="text-sm text-muted-foreground">{draft.organization.value}</p>}
      </div>

      <p className={cn("text-sm leading-relaxed", description ? "text-foreground" : "text-muted-foreground italic")}>
        {description || "A short description of what you did will show up here as you fill it in."}
      </p>

      <div className="rounded-lg bg-secondary/60 px-3 py-2.5">
        <p className="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">Your part</p>
        <p className={cn("mt-1 text-sm", yourPart.trim() ? "text-foreground" : "text-muted-foreground italic")}>
          {yourPart.trim() || "What you personally did will show up here."}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <span>
          {evidenceCount} piece{evidenceCount === 1 ? "" : "s"} of evidence
        </span>
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          <EvidenceIcon aria-hidden="true" className="size-3.5" />
          {EVIDENCE_CHOICE_META[evidenceChoice].label}
        </span>
      </div>
    </div>
  );
}

export { LivePreviewCard };
