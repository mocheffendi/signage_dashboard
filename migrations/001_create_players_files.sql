-- migrations/001_create_players_files.sql

-- Table: files
CREATE TABLE IF NOT EXISTS public.files (
  id text PRIMARY KEY,
  name text,
  type text,
  url text,
  created_at timestamptz DEFAULT now()
);

-- Table: players
CREATE TABLE IF NOT EXISTS public.players (
  id bigserial PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name text,
  files jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- optional index to quickly lookup by code (if you expect many rows)
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_code ON public.players (code);
