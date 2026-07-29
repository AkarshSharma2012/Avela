/** The five Step 1 cards (spec section 12 / Milestone 10.7 redesign) — "later" closes the wizard rather than advancing it. */
export type SupportMethod = "connect_account" | "add_files" | "add_link" | "ask_confirm" | "later";

export type WizardStep = 1 | 2 | 3 | 4;

export const TOTAL_STEPS = 4;

export type WizardPersistedState = {
  open: boolean;
  step: WizardStep;
  method: SupportMethod | null;
};

export function defaultWizardState(): WizardPersistedState {
  return { open: false, step: 1, method: null };
}

export function wizardStorageKey(itemId: string): string {
  return `avela:support-wizard:${itemId}`;
}
