import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

export function getSupabase() {
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function hasSupabase() {
  return !!(url && key);
}
