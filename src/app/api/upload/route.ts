import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getSupabase, hasSupabase } from "@/lib/supabase-server";

const BUCKET = "uploads";

export async function POST(req: NextRequest) {
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

  const form = await req.formData();
  const file = form.get("file") as unknown as File;
  if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });
  const name = file.name || `upload-${Date.now()}`;

  const id = String(Date.now()) + Math.floor(Math.random() * 1000);
  const ext = path.extname(name) || "";
  const filename = `${id}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, {
      contentType: file.type,
    });
  if (upErr) {
    console.error("supabase upload error:", upErr);
    return NextResponse.json(
      { error: String(upErr.message || upErr) },
      { status: 500 }
    );
  }

  const url = supabase.storage.from(BUCKET).getPublicUrl(filename)
    .data.publicUrl;

  try {
    await supabase.from("files").insert([{ id, name, type: file.type, url }]);
  } catch (e: unknown) {
    // ignore insert errors; bucket upload succeeded and we return the file info
    console.error("files table insert ignored error:", e);
  }

  return NextResponse.json({ id, name, type: file.type, url });
}
