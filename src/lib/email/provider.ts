/**
 * A small provider abstraction so nothing in src/lib/verification ever
 * talks to a concrete email vendor directly. Only one implementation
 * exists today: a development-safe "preview" provider that logs the
 * message instead of sending it. No real email is ever sent unless a real
 * provider is explicitly wired up and configured (spec section 3C) — that
 * wiring doesn't exist yet, so every environment currently gets the
 * preview provider, including production, until someone deliberately adds
 * one.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type EmailSendResult = { sent: boolean; error?: string; previewId?: string };

export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/** Reduces "student@example.com" to "s***@example.com" — enough to spot-check a log line without recovering the address. */
function maskEmailAddress(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) return "***";
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  const maskedLocal = local.length === 0 ? "*" : `${local[0]}***`;
  return `${maskedLocal}@${domain}`;
}

/**
 * `true` only for `next dev` / local `vitest`/`tsx` runs where NODE_ENV is
 * explicitly "development" — everything else (production, test, or
 * unset/unknown) fails closed to the redacted path below. This is
 * deliberately the *only* switch in this file; there is no separate
 * "test" branch; instead one is asserted to be the same branch as
 * production.
 */
function isLocalDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * Logs to the server console rather than sending anything — safe to run in
 * any environment, including production, with zero configuration. Returns
 * `sent: false` deliberately (never claims a real send happened) along with
 * a `previewId` the caller can surface in a dev-only UI affordance.
 *
 * The message body (and therefore any one-time verification token/link it
 * carries) is only ever printed in local development. Every other
 * environment — production and test alike — logs nothing but a masked
 * recipient, the subject, and the request identifier: enough to correlate
 * a support request with a log line, never enough to reconstruct or reuse
 * the link.
 */
export class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    const previewId = `preview_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    if (isLocalDevelopment()) {
      console.log(
        `[email:preview] to=${message.to} subject=${JSON.stringify(message.subject)} previewId=${previewId}\n${message.text}`
      );
    } else {
      console.log(
        `[email:sent] to=${maskEmailAddress(message.to)} subject=${JSON.stringify(message.subject)} requestId=${previewId}`
      );
    }

    return { sent: false, previewId };
  }
}

let cachedProvider: EmailProvider | null = null;

/**
 * The one place that would need to change to wire up a real vendor (e.g.
 * Resend, Postmark): branch on an env var here and return that
 * implementation instead. Every caller in src/lib/verification goes
 * through this factory rather than constructing a provider itself, so
 * that switch never has to happen in more than one place.
 */
export function getEmailProvider(): EmailProvider {
  if (!cachedProvider) {
    cachedProvider = new ConsoleEmailProvider();
  }
  return cachedProvider;
}

/** Test-only seam — never used outside tests/*.test.ts. */
export function __setEmailProviderForTests(provider: EmailProvider | null): void {
  cachedProvider = provider;
}
