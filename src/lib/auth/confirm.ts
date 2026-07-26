import type { EmailOtpType } from "@supabase/supabase-js";

import { getPostAuthDestination, type OnboardingProfile } from "@/lib/auth/route-rules";

const EMAIL_OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

/** Narrows an arbitrary query-string value to a known Supabase OTP type before it's ever passed to the SDK. */
function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (EMAIL_OTP_TYPES as readonly string[]).includes(value);
}

export type ConfirmParams = {
  tokenHash: string | null;
  type: string | null;
  code: string | null;
};

export type AuthOpResult = { error: { message: string } | null };

export type VerifyOtp = (params: {
  token_hash: string;
  type: EmailOtpType;
}) => Promise<AuthOpResult>;

export type ExchangeCodeForSession = (code: string) => Promise<AuthOpResult>;

export type GetProfile = () => Promise<OnboardingProfile>;

export type ConfirmOps = {
  verifyOtp: VerifyOtp;
  exchangeCodeForSession: ExchangeCodeForSession;
  getProfile: GetProfile;
};

export type ConfirmResult =
  | { ok: true; destination: ReturnType<typeof getPostAuthDestination> }
  | { ok: false };

/**
 * Verifies an email-confirmation link (either the `token_hash`+`type` form
 * or the PKCE `code` form Supabase may send) and resolves where the visitor
 * should land next. Pure aside from the injected `ops`, so it's testable
 * without a real Supabase client or Next.js request/response — same pattern
 * as `completeOnboarding` in `lib/onboarding/complete.ts`.
 */
export async function resolveConfirmation(
  params: ConfirmParams,
  ops: ConfirmOps
): Promise<ConfirmResult> {
  let confirmed = false;

  if (params.tokenHash && isEmailOtpType(params.type)) {
    const { error } = await ops.verifyOtp({ token_hash: params.tokenHash, type: params.type });
    if (error) {
      console.error("[auth] email confirmation (token_hash) failed:", error.message);
    }
    confirmed = !error;
  } else if (params.code) {
    const { error } = await ops.exchangeCodeForSession(params.code);
    if (error) {
      console.error("[auth] email confirmation (code) failed:", error.message);
    }
    confirmed = !error;
  }

  if (!confirmed) {
    return { ok: false };
  }

  const profile = await ops.getProfile();
  if (!profile) {
    return { ok: false };
  }

  return { ok: true, destination: getPostAuthDestination(profile) };
}
