import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSupabase, hasSupabase } from "@/lib/supabase-server";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const DATA_FILE = path.join(process.cwd(), "data", "files.json");

async function ensure() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const dataDir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(DATA_FILE))
    fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as unknown as File;
  if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });
  const name = file.name || `upload-${Date.now()}`;

  if (hasSupabase()) {
    const supabase = getSupabase();
    if (supabase) {
      const id = String(Date.now()) + Math.floor(Math.random() * 1000);
      const ext = path.extname(name) || "";
      const filename = `${id}${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      // upload to bucket 'uploads'
      const { error: upErr } = await supabase.storage
        .from("uploads")
        .upload(filename, buffer, { contentType: file.type });
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
      const url = supabase.storage.from("uploads").getPublicUrl(filename).data.publicUrl;
      // optionally insert metadata to 'files' table if exists
      try {
        await supabase.from("files").insert([{ id, name, type: file.type, url }]);
      } catch {
        // ignore if table not present or insert fails
      }
      return NextResponse.json({ id, name, type: file.type, url });
    }
  }

  // fallback to local filesystem
  await ensure();
  const id = String(Date.now()) + Math.floor(Math.random() * 1000);
  const ext = path.extname(name) || "";
  const filename = `${id}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const dest = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(dest, buffer);

  const meta = { id, name, type: file.type, url: `/uploads/${filename}` };
  const cur = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  cur.unshift(meta);
  fs.writeFileSync(DATA_FILE, JSON.stringify(cur, null, 2));
  return NextResponse.json(meta);
}
