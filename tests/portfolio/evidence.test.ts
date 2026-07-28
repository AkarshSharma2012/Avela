import { describe, expect, it, vi } from "vitest";

import { attachEvidenceForUser, detachEvidenceForUser, type AttachEvidenceInput } from "@/lib/portfolio/evidence";

const BASE_INPUT: AttachEvidenceInput = {
  applicationPlanId: "plan-1",
  portfolioItemId: "item-1",
  evidencePurpose: "resume",
};

describe("attachEvidenceForUser", () => {
  it("never calls attach() when signed out", async () => {
    const attach = vi.fn();
    const result = await attachEvidenceForUser(null, BASE_INPUT, attach);
    expect(result).toEqual({ success: false, error: "You need to be signed in to attach evidence." });
    expect(attach).not.toHaveBeenCalled();
  });

  it("rejects over-length notes before calling attach()", async () => {
    const attach = vi.fn();
    const result = await attachEvidenceForUser("user-1", { ...BASE_INPUT, notes: "a".repeat(1001) }, attach);
    expect(result.success).toBe(false);
    expect(attach).not.toHaveBeenCalled();
  });

  it("attaches for a signed-in user with valid input", async () => {
    const attach = vi.fn(async () => ({ linkId: "link-1", error: null }));
    const result = await attachEvidenceForUser("user-1", BASE_INPUT, attach);
    expect(result).toEqual({ success: true, linkId: "link-1" });
    expect(attach).toHaveBeenCalledExactlyOnceWith("user-1", BASE_INPUT);
  });

  it("surfaces a friendly error when attach() fails", async () => {
    const attach = vi.fn(async () => ({ linkId: null, error: "db exploded" }));
    const result = await attachEvidenceForUser("user-1", BASE_INPUT, attach);
    expect(result).toEqual({ success: false, error: "Couldn't attach that evidence. Please try again." });
  });
});

describe("detachEvidenceForUser", () => {
  it("never calls detach() when signed out", async () => {
    const detach = vi.fn();
    const result = await detachEvidenceForUser(null, "link-1", detach);
    expect(result.success).toBe(false);
    expect(detach).not.toHaveBeenCalled();
  });

  it("detaches for a signed-in user", async () => {
    const detach = vi.fn(async () => ({ error: null }));
    const result = await detachEvidenceForUser("user-1", "link-1", detach);
    expect(result).toEqual({ success: true });
    expect(detach).toHaveBeenCalledExactlyOnceWith("user-1", "link-1");
  });

  it("surfaces a friendly error when detach() fails", async () => {
    const detach = vi.fn(async () => ({ error: "db exploded" }));
    const result = await detachEvidenceForUser("user-1", "link-1", detach);
    expect(result).toEqual({ success: false, error: "Couldn't remove that evidence. Please try again." });
  });
});
