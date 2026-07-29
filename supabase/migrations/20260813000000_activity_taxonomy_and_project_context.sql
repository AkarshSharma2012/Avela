-- Milestone 10.8 — Universal Activity Taxonomy & Project-Context Expansion.
--
-- Two additive changes on portfolio_items, neither touching any existing
-- column's meaning or any existing row:
--
--   1. activity_category_key — a free-form-but-bounded category key (e.g.
--      "mechanical_build", "painting", "family_caregiving") from the
--      passion-area taxonomy in src/lib/portfolio/taxonomy.ts. Deliberately
--      NOT a `check (... in (...))` enum the way every other classifier
--      column in this codebase is (item_type, evidence_role, etc.): the
--      taxonomy is meant to grow to ~100 categories and beyond *without* a
--      migration each time (spec: "future categories must work without a
--      destructive migration"). Validation instead happens at the
--      application layer (taxonomy.ts's resolveCategory, which always falls
--      back to a generic template rather than rejecting an unrecognized
--      key). Null = not yet classified — every pre-Milestone-10.8 item is
--      unaffected and keeps working exactly as before via item_type alone.
--   2. template_version — which revision of the category-template engine
--      (src/lib/portfolio/templates.ts) produced this item's prompts, so a
--      future template rewording never silently reinterprets an old item's
--      already-answered questions. Defaults to 1 (the version introduced by
--      this migration) for every row, including pre-existing ones, since a
--      default of 1 is the correct "not templated yet" value either way.
--
-- Also widens the existing portfolio_items.project_context check (added in
-- 20260808000000_verifier_legitimacy_and_project_context.sql, values
-- 'org_linked'/'personal_project') to the full spec section 2 list. Both
-- original values stay valid — 'org_linked' is kept as a permanent synonym
-- of 'organization_project' rather than rewritten, so no backfill runs and
-- no existing row can become invalid. New code should prefer
-- 'organization_project' going forward; see project-context.ts.

alter table public.portfolio_items
  add column if not exists activity_category_key text check (
    activity_category_key is null or length(activity_category_key) <= 100
  );

comment on column public.portfolio_items.activity_category_key is
  'Free-form-but-bounded taxonomy key resolved against src/lib/portfolio/taxonomy.ts at the application layer, not a DB enum — the ~100-category taxonomy must grow without a migration per item. Null = not yet classified.';

alter table public.portfolio_items
  add column if not exists template_version integer not null default 1;

comment on column public.portfolio_items.template_version is
  'Which category-template engine revision (src/lib/portfolio/templates.ts) produced this item''s prompts. Defaults to 1 for every row, including pre-Milestone-10.8 items.';

alter table public.portfolio_items
  drop constraint if exists portfolio_items_project_context_check;

alter table public.portfolio_items
  add constraint portfolio_items_project_context_check check (
    project_context is null or project_context in (
      -- Legacy Milestone 10.7 values — kept valid permanently, never rewritten.
      'org_linked', 'personal_project',
      -- Milestone 10.8 — full spec section 2 list.
      'organization_project', 'school_project', 'team_project',
      'family_or_household', 'community_project', 'employment',
      'competition', 'course_or_program', 'independent_activity', 'custom'
    )
  );

comment on column public.portfolio_items.project_context is
  'What kind of context this activity happened in (spec section 2), driving which fields are required/hidden. org_linked is a permanent legacy synonym of organization_project. Null = not yet classified — existing rows before Milestone 10.7 are unaffected.';

create index if not exists portfolio_items_user_category_idx
  on public.portfolio_items (user_id, activity_category_key)
  where activity_category_key is not null;
