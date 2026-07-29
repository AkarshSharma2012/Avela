import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listUsersMock = vi.fn();
const deleteUserMock = vi.fn();
const getUserByIdMock = vi.fn();

const fakeSupabase = {
  auth: { admin: { listUsers: listUsersMock, deleteUser: deleteUserMock, getUserById: getUserByIdMock } },
};

vi.mock("@/lib/e2e/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/e2e/config")>();
  return {
    ...actual,
    createE2eServiceRoleClient: vi.fn(() => fakeSupabase),
  };
});

import { cleanupE2ePersonas, deleteSingleE2eUser } from "@/lib/e2e/cleanup";

const E2E_USER = { id: "e2e-1", email: "e2e+digital_creator-ab12cd34@e2e.avela.invalid", user_metadata: { e2e_test: true, persona: "digital_creator" } };
const REAL_USER = { id: "real-1", email: "meenasharma17@gmail.com", user_metadata: {} };
const SPOOFED_EMAIL_ONLY = { id: "spoof-1", email: "someone@e2e.avela.invalid", user_metadata: { e2e_test: false } };
const SPOOFED_METADATA_ONLY = { id: "spoof-2", email: "someone@gmail.com", user_metadata: { e2e_test: true } };

beforeEach(() => {
  vi.stubEnv("ALLOW_E2E_TEST_USERS", "true");
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("cleanupE2ePersonas — only ever matches BOTH markers", () => {
  it("identifies only users with both the synthetic email domain AND the e2e_test metadata flag", async () => {
    listUsersMock.mockResolvedValue({
      data: { users: [E2E_USER, REAL_USER, SPOOFED_EMAIL_ONLY, SPOOFED_METADATA_ONLY] },
      error: null,
    });

    const { candidates } = await cleanupE2ePersonas({ dryRun: true });

    expect(candidates.map((c) => c.userId)).toEqual(["e2e-1"]);
  });

  it("never touches the real user's data even if it appears in the same page of results", async () => {
    listUsersMock.mockResolvedValue({ data: { users: [E2E_USER, REAL_USER] }, error: null });
    deleteUserMock.mockResolvedValue({ error: null });
    const { deleted } = await cleanupE2ePersonas({ dryRun: false });
    expect(deleted.map((d) => d.userId)).not.toContain("real-1");
    expect(deleteUserMock).not.toHaveBeenCalledWith("real-1");
  });
});

describe("dry-run mode", () => {
  it("reports candidates but never calls deleteUser", async () => {
    listUsersMock.mockResolvedValue({ data: { users: [E2E_USER] }, error: null });
    const result = await cleanupE2ePersonas({ dryRun: true });
    expect(result.candidates.length).toBe(1);
    expect(result.deleted).toEqual([]);
    expect(deleteUserMock).not.toHaveBeenCalled();
  });
});

describe("real run", () => {
  it("deletes every matched candidate", async () => {
    listUsersMock.mockResolvedValue({ data: { users: [E2E_USER] }, error: null });
    deleteUserMock.mockResolvedValue({ error: null });
    const result = await cleanupE2ePersonas({ dryRun: false });
    expect(result.deleted.map((d) => d.userId)).toEqual(["e2e-1"]);
    expect(deleteUserMock).toHaveBeenCalledWith("e2e-1");
  });

  it("collects a per-user error without aborting the rest of the batch", async () => {
    const secondUser = { ...E2E_USER, id: "e2e-2", email: "e2e+maker-zz99@e2e.avela.invalid" };
    listUsersMock.mockResolvedValue({ data: { users: [E2E_USER, secondUser] }, error: null });
    deleteUserMock.mockResolvedValueOnce({ error: { message: "boom" } }).mockResolvedValueOnce({ error: null });
    const result = await cleanupE2ePersonas({ dryRun: false });
    expect(result.errors.length).toBe(1);
    expect(result.deleted.length).toBe(1);
  });
});

describe("idempotency", () => {
  it("a second run finds nothing left and returns an empty, error-free result", async () => {
    listUsersMock.mockResolvedValueOnce({ data: { users: [E2E_USER] }, error: null });
    deleteUserMock.mockResolvedValue({ error: null });
    await cleanupE2ePersonas({ dryRun: false });

    listUsersMock.mockResolvedValueOnce({ data: { users: [] }, error: null });
    const second = await cleanupE2ePersonas({ dryRun: false });
    expect(second.candidates).toEqual([]);
    expect(second.deleted).toEqual([]);
    expect(second.errors).toEqual([]);
  });
});

describe("deleteSingleE2eUser — used by the Playwright per-test teardown", () => {
  it("deletes a genuine E2E user by id", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: E2E_USER }, error: null });
    deleteUserMock.mockResolvedValue({ error: null });
    const result = await deleteSingleE2eUser("e2e-1");
    expect(result.error).toBeNull();
    expect(deleteUserMock).toHaveBeenCalledWith("e2e-1");
  });

  it("re-verifies both markers server-side and refuses to delete a non-E2E user even if asked to by id", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: REAL_USER }, error: null });
    const result = await deleteSingleE2eUser("real-1");
    expect(result.error).toMatch(/not marked as an E2E test account/);
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("refuses to delete a user matching only one of the two markers", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: SPOOFED_EMAIL_ONLY }, error: null });
    const result = await deleteSingleE2eUser("spoof-1");
    expect(result.error).toMatch(/not marked/);
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("does not affect other concurrently-seeded personas — only the targeted id is ever touched", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: E2E_USER }, error: null });
    deleteUserMock.mockResolvedValue({ error: null });
    await deleteSingleE2eUser("e2e-1");
    expect(listUsersMock).not.toHaveBeenCalled();
    expect(deleteUserMock).toHaveBeenCalledTimes(1);
  });
});

describe("pagination", () => {
  it("paginates through every page of users rather than assuming a single page", async () => {
    const fullPage = Array.from({ length: 200 }, (_, i) => ({ ...E2E_USER, id: `page1-${i}`, email: `e2e+p1-${i}@e2e.avela.invalid` }));
    const secondPage = [{ ...E2E_USER, id: "page2-0", email: "e2e+p2-0@e2e.avela.invalid" }];
    listUsersMock.mockResolvedValueOnce({ data: { users: fullPage }, error: null }).mockResolvedValueOnce({ data: { users: secondPage }, error: null });

    const { candidates } = await cleanupE2ePersonas({ dryRun: true });

    expect(candidates.length).toBe(201);
    expect(listUsersMock).toHaveBeenCalledTimes(2);
  });
});
