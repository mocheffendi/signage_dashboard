import { NextResponse } from "next/server";
import { getSupabase, hasSupabase } from "@/lib/supabase-server";

export async function GET() {
  if (!hasSupabase()) {
    return NextResponse.json(
      {
        error:
          "Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 500 }
    );
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Failed to initialize Supabase client." },
      { status: 500 }
    );
  }

  const { data, error } = await supabase
    .from("files")
    .select("*")
    .order("id", { ascending: false });
  if (error) {
    console.error("supabase files select error:", error);
    return NextResponse.json(
      { error: String(error.message || error) },
      { status: 500 }
    );
  }

  return NextResponse.json(data || []);
}
