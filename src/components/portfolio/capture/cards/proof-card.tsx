"use client";

import { ArrowLeft, ArrowRight, Lock, Users, Share2, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CaptureDraft } from "@/lib/portfolio/capture/types";
import type { EvidenceChoice } from "@/components/portfolio/capture/flow-state";

const CHOICES: { key: EvidenceChoice; label: string; hint: string; icon: typeof Lock }[] = [
  { key: "keep_private", label: "Keep this proof private", hint: "Only you can see it", icon: Lock },
  { key: "share_summary", label: "Share summary only", hint: "Reviewers see your description, not the files", icon: Users },
  { key: "share_selected", label: "Share selected evidence", hint: "Choose what a reviewer can see later", icon: Share2 },
  { key: "skip_for_now", label: "Skip for now", hint: "Add proof anytime after saving", icon: Clock },
];

/** Evidence tray shows what capture already detected — actual file upload happens after save (item must exist first), reachable immediately from Card 5's "Strengthen later." This card is about setting the sharing default, never about blocking a save on missing proof. */
function ProofCard({
  draft,
  evidenceChoice,
  onEvidenceChoiceChange,
  onBack,
  onContinue,
}: {
  draft: CaptureDraft;
  evidenceChoice: EvidenceChoice;
  onEvidenceChoiceChange: (choice: EvidenceChoice) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading text-2xl text-foreground sm:text-3xl">Proof and privacy</h2>
        <p className="mt-1 text-sm text-muted-foreground">Proof helps others understand your work. You can add it later.</p>
      </div>

      <div className="rounded-md border border-border bg-card px-4 py-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Evidence tray</p>
        {draft.detectedEvidence.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No evidence detected yet — that&apos;s okay, you can add proof anytime.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {draft.detectedEvidence.map((e, i) => (
              <li key={i} className="text-sm text-foreground">
                {e.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {CHOICES.map(({ key, label, hint, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onEvidenceChoiceChange(key)}
            aria-pressed={evidenceChoice === key}
            className={cn(
              "flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3.5 text-left transition-all duration-[var(--duration-fast)] hover:-translate-y-0.5 hover:border-primary/40",
              "aria-pressed:border-primary aria-pressed:bg-primary/5",
              "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            )}
          >
            <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
            <span>
              <span className="block text-sm font-medium text-foreground">{label}</span>
              <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="size-4" /> Back
        </Button>
        <Button type="button" onClick={onContinue}>
          Continue <ArrowRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export { ProofCard };
