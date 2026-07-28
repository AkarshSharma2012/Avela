"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BellRing, HandHelping, ThumbsUp, Undo2, X } from "lucide-react";

import { startApplicationPlan } from "@/lib/applications/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DISMISS_REASONS } from "@/lib/opportunities/constants";
import {
  dismissOpportunity,
  markMoreLikeThis,
  remindMeLater,
  undoRecommendationFeedback,
} from "@/lib/opportunities/feedback-actions";
import { cn } from "@/lib/utils";
import type { RecommendationFeedbackReason } from "@/types/database";

export type RecommendationFeedbackState = {
  moreLikeThis: boolean;
  remindLater: boolean;
  helpMeApply: boolean;
};

/**
 * The "why" side of the recommendation loop: dismiss with a reason,
 * "more like this", "help me apply", and "remind me later" — every click
 * writes a `recommendation_feedback` row (see feedback-actions.ts) that
 * ranking.ts/discovery-sources.ts read back on future batches. A
 * successful dismiss replaces this whole control with a confirmation +
 * undo, matching how the card disappears from future batches (a
 * dismissed opportunity is filtered out server-side before this
 * component ever mounts again).
 */
function RecommendationFeedbackControls({
  opportunityId,
  initialState,
  applicationUrl,
}: {
  opportunityId: string;
  initialState: RecommendationFeedbackState;
  applicationUrl?: string | null;
}) {
  const [state, setState] = useState(initialState);
  const [dismissed, setDismissed] = useState(false);
  const [showReasons, setShowReasons] = useState(false);
  const [reason, setReason] = useState<RecommendationFeedbackReason | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [planId, setPlanId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleMoreLikeThis() {
    const next = !state.moreLikeThis;
    setState((prev) => ({ ...prev, moreLikeThis: next }));
    startTransition(async () => {
      const result = next
        ? await markMoreLikeThis(opportunityId)
        : await undoRecommendationFeedback(opportunityId, "more_like_this");
      if (result.error) {
        setState((prev) => ({ ...prev, moreLikeThis: !next }));
        setAnnouncement(result.error);
        return;
      }
      setAnnouncement(next ? "Thanks — we'll show more like this." : "Undone.");
    });
  }

  function toggleRemindLater() {
    const next = !state.remindLater;
    setState((prev) => ({ ...prev, remindLater: next }));
    startTransition(async () => {
      const result = next
        ? await remindMeLater(opportunityId)
        : await undoRecommendationFeedback(opportunityId, "remind_later");
      if (result.error) {
        setState((prev) => ({ ...prev, remindLater: !next }));
        setAnnouncement(result.error);
        return;
      }
      setAnnouncement(next ? "We'll remind you before the deadline." : "Reminder cancelled.");
    });
  }

  function handleHelpMeApply() {
    // Opened synchronously in the click handler, before the transition
    // starts, so it's never blocked as a non-user-initiated popup.
    if (applicationUrl) window.open(applicationUrl, "_blank", "noopener,noreferrer");
    setState((prev) => ({ ...prev, helpMeApply: true }));
    startTransition(async () => {
      const result = await startApplicationPlan(opportunityId);
      if (result.error) {
        setState((prev) => ({ ...prev, helpMeApply: false }));
        setAnnouncement(result.error);
        return;
      }
      if (result.planId) setPlanId(result.planId);
      setAnnouncement("Added to My Applications — good luck!");
    });
  }

  function confirmDismiss() {
    if (!reason) return;
    startTransition(async () => {
      const result = await dismissOpportunity(opportunityId, reason);
      if (result.error) {
        setAnnouncement(result.error);
        return;
      }
      setDismissed(true);
      setShowReasons(false);
      setAnnouncement("Got it — you won't see this again.");
    });
  }

  function undoDismiss() {
    startTransition(async () => {
      const result = await undoRecommendationFeedback(opportunityId, "dismissed");
      if (result.error) {
        setAnnouncement(result.error);
        return;
      }
      setDismissed(false);
      setReason(null);
      setAnnouncement("Restored.");
    });
  }

  if (dismissed) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border bg-secondary px-3 py-2 text-xs text-muted-foreground">
        <span>Marked as not for me.</span>
        <Button type="button" variant="ghost" size="xs" onClick={undoDismiss} disabled={isPending}>
          <Undo2 aria-hidden="true" className="size-3" />
          Undo
        </Button>
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setShowReasons((v) => !v)}
          aria-expanded={showReasons}
          disabled={isPending}
        >
          <X aria-hidden="true" className="size-3" />
          Not for me
        </Button>
        <Button
          type="button"
          variant={state.moreLikeThis ? "secondary" : "ghost"}
          size="xs"
          onClick={toggleMoreLikeThis}
          aria-pressed={state.moreLikeThis}
          disabled={isPending}
        >
          <ThumbsUp aria-hidden="true" className={cn("size-3", state.moreLikeThis && "fill-current")} />
          More like this
        </Button>
        <Button
          type="button"
          variant={state.remindLater ? "secondary" : "ghost"}
          size="xs"
          onClick={toggleRemindLater}
          aria-pressed={state.remindLater}
          disabled={isPending}
        >
          <BellRing aria-hidden="true" className={cn("size-3", state.remindLater && "fill-current")} />
          Remind me later
        </Button>
        {state.helpMeApply ? (
          <Link
            href={planId ? `/applications/${planId}` : "/applications"}
            className={cn(buttonVariants({ variant: "secondary", size: "xs" }))}
          >
            <HandHelping aria-hidden="true" className="size-3" />
            Continue application
          </Link>
        ) : (
          <Button type="button" variant="ghost" size="xs" onClick={handleHelpMeApply} disabled={isPending}>
            <HandHelping aria-hidden="true" className="size-3" />
            Help me apply
          </Button>
        )}
      </div>

      {showReasons && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-secondary px-3 py-2.5">
          <p className="text-xs font-medium text-foreground">Why isn&apos;t this a fit?</p>
          <RadioGroup value={reason ?? undefined} onValueChange={(value) => setReason(value as RecommendationFeedbackReason)}>
            {DISMISS_REASONS.map((option) => (
              <RadioGroupItem key={option.value} value={option.value} className="px-2.5 py-1 text-xs">
                {option.label}
              </RadioGroupItem>
            ))}
          </RadioGroup>
          <div className="flex items-center gap-2">
            <Button type="button" variant="default" size="xs" onClick={confirmDismiss} disabled={!reason || isPending}>
              Dismiss
            </Button>
            <Button type="button" variant="ghost" size="xs" onClick={() => setShowReasons(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

export { RecommendationFeedbackControls };
