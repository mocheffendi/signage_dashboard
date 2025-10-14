import { NextResponse } from "next/server";
import { getSupabase, hasSupabase } from "@/lib/supabase-server";

export async function GET(req: Request) {
  const url = new URL((req as any).url || "http://localhost");
  const id = url.searchParams.get("id");
  if (!hasSupabase())
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 500 }
    );
  const supabase = getSupabase()!;
  if (id) {
    const { data, error } = await supabase
      .from("canvases")
      .select("*")
      .eq("id", id)
      .limit(1)
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    // fetch timeline items
    const { data: items } = await supabase
      .from("timeline_items")
      .select("*")
      .eq("canvas_id", id)
      .order("order", { ascending: true });

    // normalize DB column names to client-friendly shape
    const normalizedTimeline = (items || []).map((it: any) => ({
      id: it.id,
      fileId: it.file_id ?? it.fileId,
      order: it.order,
      duration_seconds: it.duration_seconds ?? it.duration ?? undefined,
      meta: it.meta ?? {},
    }));

    // layout in DB may be either an array (legacy) or an object with width/height/elements
    let elements: any[] = [];
    let canvasWidth: number | null = null;
    let canvasHeight: number | null = null;
    if (Array.isArray(data?.layout)) {
      elements = data.layout;
    } else if (data?.layout && typeof data.layout === "object") {
      elements = data.layout.elements ?? [];
      canvasWidth = data.layout.width ?? null;
      canvasHeight = data.layout.height ?? null;
    }

    return NextResponse.json({
      ...(data || {}),
      layout: elements,
      canvasWidth,
      canvasHeight,
      timeline: normalizedTimeline,
    });
  }
  const { data, error } = await supabase.from("canvases").select("*");
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  if (!hasSupabase())
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 500 }
    );
  const supabase = getSupabase()!;
  const body = await req.json();
  const { id, name, layout, timeline } = body as {
    id: string;
    name: string;
    layout: unknown;
    timeline?: unknown;
  };
  if (!id || !name)
    return NextResponse.json(
      { error: "id and name required" },
      { status: 400 }
    );

  const { error: errUp } = await supabase
    .from("canvases")
    .upsert({ id, name, layout });
  if (errUp)
    return NextResponse.json({ error: errUp.message }, { status: 500 });

  type TimelineItem = {
    id?: string;
    fileId: string;
    duration_seconds?: number;
    meta?: Record<string, unknown>;
  };
  if (Array.isArray(timeline)) {
    // delete existing timeline items and insert new ones
    await supabase.from("timeline_items").delete().eq("canvas_id", id);
    const items = timeline as TimelineItem[];
    const toInsert = items.map((t, idx) => ({
      id: t.id ?? `${id}-${idx}`,
      canvas_id: id,
      file_id: t.fileId,
      order: idx,
      duration_seconds: t.duration_seconds ?? 5,
      meta: t.meta ?? {},
    }));
    const { error: terr } = await supabase
      .from("timeline_items")
      .insert(toInsert);
    if (terr) console.error("timeline insert error", terr);
  }
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: Request) {
  if (!hasSupabase())
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 500 }
    );
  const supabase = getSupabase()!;
  const url = new URL((req as any).url || "http://localhost");
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  // remove timeline items then canvas
  await supabase.from("timeline_items").delete().eq("canvas_id", id);
  const { error } = await supabase.from("canvases").delete().eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
