import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/roles/repository", () => ({
  createRolesServiceRoleClient: vi.fn(() => ({})),
  listRolesForUser: vi.fn(),
}));

import { listRolesForUser } from "@/lib/roles/repository";
import { hasConflictOfInterest, isAuthorizedAdminAsync, isAuthorizedReviewerAsync } from "@/lib/roles/access";

const mockListRolesForUser = vi.mocked(listRolesForUser);

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.REVIEWER_EMAILS;
});

describe("isAuthorizedReviewerAsync", () => {
  it("authorizes via the env allowlist without even checking the database", async () => {
    process.env.REVIEWER_EMAILS = "reviewer@school.edu";
    const result = await isAuthorizedReviewerAsync("user-1", "reviewer@school.edu");
    expect(result).toBe(true);
    expect(mockListRolesForUser).not.toHaveBeenCalled();
  });

  it("authorizes via a reviewer role in the database when not on the allowlist", async () => {
    mockListRolesForUser.mockResolvedValueOnce(["reviewer"]);
    expect(await isAuthorizedReviewerAsync("user-1", "someone@example.com")).toBe(true);
  });

  it("authorizes a higher role (admin/owner) for a reviewer-level check", async () => {
    mockListRolesForUser.mockResolvedValueOnce(["admin"]);
    expect(await isAuthorizedReviewerAsync("user-1", "someone@example.com")).toBe(true);
  });

  it("denies when neither the allowlist nor the database grants reviewer access", async () => {
    mockListRolesForUser.mockResolvedValueOnce(["student"]);
    expect(await isAuthorizedReviewerAsync("user-1", "someone@example.com")).toBe(false);
  });

  it("falls back to false (never throws) when the role lookup itself fails", async () => {
    mockListRolesForUser.mockRejectedValueOnce(new Error("db unavailable"));
    await expect(isAuthorizedReviewerAsync("user-1", "someone@example.com")).resolves.toBe(false);
  });
});

describe("isAuthorizedAdminAsync", () => {
  it("requires admin or owner, not merely reviewer", async () => {
    mockListRolesForUser.mockResolvedValueOnce(["reviewer"]);
    expect(await isAuthorizedAdminAsync("user-1")).toBe(false);
  });

  it("authorizes admin and owner", async () => {
    mockListRolesForUser.mockResolvedValueOnce(["admin"]);
    expect(await isAuthorizedAdminAsync("user-1")).toBe(true);
  });
});

describe("hasConflictOfInterest", () => {
  it("flags a reviewer deciding their own claim", () => {
    expect(hasConflictOfInterest("user-1", "user-1")).toBe(true);
  });

  it("does not flag a reviewer deciding someone else's claim", () => {
    expect(hasConflictOfInterest("user-1", "user-2")).toBe(false);
  });
});
