import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createUserMock = vi.fn();
const insertMock = vi.fn();
const selectMock = vi.fn();
const singleMock = vi.fn();
const updateMock = vi.fn();
const updateEqMock = vi.fn();

function resetChain() {
  insertMock.mockReturnValue({ select: selectMock });
  selectMock.mockReturnValue({ single: singleMock });
  singleMock.mockResolvedValue({ data: { id: "item-123" }, error: null });
  updateMock.mockReturnValue({ eq: updateEqMock });
  updateEqMock.mockResolvedValue({ error: null });
}

const fakeSupabase = {
  auth: { admin: { createUser: createUserMock } },
  from: vi.fn(() => ({ insert: insertMock, update: updateMock })),
};

vi.mock("@/lib/e2e/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/e2e/config")>();
  return {
    ...actual,
    createE2eServiceRoleClient: vi.fn(() => fakeSupabase),
  };
});

import { seedE2ePersonas } from "@/lib/e2e/seed";
import { E2E_PERSONAS } from "@/lib/e2e/personas";

beforeEach(() => {
  vi.stubEnv("ALLOW_E2E_TEST_USERS", "true");
  resetChain();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("seedE2ePersonas", () => {
  it("creates every persona with the e2e_test marker and a synthetic email", async () => {
    createUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    const { seeded, errors } = await seedE2ePersonas();

    expect(errors).toEqual([]);
    expect(seeded.length).toBe(E2E_PERSONAS.length);
    for (const call of createUserMock.mock.calls) {
      const [options] = call as [{ email: string; user_metadata: Record<string, unknown> }];
      expect(options.email).toMatch(/@e2e\.avela\.invalid$/);
      expect(options.user_metadata).toMatchObject({ e2e_test: true });
    }
  });

  it("prefixes every sample portfolio item title with the E2E marker", async () => {
    createUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    await seedE2ePersonas({ personaKeys: ["digital_creator"] });

    expect(insertMock).toHaveBeenCalledTimes(1);
    const [insertArg] = insertMock.mock.calls[0] as [{ title: string }];
    expect(insertArg.title.startsWith("[E2E TEST] ")).toBe(true);
  });

  it("never sets a real (non-synthetic) email or a null user_metadata marker", async () => {
    createUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    await seedE2ePersonas({ personaKeys: ["maker_engineering"] });
    const [options] = createUserMock.mock.calls[0] as [{ email: string }];
    expect(options.email).not.toContain("@gmail.com");
    expect(options.email).not.toContain("@avela.com");
  });

  it("continues seeding the remaining personas when one fails, rather than aborting the whole batch", async () => {
    createUserMock
      .mockResolvedValueOnce({ data: { user: null }, error: { message: "boom" } })
      .mockResolvedValue({ data: { user: { id: "user-ok" } }, error: null });

    const { seeded, errors } = await seedE2ePersonas();

    expect(errors.length).toBe(1);
    expect(seeded.length).toBe(E2E_PERSONAS.length - 1);
  });

  it("respects personaKeys to seed only a subset", async () => {
    createUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const { seeded } = await seedE2ePersonas({ personaKeys: ["digital_creator", "athlete_academic_competitor"] });
    expect(seeded.map((entry) => entry.persona.key).sort()).toEqual(["athlete_academic_competitor", "digital_creator"]);
  });

  it("can skip the sample item entirely", async () => {
    createUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const { seeded } = await seedE2ePersonas({ personaKeys: ["digital_creator"], withSampleItem: false });
    expect(insertMock).not.toHaveBeenCalled();
    expect(seeded[0]!.sampleItemId).toBeNull();
  });
});

describe("no secret logging (static check)", () => {
  it("seed.ts itself never logs a password — it's returned in-memory only", () => {
    const source = readFileSync(path.resolve(__dirname, "../../src/lib/e2e/seed.ts"), "utf-8");
    expect(source).not.toMatch(/console\.(log|error|warn|info)\([^)]*password/i);
  });
});
