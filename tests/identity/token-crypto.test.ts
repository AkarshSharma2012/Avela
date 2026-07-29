import { afterEach, describe, expect, it } from "vitest";

import { decryptIdentityToken, encryptIdentityToken, isIdentityTokenEncryptionConfigured } from "@/lib/identity/token-crypto";

const VALID_KEY = Buffer.alloc(32, 7).toString("base64");

afterEach(() => {
  delete process.env.IDENTITY_TOKEN_ENCRYPTION_KEY;
});

describe("encryptIdentityToken / decryptIdentityToken", () => {
  it("round-trips a plaintext token", () => {
    process.env.IDENTITY_TOKEN_ENCRYPTION_KEY = VALID_KEY;
    const ciphertext = encryptIdentityToken("gho_realtoken12345");
    expect(ciphertext).not.toContain("gho_realtoken12345");
    expect(decryptIdentityToken(ciphertext)).toBe("gho_realtoken12345");
  });

  it("produces a different ciphertext each call (random IV) even for the same plaintext", () => {
    process.env.IDENTITY_TOKEN_ENCRYPTION_KEY = VALID_KEY;
    expect(encryptIdentityToken("same")).not.toBe(encryptIdentityToken("same"));
  });

  it("fails closed when the key is not configured — never silently stores plaintext", () => {
    delete process.env.IDENTITY_TOKEN_ENCRYPTION_KEY;
    expect(() => encryptIdentityToken("token")).toThrow(/not configured/);
  });

  it("fails closed when the key is not valid base64 or the wrong length", () => {
    process.env.IDENTITY_TOKEN_ENCRYPTION_KEY = "not-base64!!!";
    expect(() => encryptIdentityToken("token")).toThrow();

    process.env.IDENTITY_TOKEN_ENCRYPTION_KEY = Buffer.alloc(16).toString("base64");
    expect(() => encryptIdentityToken("token")).toThrow(/32 bytes/);
  });

  it("detects tampering via the GCM auth tag rather than returning corrupted plaintext", () => {
    process.env.IDENTITY_TOKEN_ENCRYPTION_KEY = VALID_KEY;
    const ciphertext = encryptIdentityToken("token");
    const tampered = Buffer.from(ciphertext, "base64");
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptIdentityToken(tampered.toString("base64"))).toThrow();
  });
});

describe("isIdentityTokenEncryptionConfigured", () => {
  it("reflects whether a valid key is present", () => {
    delete process.env.IDENTITY_TOKEN_ENCRYPTION_KEY;
    expect(isIdentityTokenEncryptionConfigured()).toBe(false);
    process.env.IDENTITY_TOKEN_ENCRYPTION_KEY = VALID_KEY;
    expect(isIdentityTokenEncryptionConfigured()).toBe(true);
  });
});
