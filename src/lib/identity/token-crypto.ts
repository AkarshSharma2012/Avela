/**
 * Encrypts a connected-identity's OAuth access token before it is ever
 * written to connected_identities.access_token_ciphertext (spec section 4:
 * "do not store access tokens in client-readable tables", "do not log
 * plaintext tokens"). AES-256-GCM with a server-only key
 * (IDENTITY_TOKEN_ENCRYPTION_KEY, 32 raw bytes, base64-encoded in the env)
 * — never read from a Client Component, never prefixed NEXT_PUBLIC_, and
 * distinct from SUPABASE_SERVICE_ROLE_KEY so a leak of one never implies
 * the other.
 *
 * Fails closed: with no key configured (the default in this environment —
 * no real GitHub OAuth App exists here), encrypt/decrypt throw rather than
 * silently storing plaintext or returning garbage. Every caller in
 * github-oauth.ts/actions.ts treats that as "the connect flow isn't
 * configured yet," never as a token that happens to be wrong.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

function loadKey(): Buffer {
  const raw = process.env.IDENTITY_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("IDENTITY_TOKEN_ENCRYPTION_KEY is not configured — connected-identity token storage is disabled.");
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new Error("IDENTITY_TOKEN_ENCRYPTION_KEY is not valid base64.");
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(`IDENTITY_TOKEN_ENCRYPTION_KEY must decode to exactly ${KEY_BYTES} bytes.`);
  }
  return key;
}

/** Never logs or returns the plaintext token on any code path — a caller that needs to log an error should log err.message only, never the input. */
export function encryptIdentityToken(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, authTag]).toString("base64");
}

export function decryptIdentityToken(encoded: string): string {
  const key = loadKey();
  const combined = Buffer.from(encoded, "base64");
  if (combined.length < IV_BYTES + 16) {
    throw new Error("Encrypted token is malformed.");
  }
  const iv = combined.subarray(0, IV_BYTES);
  const authTag = combined.subarray(combined.length - 16);
  const ciphertext = combined.subarray(IV_BYTES, combined.length - 16);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Whether the encryption key is configured at all — used to show "Connect GitHub" as unavailable rather than letting a connect attempt fail deep inside the OAuth exchange. */
export function isIdentityTokenEncryptionConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}
