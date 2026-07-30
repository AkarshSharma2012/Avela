"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye } from "lucide-react";

import { cn } from "@/lib/utils";
import { Drawer } from "@/components/ui/drawer";
import { captureFromInputAction, saveGuidedCaptureAction } from "@/lib/portfolio/capture/actions";
import { emptyManualDraft } from "@/lib/portfolio/capture/empty-draft";
import type { CaptureInput } from "@/lib/portfolio/capture/types";
import { CaptureCard } from "@/components/portfolio/capture/cards/capture-card";
import { DraftCard } from "@/components/portfolio/capture/cards/draft-card";
import { YourPartCard } from "@/components/portfolio/capture/cards/your-part-card";
import { ProofCard } from "@/components/portfolio/capture/cards/proof-card";
import { ReadyCard } from "@/components/portfolio/capture/cards/ready-card";
import { LivePreviewCard } from "@/components/portfolio/capture/live-preview-card";
import { StorySignal } from "@/components/portfolio/capture/story-signal";
import { clearPersistedFlowState, TOTAL_CARDS, useGuidedFlowState, type CardStep } from "@/components/portfolio/capture/flow-state";
import { resolveCategory } from "@/lib/portfolio/taxonomy";
import { getYourPartPrompt } from "@/lib/portfolio/capture/category-prompts";

const CARD_LABELS: Record<CardStep, string> = {
  1: "Capture",
  2: "Draft",
  3: "Your part",
  4: "Proof",
  5: "Ready",
};

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable;
}

