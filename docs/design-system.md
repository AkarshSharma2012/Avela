# Design System — Modern Academic Editorial

All tokens live in `src/app/globals.css`, inside the existing shadcn
`:root` / `.dark` blocks and the Tailwind v4 `@theme inline` mapping — no
new design-system dependency was added, and no parallel token system was
created alongside shadcn's.

## Tokens

| Concept | CSS variable | Tailwind utility | Notes |
|---|---|---|---|
| Page background | `--background` | `bg-background` | Warm near-white (`oklch(0.985 0.004 80)`), not stark white |
| Primary surface | `--card` | `bg-card` | Pure white — used for the auth form panel; makes it read as "raised" against the warm page background |
| Subtle surface | `--secondary` | `bg-secondary` | Warm-gray section background (the brand panel in `AuthShell`, the onboarding placeholder box) |
| Primary text | `--foreground` | `text-foreground` | Dark ink, not pure black |
| Secondary text | `--text-secondary` (new) | `text-text-secondary` | Supporting copy — one step lighter than ink, used for descriptions |
| Muted text | `--muted-foreground` | `text-muted-foreground` | Hints, captions |
| Border | `--border` | `border-border` | Soft neutral, warm-tinted |
| Primary blue | `--primary` | `bg-primary` / `text-primary` | Confident, restrained navy-blue (`oklch(0.4 0.115 258)`) |
| Primary blue hover | `--primary-hover` (new) | `hover:bg-primary-hover` | Used by the default `Button` variant |
| Danger | `--destructive` | `text-destructive` / `bg-destructive` | Form errors |
| Success | `--success` (new) | `text-success` / `bg-success` | Signup email-confirmation message |
| Focus ring | `--ring` | `ring-ring` | Blue-based, matches `--primary` so focus states read as intentional, not a generic gray outline |
| Heading font | `--font-heading` | `font-heading` | Source Serif 4 (`next/font/google`) |
| Body font | `--font-sans` | `font-sans` (default) | Geist Sans |
| Radius | `--radius` | `rounded-*` scale | `0.4rem` base — moderate, not the previous `0.625rem` default, per "mostly square or moderately rounded" |
| Section spacing | `--spacing-section` (new) | `py-section`, etc. | `6rem`, for generous editorial vertical rhythm where used |

`h1`/`h2`/`h3` are set to `font-heading` (serif) globally in the `base`
layer; everything else (labels, buttons, body copy) stays on the sans body
font, per the "serif for headings, sans for everything else" instruction.

## A pre-existing bug fixed while wiring these tokens

The scaffold's `@theme inline` block mapped `--font-mono` to
`var(--font-geist-mono)` correctly, but mapped `--font-sans` to
`var(--font-sans)` — a self-reference to an undefined variable, not to
`--font-geist-sans`. Geist Sans was being loaded (its CSS variable was on
`<html>`) but never actually applied by the `font-sans` utility; body text
was silently falling back to Tailwind's default system-font stack. Fixed
to `--font-sans: var(--font-geist-sans)` alongside the new serif token.

## Layout: `AuthShell`

`src/components/layout/auth-shell.tsx` implements the split editorial
composition for `/login` and `/signup`:

- **Desktop (`lg:` and up, 1024px+):** two columns — a warm-gray brand
  panel (wordmark, eyebrow, serif heading, one line of description, the
  "Your future, organized." tagline) on the left, the form on the right.
- **Mobile:** `flex-col` — the same brand block stacks above the form,
  compacted (less padding, smaller heading), so the form is still reached
  quickly without hiding the page's identity entirely.

No illustration library, no decorative hero graphic, no gradient — just
type, color, and whitespace, per the "no generic AI-dashboard styling"
constraint.

## Buttons

The existing `Button` component (Base UI `Button` primitive + `cva`,
`base-nova` shadcn style) was kept as-is except for one line: the default
variant's hover state now reads `hover:bg-primary-hover` (the new token)
instead of the previous `hover:bg-primary/80` opacity trick, so "primary
blue hover" is an explicit, named decision rather than an implicit
opacity blend. Other variants (`outline`, `secondary`, `ghost`,
`destructive`) were left on their existing opacity/color-mix hover
treatment — the spec only calls out primary blue and its hover as
required tokens.

## Form primitives

`components/ui/input.tsx` and `label.tsx` are plain native `<input>` /
`<label>` wrappers styled with the tokens above (matching the existing
`cn()`/`cva` conventions from `button.tsx`), not Base UI's `Field`
primitive — see `decision-log.md` for why.

---

# Design system — Milestone 2 additions

## New primitives: `checkbox.tsx`, `radio-group.tsx`, `switch.tsx`

Unlike `Input`/`Label`, these three wrap Base UI's `Checkbox`, `Radio` +
`RadioGroup`, and `Switch` primitives (the same library `Button` already
uses) rather than plain native elements — checkboxes, radios, and switches
need real keyboard and ARIA behavior (arrow-key navigation within a radio
group, `aria-checked`, mixed/indeterminate states) that a styled native
`<input type="checkbox">` gets close to but a plain-div reimplementation
would not, and Base UI ships that behavior for free. All three are styled
with the same tokens as everything else (`--primary` for the checked/active
state, `--ring` for focus, `--radius` scale) — no new colors were
introduced.

- `Checkbox` — a square with a `Check` (lucide) glyph shown via
  `Checkbox.Indicator` when checked.
- `RadioGroup` / `RadioGroupItem` — each `RadioGroupItem` renders as a full
  selectable pill (border + background change on `data-checked`), not a
  small circle with separate label text, so grade level, weekly
  availability, and experience level read as segmented controls rather than
  a traditional radio list.
- `Switch` — a track-and-thumb toggle for Guided Mode, sized so the thumb
  is a plain circle sliding between two fixed positions (no color outside
  the existing `--primary`/`--muted` tokens).

## Option rows: `components/onboarding/option-checkbox.tsx`

Interests, goals, and opportunity preferences all use the same pattern: a
full-width `<label>` wrapping a `Checkbox` and its text, so the entire row
is the click/tap target, not just the small checkbox square — important on
mobile, and generally friendlier for a "select several from a longish list"
interaction. Selected state is shown with a subtle tinted background
(`color-mix` against `--primary` at 92% transparency) plus a colored border,
not a heavier "card" treatment, per the "no excessive cards" constraint.

## Onboarding layout

The wizard reuses the same page shell conventions as the rest of the app
(`max-w-2xl`, warm background, serif `h2` step headings, `border-t` footer
for actions) rather than introducing a new "wizard" visual language.
`ProgressIndicator` is a thin bar plus "Step N of 6" / step-name text —
functionally identical to the placeholder progress bar Milestone 1 already
shipped on `/onboarding`, now actually wired to real progress.
