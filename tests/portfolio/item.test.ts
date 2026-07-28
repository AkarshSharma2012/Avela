import { describe, expect, it, vi } from "vitest";

import {
  createPortfolioItemForUser,
  deletePortfolioItemForUser,
  setPortfolioItemVisibilityForUser,
  updatePortfolioItemForUser,
  type PortfolioItemFields,
} from "@/lib/portfolio/item";

const BASE_FIELDS: PortfolioItemFields = {
  itemType: "activity",
  title: "Debate Team",
  skills: ["Public speaking", "Public speaking", "  "],
  tags: ["stem"],
};

describe("createPortfolioItemForUser", () => {
  it("never calls create() when signed out", async () => {
    const create = vi.fn();
    const result = await createPortfolioItemForUser(null, BASE_FIELDS, create);
    expect(result).toEqual({ success: false, error: "You need to be signed in to add a portfolio item." });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an invalid title before calling create()", async () => {
    const create = vi.fn();
    const result = await createPortfolioItemForUser("user-1", { ...BASE_FIELDS, title: "" }, create);
    expect(result.success).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects 'still doing this' paired with a fixed end date before calling create()", async () => {
    const create = vi.fn();
    const result = await createPortfolioItemForUser(
      "user-1",
      { ...BASE_FIELDS, isCurrent: true, endDate: "2026-08-01" },
      create
    );
    expect(result.success).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("normalizes skills (trim, dedupe) and title (trim) before calling create()", async () => {
    const create = vi.fn(async () => ({ itemId: "item-1", error: null }));
    const result = await createPortfolioItemForUser("user-1", { ...BASE_FIELDS, title: "  Debate Team  " }, create);

    expect(result).toEqual({ success: true, itemId: "item-1" });
    expect(create).toHaveBeenCalledExactlyOnceWith(
      "user-1",
      expect.objectContaining({ title: "Debate Team", skills: ["Public speaking"], tags: ["stem"] })
    );
  });

  it("surfaces a friendly error when create() fails", async () => {
    const create = vi.fn(async () => ({ itemId: null, error: "db exploded" }));
    const result = await createPortfolioItemForUser("user-1", BASE_FIELDS, create);
    expect(result).toEqual({ success: false, error: "Couldn't save that item. Please try again." });
  });
});

describe("updatePortfolioItemForUser", () => {
  it("never calls write() when signed out", async () => {
    const write = vi.fn();
    const result = await updatePortfolioItemForUser(null, "item-1", { title: "New title" }, write);
    expect(result.success).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it("only validates fields actually present in a partial update", async () => {
    const write = vi.fn(async () => ({ error: null }));
    const result = await updatePortfolioItemForUser("user-1", "item-1", { outcome: "Won regionals" }, write);
    expect(result).toEqual({ success: true });
    expect(write).toHaveBeenCalledExactlyOnceWith("user-1", "item-1", { outcome: "Won regionals" });
  });

  it("rejects an invalid partial update before calling write()", async () => {
    const write = vi.fn();
    const result = await updatePortfolioItemForUser("user-1", "item-1", { url: "javascript:alert(1)" }, write);
    expect(result.success).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it("surfaces a friendly error when write() fails", async () => {
    const write = vi.fn(async () => ({ error: "constraint violation" }));
    const result = await updatePortfolioItemForUser("user-1", "item-1", { title: "x" }, write);
    expect(result).toEqual({ success: false, error: "Couldn't save your changes. Please try again." });
  });

  it("normalizes any accepted GitHub username format down to a bare username before calling write()", async () => {
    const write = vi.fn(async () => ({ error: null }));
    const result = await updatePortfolioItemForUser(
      "user-1",
      "item-1",
      { githubUsername: "https://github.com/AkarshSharma2012" },
      write
    );
    expect(result).toEqual({ success: true });
    expect(write).toHaveBeenCalledExactlyOnceWith("user-1", "item-1", { githubUsername: "AkarshSharma2012" });
  });

  it("rejects a GitHub username that can't be normalized before calling write()", async () => {
    const write = vi.fn();
    const result = await updatePortfolioItemForUser("user-1", "item-1", { githubUsername: "not a username!!" }, write);
    expect(result.success).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
});

describe("setPortfolioItemVisibilityForUser", () => {
  it("never calls write() when signed out", async () => {
    const write = vi.fn();
    const result = await setPortfolioItemVisibilityForUser(null, "item-1", "archived", write);
    expect(result.success).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it("archives and restores for a signed-in user", async () => {
    const write = vi.fn(async () => ({ error: null }));
    const archived = await setPortfolioItemVisibilityForUser("user-1", "item-1", "archived", write);
    expect(archived).toEqual({ success: true });
    expect(write).toHaveBeenCalledWith("user-1", "item-1", "archived");

    const restored = await setPortfolioItemVisibilityForUser("user-1", "item-1", "visible", write);
    expect(restored).toEqual({ success: true });
    expect(write).toHaveBeenCalledWith("user-1", "item-1", "visible");
  });
});

describe("deletePortfolioItemForUser", () => {
  it("never calls remove() when signed out", async () => {
    const remove = vi.fn();
    const result = await deletePortfolioItemForUser(null, "item-1", remove);
    expect(result.success).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes for a signed-in user", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    const result = await deletePortfolioItemForUser("user-1", "item-1", remove);
    expect(result).toEqual({ success: true });
    expect(remove).toHaveBeenCalledExactlyOnceWith("user-1", "item-1");
  });

  it("surfaces a friendly error when remove() fails", async () => {
    const remove = vi.fn(async () => ({ error: "db exploded" }));
    const result = await deletePortfolioItemForUser("user-1", "item-1", remove);
    expect(result).toEqual({ success: false, error: "Couldn't remove this item. Please try again." });
  });
});
