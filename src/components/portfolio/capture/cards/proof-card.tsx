"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Clock, Lock, Plus, Share2, Users, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { friendlyExtractionStatus, SOURCE_KIND_ICON } from "@/lib/portfolio/evidence-labels";
import { PlatformPanel, type PlatformSelection } from "@/components/portfolio/capture/platform-panel";
import type { CaptureDraft, DetectedEvidence } from "@/lib/portfolio/capture/types";
import type { EvidenceChoice } from "@/components/portfolio/capture/flow-state";

const CHOICES: { key: EvidenceChoice; label: string; hint: string; icon: typeof Lock }[] = [
  { key: "keep_private", label: "Keep this proof private", hint: "Only you can see it — the safe default", icon: Lock },
  { key: "share_summary", label: "Share summary only", hint: "Reviewers see your description, not the files", icon: Users },
  { key: "share_selected", label: "Share selected evidence", hint: "Choose what a reviewer can see later", icon: Share2 },
  { key: "skip_for_now", label: "Skip for now", hint: "Add proof anytime after saving", icon: Clock },
];

/** Evidence tray shows what capture already detected — actual file upload happens after save (item must exist first), reachable immediately from Card 5's "Strengthen later." This card is about setting the sharing default, never about blocking a save on missing proof. */
function ProofCard({
  draft,
  onDraftChange,
  evidenceChoice,
  onEvidenceChoiceChange,
  onBack,
  onContinue,
}: {
  draft: CaptureDraft;
  onDraftChange: (next: CaptureDraft) => void;
  evidenceChoice: EvidenceChoice;
  onEvidenceChoiceChange: (choice: EvidenceChoice) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformSelection | null>(null);
  const [linkValue, setLinkValue] = useState("");

  function removeEvidence(index: number) {
    onDraftChange({ ...draft, detectedEvidence: draft.detectedEvidence.filter((_, i) => i !== index) });
  }

  function addEvidenceFromPlatform() {
    if (!selectedPlatform || linkValue.trim().length === 0) return;
    const newEvidence: DetectedEvidence = {
      sourceKind: selectedPlatform.provider.key === "github" ? "git_repository" : "public_url",
      label: `${selectedPlatform.provider.studentFacingName}: ${linkValue.trim()}`,
      url: linkValue.trim(),
      extractionStatus: "extraction_pending",
    };
    onDraftChange({ ...draft, detectedEvidence: [...draft.detectedEvidence, newEvidence] });
    setPickerOpen(false);
    setSelectedPlatform(null);
    setLinkValue("");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading text-2xl text-foreground sm:text-3xl">Proof and privacy</h2>
        <p className="mt-1 text-sm text-muted-foreground">Proof helps others understand your work. You can add it later.</p>
      </div>

      <div className="rounded-lg border border-border bg-card px-4 py-3.5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Evidence tray</p>
        {draft.detectedEvidence.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No evidence detected yet — that&apos;s okay, you can add proof anytime.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {draft.detectedEvidence.map((e, i) => {
              const Icon = SOURCE_KIND_ICON[e.sourceKind as keyof typeof SOURCE_KIND_ICON] ?? SOURCE_KIND_ICON.unknown;
              return (
                <li key={i} className="flex items-center justify-between gap-2 rounded-md bg-secondary/50 px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                    <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                    <span className="truncate">{e.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">({friendlyExtractionStatus(e.extractionStatus)})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeEvidence(i)}
                    aria-label={`Remove ${e.label}`}
                    className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {!pickerOpen && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="mt-3 flex items-center gap-1.5 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <Plus aria-hidden="true" className="size-4" /> Add from a platform
          </button>
        )}

        {pickerOpen && selectedPlatform === null && (
          <div className="animate-fade-up mt-3 rounded-lg border border-border bg-secondary/40 px-4 py-4">
            <PlatformPanel categoryKey={draft.activityCategoryKey.value} onSelect={setSelectedPlatform} />
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="mt-3 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              Cancel
            </button>
          </div>
        )}

        {pickerOpen && selectedPlatform !== null && (
          <div className="animate-fade-up mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setSelectedPlatform(null)}
              className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              <ArrowLeft aria-hidden="true" className="size-3.5" /> Choose a different platform
            </button>
            <Label htmlFor="proof-platform-link">{selectedPlatform.provider.studentFacingName} link</Label>
            <div className="flex gap-2">
              <Input id="proof-platform-link" type="url" value={linkValue} onChange={(e) => setLinkValue(e.target.value)} className="flex-1" />
              <Button type="button" onClick={addEvidenceFromPlatform} disabled={linkValue.trim().length === 0}>
                Add
              </Button>
            </div>
          </div>
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
              "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
              key === "keep_private" && "sm:col-span-2"
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
