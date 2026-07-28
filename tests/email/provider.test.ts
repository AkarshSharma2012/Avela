import { afterEach, describe, expect, it, vi } from "vitest";

import { ConsoleEmailProvider } from "@/lib/email/provider";

const SECRET_TOKEN = "sekrit-one-time-token-abc123";
const MESSAGE = {
  to: "student.verifier@example.com",
  subject: "Quick confirmation",
  text: `Click this link: https://avela.app/verify/${SECRET_TOKEN}`,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("ConsoleEmailProvider — never sends, always says so", () => {
  it("always returns sent: false and a previewId, in every environment", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await new ConsoleEmailProvider().send(MESSAGE);
    expect(result.sent).toBe(false);
    expect(result.previewId).toBeTruthy();
  });
});

describe("ConsoleEmailProvider — logging verbosity fails closed outside local development", () => {
  it("prints the full message body (and therefore the token/link) only when NODE_ENV=development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await new ConsoleEmailProvider().send(MESSAGE);
    const logged = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toContain(SECRET_TOKEN);
  });

  it("never logs the token/link in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await new ConsoleEmailProvider().send(MESSAGE);
    const logged = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).not.toContain(SECRET_TOKEN);
    expect(logged).not.toContain(MESSAGE.text);
  });

  it("never logs the token/link in a test environment", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await new ConsoleEmailProvider().send(MESSAGE);
    const logged = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).not.toContain(SECRET_TOKEN);
  });

  it("never logs the token/link when NODE_ENV is unset", async () => {
    vi.stubEnv("NODE_ENV", "");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await new ConsoleEmailProvider().send(MESSAGE);
    const logged = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).not.toContain(SECRET_TOKEN);
  });

  it("logs only a masked recipient, the subject, and a request identifier outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await new ConsoleEmailProvider().send(MESSAGE);
    const logged = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).not.toContain(MESSAGE.to);
    expect(logged).toContain("s***@example.com");
    expect(logged).toContain(MESSAGE.subject);
    expect(logged).toContain(result.previewId!);
  });
});