/** The card-stack shell (spec Part 2): one card in focus, progress indicator, directional slide via a remount key, keyboard navigation, unsaved-change protection. */
function GuidedCaptureFlow() {
  const router = useRouter();
  const { state, direction, update, goTo, hasUnsavedWork } = useGuidedFlowState();
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [yourPartError, setYourPartError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canGoBack = state.step > 1 && state.savedItemId === null;

  /**
   * goTo() alone never touches browser history — pushState here is what
   * makes the browser's own Back button step back one card instead of
   * leaving /portfolio/new entirely (spec: "browser-back behavior"). Only
   * called for a real forward/manual step change, never from the
   * popstate handler itself (that would push right back on top of the
   * entry the user just navigated to).
   */
  const goToCard = useCallback(
    (step: CardStep) => {
      goTo(step);
      if (typeof window !== "undefined") window.history.pushState({ step }, "", window.location.href);
    },
    [goTo]
  );

  const goBack = useCallback(() => {
    if (state.step > 1) goToCard((state.step - 1) as CardStep);
  }, [goToCard, state.step]);

  // Establishes a baseline history entry carrying step 1's state, so the
  // very first popstate (from a pushed step-2 entry back to page load)
  // has a well-defined event.state.step rather than null.
  useEffect(() => {
    if (typeof window !== "undefined") window.history.replaceState({ step: state.step }, "", window.location.href);
    // Only on mount — later steps are tracked via goToCard's own pushState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableElement(document.activeElement)) return;
      if (event.key === "ArrowLeft" && canGoBack) goBack();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canGoBack, goBack]);

  useEffect(() => {
    function handlePopState(event: PopStateEvent) {
      const targetStep = (event.state?.step as CardStep | undefined) ?? 1;
      goTo(targetStep);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [goTo]);

  async function handleCapture(input: CaptureInput) {
    setIsCapturing(true);
    setCaptureError(null);
    try {
      const draft = await captureFromInputAction(input);
      update({ draft, captureMethod: input.method });
      goToCard(2);
    } catch {
      setCaptureError("We couldn't process that just now — you can still continue and fill this in yourself.");
      update({ draft: emptyManualDraft() });
      goToCard(2);
    } finally {
      setIsCapturing(false);
    }
  }

  function handleSkip() {
    update({ draft: emptyManualDraft(), captureMethod: null });
    goToCard(2);
  }

  function handleYourPartContinue() {
    if (state.yourPart.trim().length === 0) {
      setYourPartError("Tell us what part was yours — a sentence or two is enough.");
      return;
    }
    setYourPartError(null);
    goToCard(4);
  }

  async function handleSave() {
    if (!state.draft) return;
    setIsSaving(true);
    setSaveError(null);
    const result = await saveGuidedCaptureAction({
      itemId: state.savedItemId,
      title: state.draft.title.value,
      activityCategoryKey: state.draft.activityCategoryKey.value,
      organization: state.draft.organization.value,
      description: state.draft.description.value,
      startDate: state.draft.startDate.value,
      skills: state.draft.skills.value,
      yourPart: state.yourPart,
      whyYouDidIt: state.whyYouDidIt,
    });
    setIsSaving(false);

    if ("error" in result && result.error) {
      setSaveError(result.error);
      return;
    }

    const itemId = "itemId" in result ? result.itemId : state.savedItemId;
    if (itemId) {
      update({ savedItemId: itemId });
      clearPersistedFlowState();
      router.push(`/portfolio/items/${itemId}`);
    }
  }

  function canJumpTo(step: CardStep) {
    return step < state.step && state.savedItemId === null;
  }

  const cardContent = (
    <>
      {state.step === 1 && <CaptureCard onCapture={handleCapture} onSkip={handleSkip} isSubmitting={isCapturing} error={captureError} />}

      {state.step === 2 && state.draft && (
        <DraftCard draft={state.draft} onChange={(draft) => update({ draft })} onBack={() => goToCard(1)} onContinue={() => goToCard(3)} />
      )}

      {state.step === 3 && state.draft && (
        <YourPartCard
          prompt={getYourPartPrompt(
            state.draft.activityCategoryKey.value ? resolveCategory(state.draft.activityCategoryKey.value).passionGroup : null
          )}
          passionGroup={state.draft.activityCategoryKey.value ? resolveCategory(state.draft.activityCategoryKey.value).passionGroup : null}
          yourPart={state.yourPart}
          onYourPartChange={(yourPart) => update({ yourPart })}
          whyYouDidIt={state.whyYouDidIt}
          onWhyChange={(whyYouDidIt) => update({ whyYouDidIt })}
          error={yourPartError}
          onBack={() => goToCard(2)}
          onContinue={handleYourPartContinue}
        />
      )}

      {state.step === 4 && state.draft && (
        <ProofCard
          draft={state.draft}
          onDraftChange={(draft) => update({ draft })}
          evidenceChoice={state.evidenceChoice}
          onEvidenceChoiceChange={(evidenceChoice) => update({ evidenceChoice })}
          onBack={() => goToCard(3)}
          onContinue={() => goToCard(5)}
        />
      )}

      {state.step === 5 && state.draft && (
        <ReadyCard draft={state.draft} yourPart={state.yourPart} isSaving={isSaving} error={saveError} onBack={() => goToCard(4)} onSave={handleSave} />
      )}
    </>
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:py-12 lg:px-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-8">
        <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-secondary/30 px-5 py-4 sm:px-8">
            <ol className="flex items-center gap-1.5 sm:gap-2" aria-label="Progress">
              {([1, 2, 3, 4, 5] as const).map((step) => {
                const isCurrent = step === state.step;
                const isDone = step < state.step;
                const clickable = canJumpTo(step);
                const circle = (
                  <span
                    aria-current={isCurrent ? "step" : undefined}
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors duration-[var(--duration-fast)]",
                      isCurrent && "border-primary bg-primary text-primary-foreground shadow-sm",
                      isDone && !isCurrent && "border-primary/40 bg-primary/10 text-primary",
                      !isCurrent && !isDone && "border-border bg-secondary text-muted-foreground"
                    )}
                  >
                    {isDone ? <Check aria-hidden="true" className="size-3.5" /> : step}
                  </span>
                );
                return (
                  <li key={step} className={cn("flex items-center gap-1.5 sm:gap-2", step < TOTAL_CARDS && "flex-1")}>
                    {clickable ? (
                      <button
                        type="button"
                        onClick={() => goToCard(step)}
                        className="flex shrink-0 items-center rounded-full focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                        aria-label={`Go back to ${CARD_LABELS[step]}`}
                      >
                        {circle}
                      </button>
                    ) : (
                      circle
                    )}
                    <span
                      className={cn(
                        "shrink-0 text-[0.65rem] sm:text-xs",
                        isCurrent ? "font-semibold text-foreground" : "hidden text-muted-foreground sm:inline"
                      )}
                    >
                      {CARD_LABELS[step]}
                    </span>
                    {step < TOTAL_CARDS && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "h-0.5 min-w-3 flex-1 rounded-full transition-colors duration-[var(--duration-page)]",
                          isDone ? "bg-primary/50" : "bg-border"
                        )}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
            <StorySignal step={state.step} className="mt-3" />
          </div>

          <div
            key={`${state.step}-${direction}`}
            className={cn(
              "px-5 py-6 sm:px-8 sm:py-8",
              direction === "forward" ? "animate-card-slide-in-forward" : "animate-card-slide-in-back"
            )}
          >
            {cardContent}
          </div>
        </div>

        <div className="hidden lg:sticky lg:top-8 lg:block">
          <LivePreviewCard state={state} />
        </div>
      </div>

      <div className="lg:hidden">
        <Drawer
          title="Preview your portfolio card"
          trigger={
            <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm">
              <Eye aria-hidden="true" className="size-4 text-primary" />
              Preview your portfolio card
            </span>
          }
        >
          <LivePreviewCard state={state} />
        </Drawer>
      </div>

      {hasUnsavedWork && <p className="text-center text-xs text-muted-foreground">Your progress is saved in this browser until you finish.</p>}
    </div>
  );
}

export { GuidedCaptureFlow };
