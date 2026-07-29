-- Milestone 10.7 — Material-Edit Invalidation.
--
-- Two nullable, additive columns on portfolio_items — every existing row
-- is unaffected until the next save recomputes them (see
-- src/lib/claims/material-hash.ts). The hash itself is only a fast
-- "something changed" signal; the actual material-vs-cosmetic
-- determination and dimension downgrade happens in application code
-- (src/lib/claims/invalidation.ts), never in the database.

alter table public.portfolio_items
  add column if not exists last_material_hash text check (last_material_hash is null or length(last_material_hash) = 64);

alter table public.portfolio_items
  add column if not exists material_hash_updated_at timestamptz;

comment on column public.portfolio_items.last_material_hash is
  'sha256 of the normalized material-fields snapshot as of the last save — null until the first save after Milestone 10.7. See docs/security.md.';
