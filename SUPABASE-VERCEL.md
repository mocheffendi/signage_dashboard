# Supabase + Vercel setup

This document explains the minimal setup to have your Next.js app use Supabase on Vercel.

Required environment variables (set these in your Vercel project Settings → Environment Variables):

- SUPABASE_URL
  - The Supabase project URL (e.g. `https://xxxx.supabase.co`)
- SUPABASE_SERVICE_ROLE_KEY (server-only)
  - Use for server-side operations that require elevated permissions (inserts, updates).
  - Mark this variable as "Environment Variable Type: Secret" and only use it in server-side code.

Optional (client-side) keys:

- NEXT_PUBLIC_SUPABASE_URL (same as SUPABASE_URL)
- NEXT_PUBLIC_SUPABASE_ANON_KEY (public anon key for client usage)

Notes and deployment steps

1.  Add the SQL migration file:

    - The repo contains `migrations/001_create_players_files.sql` which creates the `files` and `players` tables. You can apply it with the SQL editor in the Supabase dashboard or with the Supabase CLI.

2.  Apply the migration via Supabase dashboard:

    - Open Supabase → project → SQL → New query
    - Paste the content of `migrations/001_create_players_files.sql` and click RUN.

3.  Add environment variables in Vercel:

    - Go to your Vercel project → Settings → Environment Variables
    - Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (set both for Production; optionally set for Preview/Development as needed)
    - For client-side SDKs, also add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

4.  Security reminder:

    - Never expose `SUPABASE_SERVICE_ROLE_KEY` to client/browser. Use it only in server-side code (Next.js app routes). In Vercel this means set it as an Environment Variable and do not name it with `NEXT_PUBLIC_` prefix.

5.  Additional tips:
    - If you prefer managed migrations, use the Supabase CLI to create migration files and apply them from CI.
    - If your `players.code` column is numeric in your existing DB, either change it to `text` or update the API to insert numeric values. The migration above uses `text` which matches the dashboard generation of 6-digit string codes.

If you want, I can also:

- Apply this migration to your Supabase project (if you paste the SQL in the SQL editor I can guide you step-by-step).
- Change the migration to use `players.code integer` instead of `text` if you prefer numeric codes.
