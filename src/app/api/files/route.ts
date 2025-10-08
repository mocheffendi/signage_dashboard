import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getSupabase, hasSupabase } from "@/lib/supabase-server";

const DATA_FILE = path.join(process.cwd(), "data", "files.json");

export async function GET() {
  if (hasSupabase()) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("files")
        .select("*")
        .order("id", { ascending: false });
      if (error) {
        console.error(error.message);
      } else {
        return NextResponse.json(data || []);
      }
    }
  }

  if (!fs.existsSync(DATA_FILE)) return NextResponse.json([]);
  const cur = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  return NextResponse.json(cur);
}
