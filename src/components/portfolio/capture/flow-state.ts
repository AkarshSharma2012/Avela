/**
 * Local (browser-only) state for the guided capture flow — persisted to
 * sessionStorage so a refresh or accidental navigation never silently loses
 * a student's work ("visible autosave state" / spec Part 2). Nothing here
 * reaches the server until the explicit "Save to my portfolio" action on
 * Card 5; this is deliberately separate from the server-side autosave some
 * other Avela flows use, since a portfolio item shouldn't exist in the
 * database until the student has actually gotten through "Your Part."
 *
 * Same useSyncExternalStore + module-level cache shape as
 * src/components/verification/wizard/use-wizard-state.ts, for the same
 * reason: it's the SSR-safe way to read sessionStorage-backed state
 * without a setState-in-effect render cascade on mount.
 */

"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { CaptureDraft, CaptureMethod } from "@/lib/portfolio/capture/types";

export type CardStep = 1 | 2 | 3 | 4 | 5;
export const TOTAL_CARDS = 5;

export type EvidenceChoice = "keep_private" | "share_summary" | "share_selected" | "skip_for_now";

export type GuidedFlowState = {
  step: CardStep;
  captureMethod: CaptureMethod | null;
  draft: CaptureDraft | null;
  yourPart: string;
  whyYouDidIt: string;
  evidenceChoice: EvidenceChoice;
  savedItemId: string | null;
};

const STORAGE_KEY = "avela-passport-capture-draft";

export function initialFlowState(): GuidedFlowState {
  return {
    step: 1,
    captureMethod: null,
    draft: null,
    yourPart: "",
    whyYouDidIt: "",
    evidenceChoice: "keep_private",
    savedItemId: null,
  };
}

const listeners = new Set<() => void>();
let cachedValue: GuidedFlowState = initialFlowState();
let cachedFromStorage = false;

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function notify() {
  for (const listener of listeners) listener();
}

function readFromStorage(): GuidedFlowState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return initialFlowState();
    return { ...initialFlowState(), ...(JSON.parse(raw) as Partial<GuidedFlowState>) };
  } catch {
    return initialFlowState();
  }
}

function getSnapshot(): GuidedFlowState {
  if (!cachedFromStorage) {
    cachedFromStorage = true;
    cachedValue = readFromStorage();
  }
  return cachedValue;
}

// A single stable reference, never recreated — useSyncExternalStore requires
// getServerSnapshot to return referentially-equal output when nothing has
// changed, or React can loop re-rendering forever. Never mutated; only
// cachedValue (the real client-side store) changes after hydration.
const SERVER_SNAPSHOT: GuidedFlowState = initialFlowState();

function getServerSnapshot(): GuidedFlowState {
  return SERVER_SNAPSHOT;
}

function writeState(next: GuidedFlowState): void {
  cachedFromStorage = true;
  cachedValue = next;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Best-effort only — an unpersisted draft is never worse than a lost one.
  }
  notify();
}

export function clearPersistedFlowState(): void {
  cachedFromStorage = true;
  cachedValue = initialFlowState();
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same best-effort reasoning as writeState.
  }
  notify();
}

/** Direction only ever describes the most recent transition, purely for choosing the slide-in animation class — set from goTo's event-handler callback, never from an effect body. */
export function useGuidedFlowState(): {
  state: GuidedFlowState;
  direction: "forward" | "back";
  update: (patch: Partial<GuidedFlowState>) => void;
  goTo: (step: CardStep) => void;
  hasUnsavedWork: boolean;
} {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  const hasUnsavedWork = state.step > 1 && state.savedItemId === null;

  useEffect(() => {
    if (!hasUnsavedWork) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedWork]);

  const update = useCallback((patch: Partial<GuidedFlowState>) => writeState({ ...getSnapshot(), ...patch }), []);

  const goTo = useCallback((step: CardStep) => {
    setDirection(step >= getSnapshot().step ? "forward" : "back");
    writeState({ ...getSnapshot(), step });
  }, []);

  return { state, direction, update, goTo, hasUnsavedWork };
}
