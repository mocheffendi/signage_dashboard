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

export async function GET() {
  if (hasSupabase()) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("players")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return NextResponse.json(data || []);
      } catch (err: any) {
        // fallback to plain select if created_at doesn't exist or other error
        try {
          const { data, error } = await supabase.from("players").select("*");
          if (error) console.error("players select error:", error.message);
          return NextResponse.json(data || []);
        } catch (e) {
          console.error("players fallback select error:", e);
          // let filesystem fallback run below
        }
      }
    }
  }
  ensure();
  const cur = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  return NextResponse.json(cur);
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  try {
    if (hasSupabase()) {
      const supabase = getSupabase();
      if (supabase) {
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

          const pl = { code, name: `Player ${code}`, files: [] };
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
                const plNum = { ...pl, code: numericCode } as any;
                const { data: inserted2, error: insErr2 } = await supabase
                  .from("players")
                  .insert([plNum])
                  .select()
                  .limit(1)
                  .single();
                if (!insErr2) return NextResponse.json(inserted2 || plNum);
                console.error(
                  "supabase insert numeric fallback error:",
                  insErr2
                );
                // Fall through to local filesystem fallback below
              }
            }
            // Fall through to local filesystem fallback instead of returning 500
            console.error(
              "Falling back to local storage due to Supabase insert error."
            );
          } else {
            return NextResponse.json(inserted || pl);
          }
        } catch (supErr) {
          console.error(
            "Supabase operation failed, falling back to local storage:",
            supErr
          );
          // fall through to filesystem fallback
        }
      }
    }

    // fallback to local filesystem
    ensure();
    const cur = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    let code = generateCode();
    while (cur.find((p: any) => p.code === code)) code = generateCode();
    const pl = { code, name: `Player ${code}`, files: [] };
    cur.unshift(pl);
    fs.writeFileSync(DATA_FILE, JSON.stringify(cur, null, 2));
    return NextResponse.json(pl);
  } catch (err: any) {
    console.error("players POST error:", err);
    // If it's a Supabase error object, include its properties
    const body: any = { error: String(err?.message || err) };
    if (err && typeof err === "object") {
      body.details = err;
    }
    return NextResponse.json(body, { status: 500 });
  }
}
