-- Migration: create shopping_list_items table for Google Tasks sync
-- History:
-- 2026-04-15: Initial creation

create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  raw_name text,
  name text,
  brand text,
  price numeric,
  unit text,
  url text,
  image_url text,
  category text,
  store text,
  source text default 'google_tasks',
  enriched boolean default true,
  created_at timestamptz default now()
);

comment on table public.shopping_list_items is 'Items added via Google Tasks and enriched by Gemini.';

