import { NextResponse } from "next/server";
import { getSupabase, hasSupabase } from "@/lib/supabase-server";

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

interface LocalPlayer {
  code: string;
  name?: string;
  files?: string[];
}

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

  try {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json(data || []);
  } catch {
    // fallback to plain select if created_at doesn't exist or other error
    try {
      const { data, error } = await supabase.from("players").select("*");
      if (error) {
        console.error("players select error:", String(error.message ?? error));
        return NextResponse.json(
          { error: String(error.message ?? error) },
          { status: 500 }
        );
      }
      return NextResponse.json(data || []);
    } catch (err: unknown) {
      console.error("players select final error:", err);
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }
}

export async function POST() {
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

  try {
    let code = generateCode();
    // ensure unique code
    let tries = 0;
    while (tries < 10) {
      const { data: existing, error: exErr } = await supabase
        .from("players")
        .select("code")
        .eq("code", code)
        .limit(1);
      if (exErr) break;
      if (!existing || existing.length === 0) break;
      code = generateCode();
      tries++;
    }

    const pl: LocalPlayer = { code, name: `Player ${code}`, files: [] };
    const { data: inserted, error: insErr } = await supabase
      .from("players")
      .insert([pl])
      .select()
      .limit(1)
      .single();

    if (insErr) {
      const msg = String(insErr.message || insErr);
      console.error("supabase insert error:", insErr);
      // If DB expects bigint/int8 for code, try inserting numeric code
      if (
        /bigint|int8|invalid input syntax|column .* is of type integer|column .* is of type bigint/i.test(
          msg
        )
      ) {
        const numericCode = parseInt(code, 10);
        if (!Number.isNaN(numericCode)) {
          const plNum: { code: number; name: string; files: string[] } = {
            code: numericCode,
            name: pl.name ?? `Player ${numericCode}`,
            files: pl.files ?? [],
          };
          const { data: inserted2, error: insErr2 } = await supabase
            .from("players")
            .insert([plNum])
            .select()
            .limit(1)
            .single();
          if (!insErr2) return NextResponse.json(inserted2 || plNum);
          console.error("supabase insert numeric fallback error:", insErr2);
          return NextResponse.json(
            { error: String(insErr2.message || insErr2) },
            { status: 500 }
          );
        }
      }
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    return NextResponse.json(inserted || pl);
  } catch (err: unknown) {
    console.error("players POST error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
