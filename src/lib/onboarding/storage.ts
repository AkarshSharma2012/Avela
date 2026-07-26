import { EMPTY_DRAFT, type OnboardingDraft } from "@/lib/onboarding/draft";

// Bump if OnboardingDraft's shape changes in a way that would make an old,
// cached draft unsafe to merge in as-is.
const STORAGE_KEY = "avela:onboarding-draft:v1";

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/** Reads the saved draft, if any. Never throws — corrupt data is discarded. */
export function loadDraft(): OnboardingDraft | null {
  if (!hasLocalStorage()) return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    // Merge over EMPTY_DRAFT so a draft saved before a field was added
    // still loads with a safe default for that field.
    return { ...EMPTY_DRAFT, ...parsed };
  } catch {
    return null;
  }
}

/** Persists the draft so a page refresh mid-onboarding doesn't lose it. */
export function saveDraft(draft: OnboardingDraft): void {
  if (!hasLocalStorage()) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage full or unavailable (e.g. private browsing) — the student can
    // still finish onboarding in this session, they just won't survive a
    // refresh. Not worth surfacing as an error.
  }
}

/** Clears the saved draft, e.g. once onboarding completes successfully. */
export function clearDraft(): void {
  if (!hasLocalStorage()) return;

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore — nothing meaningful to recover from here.
  }
}
