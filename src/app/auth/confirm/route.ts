import { NextResponse, type NextRequest } from "next/server";

import { getCurrentProfile } from "@/lib/auth/dal";
import { resolveConfirmation } from "@/lib/auth/confirm";
import { createClient } from "@/lib/supabase/server";

/**
 * Lands here from the "Confirm signup" email link. Supabase sends either a
 * `token_hash`+`type` pair or (PKCE flow) a `code` — see `resolveConfirmation`
 * for how each is verified. The destination is always one of a fixed set of
 * app-relative paths, never derived from the request, so this can't be used
 * as an open redirect; none of the incoming confirmation params are ever
 * copied onto the redirect URL.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const supabase = await createClient();

  const result = await resolveConfirmation(
    {
      tokenHash: searchParams.get("token_hash"),
      type: searchParams.get("type"),
      code: searchParams.get("code"),
    },
    {
      verifyOtp: (params) => supabase.auth.verifyOtp(params),
      exchangeCodeForSession: (code) => supabase.auth.exchangeCodeForSession(code),
      getProfile: getCurrentProfile,
    }
  );

  if (!result.ok) {
    return NextResponse.redirect(new URL("/login?error=confirmation_failed", origin));
  }

  return NextResponse.redirect(new URL(result.destination, origin));
}
