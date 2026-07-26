import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_DRAFT, type OnboardingDraft } from "@/lib/onboarding/draft";
import { clearDraft, loadDraft, saveDraft } from "@/lib/onboarding/storage";

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

describe("onboarding draft storage", () => {
  let memoryStorage: MemoryStorage;

  beforeEach(() => {
    memoryStorage = new MemoryStorage();
    vi.stubGlobal("window", { localStorage: memoryStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when nothing has been saved", () => {
    expect(loadDraft()).toBeNull();
  });

  it("round-trips a saved draft", () => {
    const draft: OnboardingDraft = {
      ...EMPTY_DRAFT,
      step: 2,
      preferredName: "Riley",
      gradeLevel: 10,
      interests: ["Technology"],
      goals: ["Build a resume"],
    };

    saveDraft(draft);
    expect(loadDraft()).toEqual(draft);
  });

  it("survives a refresh (a fresh loadDraft call after save)", () => {
    saveDraft({ ...EMPTY_DRAFT, step: 4, preferredName: "Sam" });
    const reloaded = loadDraft();
    expect(reloaded?.step).toBe(4);
    expect(reloaded?.preferredName).toBe("Sam");
  });

  it("clears the saved draft", () => {
    saveDraft({ ...EMPTY_DRAFT, preferredName: "Alex" });
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it("discards corrupt JSON instead of throwing", () => {
    memoryStorage.setItem("avela:onboarding-draft:v1", "{not valid json");
    expect(loadDraft()).toBeNull();
  });

  it("returns null when localStorage is unavailable (e.g. SSR)", () => {
    vi.stubGlobal("window", undefined);
    expect(loadDraft()).toBeNull();
    expect(() => saveDraft(EMPTY_DRAFT)).not.toThrow();
    expect(() => clearDraft()).not.toThrow();
  });
});
