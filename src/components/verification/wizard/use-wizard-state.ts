"use client";

import { useCallback, useSyncExternalStore } from "react";

import { defaultWizardState, wizardStorageKey, type WizardPersistedState } from "@/components/verification/wizard/types";

// Same external-store shape as SupportThisEntryPrompt used for its
// sessionStorage dismissal flag — the wizard's open/step/method state is
// just a richer object, so it needs its own cache (useSyncExternalStore
// requires getSnapshot to return a stable reference when nothing changed).
const listeners = new Set<() => void>();
let cachedItemId: string | null = null;
let cachedValue: WizardPersistedState = defaultWizardState();

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function notify() {
  for (const listener of listeners) listener();
}

function readFromStorage(itemId: string): WizardPersistedState {
  try {
    const raw = sessionStorage.getItem(wizardStorageKey(itemId));
    if (!raw) return defaultWizardState();
    const parsed = JSON.parse(raw) as Partial<WizardPersistedState>;
    return { open: Boolean(parsed.open), step: parsed.step ?? 1, method: parsed.method ?? null };
  } catch {
    return defaultWizardState();
  }
}

function getSnapshot(itemId: string): WizardPersistedState {
  if (cachedItemId !== itemId) {
    cachedItemId = itemId;
    cachedValue = readFromStorage(itemId);
  }
  return cachedValue;
}

function getServerSnapshot(): WizardPersistedState {
  return defaultWizardState();
}

function writeState(itemId: string, next: WizardPersistedState): void {
  cachedItemId = itemId;
  cachedValue = next;
  try {
    sessionStorage.setItem(wizardStorageKey(itemId), JSON.stringify(next));
  } catch {
    // sessionStorage can be unavailable (private browsing, quota) — losing step position is fine, never worth surfacing an error for.
  }
  notify();
}

/** Reads/writes the wizard's open/step/method state, kept in sessionStorage per item so leaving and returning to the page keeps a student's place. */
function useWizardState(itemId: string): [WizardPersistedState, (next: WizardPersistedState) => void] {
  const state = useSyncExternalStore(
    subscribe,
    () => getSnapshot(itemId),
    getServerSnapshot
  );
  const setState = useCallback((next: WizardPersistedState) => writeState(itemId, next), [itemId]);
  return [state, setState];
}

export { useWizardState };
