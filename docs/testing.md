# Testing

## Automated

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest run
npm run build       # next build
```

`tests/validation/auth.test.ts` (11 tests) — `loginSchema`, `signupSchema`,
`mapAuthError`: valid/invalid email, empty password, password length and
character-class rules, password-mismatch, and error-message mapping for
duplicate-account / bad-credentials / unrecognized errors.

`tests/auth/route-rules.test.ts` (6 tests) — `isProtectedPath` (including
that `/dashboard-preview` is *not* treated as protected just because it
starts with `/dashboard`) and `getPostAuthDestination` for all three
profile states (`null`, incomplete, complete).

Both files import only dependency-free modules
(`src/lib/validation/auth.ts`, `src/lib/auth/route-rules.ts`) — no mocking
of Next.js or Supabase was needed.

## Manually verified in this session

Using a Chrome tab driven via browser automation, against the dev server
with a **syntactically valid but non-functional** `NEXT_PUBLIC_SUPABASE_URL`
(no real Supabase project was available — see below):

- [x] `/login` and `/signup` render: split editorial layout, serif
      heading, academic-blue button, correct copy.
- [x] Unauthenticated `GET /` → `307` to `/login`.
- [x] Unauthenticated `GET /dashboard` → `307` to `/login`.
- [x] Unauthenticated `GET /onboarding` → `307` to `/login`.
- [x] Submitting the login form empty shows inline "Enter your email
      address." / "Enter your password." under each field (Server Action
      + Zod + `useActionState`, no client-side JS validation bypassed by
      `noValidate` on the `<form>`).
- [x] Password visibility toggle: clicking the eye icon switches the
      input between `type="password"` and `type="text"` and the icon
      swaps.
- [x] Signup form: a password under 8 characters shows "Password must be
      at least 8 characters."; a mismatched confirm-password shows
      "Passwords do not match." — both simultaneously, independent
      fields.
- [x] Submitting valid-shaped credentials against the unreachable
      placeholder Supabase host surfaces "Avela is temporarily
      unavailable. Please try again in a moment." instead of a raw error
      or a crash — confirms `mapAuthError`'s network-failure branch and
      that no page/proxy code throws on a Supabase network failure.
- [x] `npm run build` produces all five routes (`/`, `/login`, `/signup`,
      `/onboarding`, `/dashboard`) as server-rendered (`ƒ`), proxy
      compiles.

**Not verified — requires a real Supabase project:**

- [ ] Actual signup creates an `auth.users` row and the trigger creates a
      matching `profiles` row.
- [ ] Actual login sets a session cookie and lands on `/onboarding`.
- [ ] Logout clears the session and returns to `/login`.
- [ ] A completed profile (`onboarding_completed = true`, set manually via
      SQL Editor for this milestone, since onboarding itself isn't built
      yet) reaches `/dashboard` and shows the display name.
- [ ] RLS policies actually reject cross-user access (would need two real
      accounts).
- [ ] Email-confirmation-enabled vs. disabled signup copy (see below).
- [ ] Mobile viewport rendering — the browser automation tool's window
      resize did not change the actual CDP viewport in this environment
      (`window.innerWidth` stayed at `1280` after requesting `390`), so
      the "no horizontal overflow on mobile" and "single column, form
      appears quickly" requirements were verified by auditing the
      Tailwind classes (`AuthShell` only switches from `flex-col` to
      `flex-row` at the `lg:` breakpoint; nothing uses a fixed pixel
      width) rather than by a real narrow-viewport screenshot. Re-check
      in an actual mobile browser or with working device emulation before
      shipping.
- [ ] Keyboard-only navigation through both forms tab-order and visible
      focus rings — the Tailwind classes (`focus-visible:ring-3
      focus-visible:ring-ring/30`) are in place on `Input` and the
      password-toggle button, but this wasn't walked with a keyboard in a
      real browser session.

## Why a real Supabase project wasn't available here

`.env.local` in this environment contains placeholder values
(`NEXT_PUBLIC_SUPABASE_URL=your-project-url`, etc.) — this repo has never
actually been pointed at a live Supabase project, despite the earlier
commit titled "Connect Avela to Supabase" only having added the client
code. Standing up a local instance via `npx supabase start` needs Docker,
which is not available in this environment. **Before relying on this
milestone, you need to**:

1. Create (or open) a Supabase project.
2. Apply the migration — see `database.md`.
3. Put the project's real URL and publishable key into `.env.local`.
4. Re-run the manual checklist above end-to-end.

## Supabase Auth URL configuration

Required for signup/login redirects and email links to work, in both
environments:

**Local development** (Supabase Dashboard → Authentication → URL
Configuration):
- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/**`

**Vercel** (same screen, add alongside the local ones — don't replace
them if you still develop locally):
- Site URL: your production domain, e.g. `https://avela.vercel.app`
- Redirect URLs: `https://avela.vercel.app/**` and, if you use preview
  deployments, `https://*.vercel.app/**`

## Email confirmation

Whether Supabase requires email confirmation before a session is issued
is a per-project toggle (Authentication → Providers → Email → "Confirm
email"). This code handles both:

- **Enabled:** `signUp()` returns a user but no session; `signup()`
  (`src/lib/auth/actions.ts`) detects `data.user && !data.session` and
  shows a "check your email" message instead of redirecting.
- **Disabled:** a session comes back immediately and the user is
  redirected to `/`, which resolves to `/onboarding`.

I have not sent or received a real confirmation email — this is
implemented per Supabase's documented `signUp()` response shape, not
verified against a live send.
