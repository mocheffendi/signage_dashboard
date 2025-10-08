import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSupabase, hasSupabase } from "@/lib/supabase-server";

const DATA_FILE = path.join(process.cwd(), "data", "players.json");

function ensure() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE))
    fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const p = await params;
  const code = p.code;
  const body = await req.json();

  if (hasSupabase()) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("players")
        .select("*")
        .eq("code", code)
        .limit(1);
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data || data.length === 0)
        return NextResponse.json({ error: "not found" }, { status: 404 });
      await supabase
        .from("players")
        .update({ files: body.files || [] })
        .eq("code", code);
      const { data: updated } = await supabase
        .from("players")
        .select("*")
        .eq("code", code)
        .limit(1);
      return NextResponse.json((updated && updated[0]) || null);
    }
  }

  ensure();
  const cur = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  const idx = cur.findIndex((p: any) => p.code === code);
  if (idx === -1)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  cur[idx].files = body.files || [];
  fs.writeFileSync(DATA_FILE, JSON.stringify(cur, null, 2));
  return NextResponse.json(cur[idx]);
}
