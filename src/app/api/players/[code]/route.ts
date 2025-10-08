import { NextRequest, NextResponse } from "next/server";
import { getSupabase, hasSupabase } from "@/lib/supabase-server";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
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

  const p = await params;
  const code = p.code;
  const body = (await req.json()) as { files?: unknown };

  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("code", code)
    .limit(1);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  const updateFiles = Array.isArray(body.files) ? body.files : [];
  const { error: upErr } = await supabase
    .from("players")
    .update({ files: updateFiles })
    .eq("code", code);
  if (upErr)
    return NextResponse.json(
      { error: String(upErr.message || upErr) },
      { status: 500 }
    );

  const { data: updated } = await supabase
    .from("players")
    .select("*")
    .eq("code", code)
    .limit(1);
  return NextResponse.json((updated && updated[0]) || null);
}
