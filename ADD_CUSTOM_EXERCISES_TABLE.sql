-- Create table to persist custom exercises per user
-- Run this once in Supabase (SQL editor) before deploying the new app version.

create table if not exists public.custom_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text,
  display text not null,
  muscles jsonb default '[]'::jsonb,
  is_cardio boolean default false,
  is_bodyweight boolean default false,
  inserted_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Unieke combinatie per gebruiker, zodat upsert goed werkt
create unique index if not exists custom_exercises_user_key_display_idx
  on public.custom_exercises(user_id, coalesce(key, ''), display);

-- Row Level Security
alter table public.custom_exercises enable row level security;

drop policy if exists "Users can manage their custom exercises" on public.custom_exercises;

create policy "Users can manage their custom exercises"
  on public.custom_exercises
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

