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
