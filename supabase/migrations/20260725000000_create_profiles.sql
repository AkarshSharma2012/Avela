-- Milestone 1: Authentication and Student Profile Foundation
--
-- Creates the `profiles` table (one row per Supabase Auth user), a trigger
-- that populates it automatically on signup, and Row Level Security
-- policies restricting every student to their own row.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  grade_level integer,
  city text,
  state text,
  country text not null default 'United States',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Avela targets middle- and high-school students (grades 6-12). Nullable
  -- until the student sets it during onboarding.
  constraint profiles_grade_level_check check (
    grade_level is null or grade_level between 6 and 12
  ),
  constraint profiles_display_name_length check (
    display_name is null or char_length(trim(display_name)) between 1 and 100
  )
);

comment on table public.profiles is
  'One row per Supabase Auth user. Created automatically by handle_new_user() on signup.';

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profile creation on signup
--
-- `security definer` is required so this function can insert into
-- `public.profiles` even though it runs in the trigger context of
-- `auth.users` (executed as the Supabase auth admin role, not the new
-- user). `set search_path = public` pins name resolution to prevent
-- search-path hijacking, which is the standard safe pattern for
-- security-definer functions. No service-role key or client-side elevated
-- access is involved anywhere in this flow.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Every policy scopes access to `auth.uid() = id`, so a student can only
-- ever see or change their own profile row. There is intentionally no
-- delete policy (profiles are removed only via the `on delete cascade` when
-- the underlying auth.users row is deleted) and no policy for the `anon`
-- role (unauthenticated requests get zero rows, never an error that could
-- leak existence of a row).
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Users can insert their own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);
