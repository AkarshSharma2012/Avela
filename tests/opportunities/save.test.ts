import { describe, expect, it, vi } from "vitest";

import { saveOpportunityForUser, unsaveOpportunityForUser } from "@/lib/opportunities/save";

describe("saveOpportunityForUser", () => {
  it("never attempts a write when there is no authenticated user", async () => {
    const insert = vi.fn();

    const result = await saveOpportunityForUser(null, "opp-1", insert);

    expect(result.success).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it("writes using exactly the resolved session's user id, never a caller-supplied one", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });

    const result = await saveOpportunityForUser("user-42", "opp-1", insert);

    expect(result.success).toBe(true);
    expect(insert).toHaveBeenCalledExactlyOnceWith("user-42", "opp-1");
  });

  it("surfaces a write failure as a sanitized error, not the raw database message", async () => {
    const insert = vi.fn().mockResolvedValue({ error: "duplicate key value violates unique constraint" });

    const result = await saveOpportunityForUser("user-42", "opp-1", insert);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toMatch(/duplicate key/);
    }
  });
});

describe("unsaveOpportunityForUser", () => {
  it("never attempts a write when there is no authenticated user", async () => {
    const remove = vi.fn();

    const result = await unsaveOpportunityForUser(null, "opp-1", remove);

    expect(result.success).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes using exactly the resolved session's user id", async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });

    const result = await unsaveOpportunityForUser("user-42", "opp-1", remove);

    expect(result.success).toBe(true);
    expect(remove).toHaveBeenCalledExactlyOnceWith("user-42", "opp-1");
  });

  it("surfaces a removal failure as a sanitized error", async () => {
    const remove = vi.fn().mockResolvedValue({ error: "connection reset" });

    const result = await unsaveOpportunityForUser("user-42", "opp-1", remove);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toMatch(/connection reset/);
    }
  });
});
