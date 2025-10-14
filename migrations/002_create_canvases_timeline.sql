-- Create canvases and timeline_items tables
CREATE TABLE IF NOT EXISTS public.canvases (
  id text PRIMARY KEY,
  name text NOT NULL,
  player_code text,
  layout jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.timeline_items (
  id text PRIMARY KEY,
  canvas_id text REFERENCES public.canvases(id) ON DELETE CASCADE,
  file_id text NOT NULL,
  "order" integer NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 5,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_canvas_order ON public.timeline_items(canvas_id, "order");
