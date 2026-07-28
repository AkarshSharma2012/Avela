import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ACTIONS_PATH = path.resolve(__dirname, "../../src/lib/verification/actions.ts");
const source = readFileSync(ACTIONS_PATH, "utf-8");

function bodyOf(functionSignature: RegExp): string {
  const match = source.match(functionSignature);
  expect(match, `expected to find a function matching ${functionSignature}`).not.toBeNull();
  const start = match!.index! + match![0].length;
  // Grab a generous slice rather than brace-matching — these functions are
  // each well under this length, and the next `export` marks a safe
  // boundary in every case here.
  const rest = source.slice(start);
  const nextExport = rest.search(/\nexport /);
  return nextExport === -1 ? rest : rest.slice(0, nextExport);
}

describe("token revocation — source-level regression guards", () => {
  it("resolveVerifierClaim (confirm/decline/correction) always nulls the code hash, making the link single-use", () => {
    const body = bodyOf(/async function resolveVerifierClaim\(/);
    expect(body).toMatch(/verification_code_hash:\s*null/);
  });

  it("cancelVerificationRequest immediately nulls the code hash — a cancelled link can never be used afterward", () => {
    const body = bodyOf(/export async function cancelVerificationRequest\(/);
    expect(body).toMatch(/verification_code_hash:\s*null/);
  });

  it("getVerifierClaim checks token expiry before ever returning a usable claim", () => {
    const body = bodyOf(/export async function getVerifierClaim\(/);
    expect(body).toMatch(/isTokenExpired\(/);
  });

  it("requestVerification and resendVerificationRequest each mint a brand-new token/hash rather than reusing one", () => {
    const requestBody = bodyOf(/export async function requestVerification\(/);
    const resendBody = bodyOf(/export async function resendVerificationRequest\(/);
    for (const body of [requestBody, resendBody]) {
      expect(body).toMatch(/generateVerificationToken\(\)/);
      expect(body).toMatch(/hashVerificationToken\(rawToken\)/);
    }
  });

  it("requestVerification runs eligibility checks (consent, self-email, disposable email, duplicate-active-request) before ever generating a token", () => {
    const body = bodyOf(/export async function requestVerification\(/);
    const eligibilityIndex = body.indexOf("checkRequestEligibility(");
    const tokenIndex = body.indexOf("generateVerificationToken()");
    expect(eligibilityIndex).toBeGreaterThan(-1);
    expect(tokenIndex).toBeGreaterThan(-1);
    expect(eligibilityIndex).toBeLessThan(tokenIndex);
  });

  it("resendVerificationRequest checks resend eligibility (cooldown + resend cap) before minting a new token", () => {
    const body = bodyOf(/export async function resendVerificationRequest\(/);
    const eligibilityIndex = body.indexOf("checkResendEligibility(");
    const tokenIndex = body.indexOf("generateVerificationToken()");
    expect(eligibilityIndex).toBeGreaterThan(-1);
    expect(tokenIndex).toBeGreaterThan(-1);
    expect(eligibilityIndex).toBeLessThan(tokenIndex);
  });
});
