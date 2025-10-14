"use client";
// eslint-disable-next-line
/* eslint-disable @next/next/no-img-element, @next/next/no-inline-styles, @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useRef, useState } from "react";

type FileItem = { id: string; name: string; type?: string; url?: string };
type CanvasElement = {
  id: string;
  fileId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  layer?: number;
  fullCanvas?: boolean;
};
type TimelineItem = {
  id: string;
  fileId: string;
  order: number;
  duration_seconds: number;
};

export default function CanvasEditor({
  canvasId,
  onSaved,
}: {
  canvasId?: string | null;
  onSaved?: (id: string) => void;
}) {
  const [canvasName, setCanvasName] = useState<string | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const actionRef = useRef<{
    type: "move" | "resize" | null;
    id?: string;
    handle?: "tl" | "tr" | "bl" | "br";
    startX?: number;
    startY?: number;
    startEl?: CanvasElement;
  }>({ type: null });
  const timerRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [seekMs, setSeekMs] = useState(0);

  const [selectedFileForAdd, setSelectedFileForAdd] = useState<FileItem | null>(
    null
  );
  const [quickPos, setQuickPos] = useState<"left" | "center" | "right">(
    "center"
  );
  const [quickWidth, setQuickWidth] = useState<number>(200);
  const [quickHeight, setQuickHeight] = useState<number>(120);
  const [quickDuration, setQuickDuration] = useState<number>(5);

  const [canvasWidth, setCanvasWidth] = useState<number>(1280);
  const [canvasHeight, setCanvasHeight] = useState<number>(720);
  const [pxPerSecond, setPxPerSecond] = useState<number>(23);

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const initRef = useRef(true);

  const [aspectLock, setAspectLock] = useState(false);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [selectedElId, setSelectedElId] = useState<string | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const rafRef = useRef<number | null>(null);
  const playbackStartTimeRef = useRef<number | null>(null);
  const playbackStartMsRef = useRef<number>(0);

  useEffect(() => {
    fetch("/api/files")
      .then((r) => r.json())
      .then((data) => setFiles(Array.isArray(data) ? data : []))
      .catch(() => setFiles([]));
  }, []);

  // load canvas layout and timeline when canvasId prop is provided
  useEffect(() => {
    if (!canvasId) return;
    (async () => {
      try {
        const res = await fetch(
          `/api/canvas?id=${encodeURIComponent(canvasId)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        // server should return { id, name, layout, timeline }
        if (data?.layout)
          setElements(Array.isArray(data.layout) ? (data.layout as any[]) : []);
        // if server returned canvasWidth/canvasHeight, apply them
        if (typeof data.canvasWidth === "number")
          setCanvasWidth(data.canvasWidth);
        if (typeof data.canvasHeight === "number")
          setCanvasHeight(data.canvasHeight);
        if (Array.isArray(data?.timeline)) setTimeline(data.timeline as any[]);
        // set canvas name so subsequent saves preserve it
        setCanvasName(data?.name ?? null);
      } catch (err) {
        console.error(err);
      }
    })();
  }, [canvasId]);

  // mark unsaved changes after initial mount when elements or timeline change
  useEffect(() => {
    if (initRef.current) {
      initRef.current = false;
      return;
    }
    setHasUnsavedChanges(true);
  }, [elements, timeline]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  function onDragGalleryStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("text/fileId", id);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    try {
      e.dataTransfer!.dropEffect = "copy";
    } catch {}
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const fileId = e.dataTransfer.getData("text/fileId");
    if (!fileId) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : 0;
    const y = rect ? e.clientY - rect.top : 0;

    const el: CanvasElement = {
      id: String(Date.now()),
      fileId,
      x,
      y,
      w: quickWidth || 200,
      h: quickHeight || 120,
      layer: elements.length,
    };
    setElements((s) => [...s, el]);
    setTimeline((s) => [
      ...s,
      {
        id: el.id,
        fileId,
        order: s.length,
        duration_seconds: quickDuration || 5,
      },
    ]);

    const file = files.find((f) => f.id === fileId);
    if (file && file.type?.startsWith("video") && file.url) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.src = file.url;
      const onMeta = () => {
        try {
          const seconds = Math.max(1, Math.ceil(v.duration || 0));
          setTimeline((prev) =>
            prev.map((t) =>
              t.id === el.id ? { ...t, duration_seconds: seconds } : t
            )
          );
          setQuickDuration(seconds);
          // try to read natural size and auto-expand if aspect matches canvas
          const vw = v.videoWidth || 0;
          const vh = v.videoHeight || 0;
          if (vw > 0 && vh > 0) {
            const videoAspect = vw / vh;
            const canvasAspect = canvasWidth / canvasHeight;
            const tol = 0.03; // 3% tolerance
            if (Math.abs(videoAspect - canvasAspect) / canvasAspect < tol) {
              setQuickWidth(canvasWidth);
              setQuickHeight(canvasHeight);
              setQuickPos("center");
            }
          }
        } finally {
          try {
            v.removeEventListener("loadedmetadata", onMeta);
          } catch {}
        }
      };
      v.addEventListener("loadedmetadata", onMeta);
      setTimeout(() => {
        try {
          v.removeEventListener("loadedmetadata", onMeta);
        } catch {}
      }, 30000);
    }
  }

  function openQuickAdd(file: FileItem) {
    setSelectedFileForAdd(file);
    setQuickWidth(Math.min(200, canvasWidth));
    setQuickHeight(Math.min(120, canvasHeight));
    setQuickDuration(5);
    setQuickPos("center");
  }

  function closeQuickAdd() {
    setSelectedFileForAdd(null);
  }

  function addSelectedFileToCanvas() {
    const file = selectedFileForAdd;
    if (!file) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    const cw = rect?.width ?? canvasWidth;
    const ch = rect?.height ?? canvasHeight;
    const x =
      quickPos === "left"
        ? 8
        : quickPos === "right"
        ? Math.max(8, cw - quickWidth - 8)
        : Math.max(8, (cw - quickWidth) / 2);
    const y = Math.max(8, (ch - quickHeight) / 2);
    const el: CanvasElement = {
      id: String(Date.now()),
      fileId: file.id,
      x,
      y,
      w: quickWidth,
      h: quickHeight,
      layer: elements.length,
    };
    // if video and quickWidth/Height equal canvas, set 0,0 for full-bleed
    if (
      file.type?.startsWith("video") &&
      quickWidth === canvasWidth &&
      quickHeight === canvasHeight
    ) {
      el.x = 0;
      el.y = 0;
    }
    setElements((s) => [...s, el]);
    setTimeline((s) => [
      ...s,
      {
        id: el.id,
        fileId: file.id,
        order: s.length,
        duration_seconds: quickDuration,
      },
    ]);
    closeQuickAdd();
  }

  // timeline zoom controls
  function zoomInTimeline() {
    setPxPerSecond((p) => Math.min(500, Math.round(p * 1.25)));
  }
  function zoomOutTimeline() {
    setPxPerSecond((p) => Math.max(2, Math.round(p / 1.25)));
  }

  function startMoveElement(e: React.PointerEvent, el: CanvasElement) {
    e.preventDefault();
    if (actionRef.current?.type === "resize") return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    actionRef.current = {
      type: "move",
      id: el.id,
      startX: e.clientX,
      startY: e.clientY,
      startEl: { ...el },
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function startResizeElement(
    e: React.PointerEvent,
    el: CanvasElement,
    handle: "tl" | "tr" | "bl" | "br"
  ) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    actionRef.current = {
      type: "resize",
      id: el.id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startEl: { ...el },
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function handlePointerMove(e: PointerEvent) {
    const a = actionRef.current;
    if (!a || !a.type || !a.id || !a.startEl) return;
    const dx = e.clientX - (a.startX ?? 0);
    const dy = e.clientY - (a.startY ?? 0);
    setElements((prev) =>
      prev.map((el) => {
        if (el.id !== a.id) return el;
        const s = a.startEl as CanvasElement;
        if (a.type === "move")
          return { ...el, x: Math.max(0, s.x + dx), y: Math.max(0, s.y + dy) };
        if (a.type === "resize") {
          let nx = s.x,
            ny = s.y,
            nw = s.w,
            nh = s.h;
          switch (a.handle) {
            case "tl":
              nx = s.x + dx;
              ny = s.y + dy;
              nw = Math.max(20, s.w - dx);
              nh = Math.max(20, s.h - dy);
              break;
            case "tr":
              ny = s.y + dy;
              nw = Math.max(20, s.w + dx);
              nh = Math.max(20, s.h - dy);
              break;
            case "bl":
              nx = s.x + dx;
              nw = Math.max(20, s.w - dx);
              nh = Math.max(20, s.h + dy);
              break;
            case "br":
              nw = Math.max(20, s.w + dx);
              nh = Math.max(20, s.h + dy);
              break;
          }
          if (aspectLock) {
            const aspect = s.w / s.h || 1;
            nh = Math.max(20, Math.round(nw / aspect));
          }
          return { ...el, x: nx, y: ny, w: nw, h: nh };
        }
        return el;
      })
    );
  }

  function handlePointerUp() {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    actionRef.current = { type: null };
  }

  async function saveCanvas(name?: string) {
    const confirmed = window.confirm(
      "Sync changes to Supabase /api/canvas now?"
    );
    if (!confirmed) return;
    setIsSaving(true);
    try {
      const id = canvasId ?? `canvas-${Date.now()}`;
      const nameToSave = name ?? canvasName ?? "Untitled";
      // persist layout including width/height so canvas size is stored
      const layoutToSave = {
        width: canvasWidth,
        height: canvasHeight,
        elements,
      };
      const body = { id, name: nameToSave, layout: layoutToSave, timeline };
      const res = await fetch("/api/canvas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        alert("Save failed: " + (text || res.statusText));
        return;
      }
      const data = await res.json().catch(() => ({}));
      // update local canvasName in case it was a new save or changed
      setCanvasName((data && data.name) || body.name || nameToSave || null);
      onSaved?.(data.id ?? id);
      setHasUnsavedChanges(false);
      alert("Synced to Supabase");
    } catch (err) {
      console.error(err);
      alert("Save error: " + String(err));
    } finally {
      setIsSaving(false);
    }
  }

  function stopPlayback() {
    setIsPlaying(false);
    setCurrentIndex(null);
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    playbackStartTimeRef.current = null;
    playbackStartMsRef.current = 0;
  }

  function playFrom(index = 0) {
    if (!timeline || timeline.length === 0) return;
    setIsPlaying(true);

    // compute cumulative ms before index
    const startMs = timeline
      .slice(0, index)
      .reduce((s, t) => s + (t.duration_seconds ?? 5) * 1000, 0);
    playbackStartMsRef.current = startMs;
    playbackStartTimeRef.current = performance.now();

    // clear any existing timers/rafs
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const run = (i: number) => {
      setCurrentIndex(i);
      const item = timeline[i];
      const duration = (item?.duration_seconds ?? 5) * 1000;

      // schedule next item
      timerRef.current = window.setTimeout(() => {
        const next = i + 1;
        if (next < timeline.length) {
          // update playbackStartMs to absolute ms at start of next
          playbackStartMsRef.current = timeline
            .slice(0, next)
            .reduce((s, t) => s + (t.duration_seconds ?? 5) * 1000, 0);
          playbackStartTimeRef.current = performance.now();
          run(next);
        } else if (loop) {
          // loop to start
          playbackStartMsRef.current = 0;
          playbackStartTimeRef.current = performance.now();
          run(0);
        } else {
          stopPlayback();
        }
      }, duration);

      // start RAF to update seekMs smoothly
      const rafTick = () => {
        const now = performance.now();
        const startTime = playbackStartTimeRef.current ?? now;
        const baseMs = playbackStartMsRef.current ?? 0;
        const ms = baseMs + Math.max(0, now - startTime);
        setSeekMs(Math.floor(ms));
        rafRef.current = requestAnimationFrame(rafTick);
      };
      rafRef.current = requestAnimationFrame(rafTick);
    };

    run(index);
  }

  // when currentIndex or isPlaying changes, control video playback and visibility
  useEffect(() => {
    if (!isPlaying || currentIndex == null) {
      // pause all videos when not playing
      Object.values(videoRefs.current).forEach((v) => {
        try {
          v?.pause();
          v && (v.currentTime = 0);
        } catch {}
      });
      return;
    }

    const activeTimelineItem = timeline[currentIndex];
    const activeElId = activeTimelineItem?.id;

    // pause and reset all videos except the active one
    Object.entries(videoRefs.current).forEach(([id, v]) => {
      if (!v) return;
      try {
        if (id === activeElId) {
          v.currentTime = 0;
          v.play().catch(() => {});
        } else {
          v.pause();
          v.currentTime = 0;
        }
      } catch {}
    });
  }, [isPlaying, currentIndex, timeline]);

  const totalDurationMs = timeline.reduce(
    (s, t) => s + (t.duration_seconds ?? 5) * 1000,
    0
  );

  function seekTo(ms: number) {
    if (!timeline.length) return;
    let cursor = 0;
    for (let i = 0; i < timeline.length; i++) {
      const itemMs = (timeline[i].duration_seconds ?? 5) * 1000;
      if (ms < cursor + itemMs) {
        setCurrentIndex(i);
        if (isPlaying) {
          if (timerRef.current) window.clearTimeout(timerRef.current);
          const remain = cursor + itemMs - ms;
          timerRef.current = window.setTimeout(() => playFrom(i + 1), remain);
        }
        break;
      }
      cursor += itemMs;
    }
    setSeekMs(ms);
  }

  return (
    <div className="flex gap-4 h-full">
      <aside className="w-56 p-2 border-r overflow-auto">
        <h4 className="text-sm font-medium">Gallery</h4>
        {files.map((f) => (
          <div
            key={f.id}
            draggable
            onDragStart={(e) => onDragGalleryStart(e, f.id)}
            onClick={() => openQuickAdd(f)}
            className="p-2 cursor-grab hover:bg-white/5 rounded"
          >
            {f.name}
          </div>
        ))}
      </aside>

      <main className="flex-1 p-2 min-w-0">
        <div className="mb-2 flex items-center gap-2">
          <button
            onClick={() => {
              if (isPlaying) stopPlayback();
              else playFrom(currentIndex ?? 0);
            }}
            className="px-3 py-1 bg-green-600 text-white rounded"
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button
            onClick={() => stopPlayback()}
            className="px-3 py-1 border rounded"
          >
            Stop
          </button>
          <label className="ml-2 text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => setLoop(e.target.checked)}
            />{" "}
            Loop
          </label>
          {/* Canvas name input so user can rename while editing */}
          <div className="ml-4 flex items-center gap-2">
            <label htmlFor="canvas-name" className="text-sm">
              Name
            </label>
            <input
              id="canvas-name"
              type="text"
              placeholder="Canvas name"
              value={canvasName ?? ""}
              onChange={(e) => {
                setCanvasName(e.target.value);
                setHasUnsavedChanges(true);
              }}
              className="w-56 p-1 border rounded"
            />
          </div>
          <div className="ml-auto text-sm">
            {currentIndex !== null ? `Playing #${currentIndex + 1}` : "Stopped"}
          </div>
        </div>

        <div className="mb-2 flex items-center gap-2">
          <label htmlFor="canvas-width" className="text-sm">
            Canvas W
          </label>
          <input
            id="canvas-width"
            type="number"
            min={1}
            max={10000}
            value={canvasWidth}
            onChange={(e) =>
              setCanvasWidth(
                Math.max(1, Math.min(10000, Number(e.target.value) || 640))
              )
            }
            className="w-28 p-1 border rounded"
          />
          <label htmlFor="canvas-height" className="text-sm">
            H
          </label>
          <input
            id="canvas-height"
            type="number"
            min={1}
            max={10000}
            value={canvasHeight}
            onChange={(e) =>
              setCanvasHeight(
                Math.max(1, Math.min(10000, Number(e.target.value) || 360))
              )
            }
            className="w-28 p-1 border rounded"
          />
          <label htmlFor="scale-input" className="ml-4 text-sm">
            Scale (px/s)
          </label>
          <input
            id="scale-input"
            aria-label="px-per-second"
            placeholder="px/s"
            type="number"
            className="w-20 p-1 border rounded"
            value={pxPerSecond}
            onChange={(e) =>
              setPxPerSecond(Math.max(5, Number(e.target.value) || 50))
            }
          />
        </div>

        <div
          ref={canvasRef}
          onDrop={onDrop}
          onDragOver={onDragOver}
          className="relative bg-gray-800 border overflow-hidden"
          style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }}
          onPointerDown={(e) => {
            if (e.currentTarget === e.target) setSelectedElId(null);
          }}
        >
          {elements.map((el) => {
            const file = files.find((f) => f.id === el.fileId);
            const isActive =
              currentIndex !== null && timeline[currentIndex]?.id === el.id;
            // when playing, only show the active timeline element
            if (isPlaying && !isActive) {
              return null;
            }
            const elStyle: React.CSSProperties = {
              left: el.x,
              top: el.y,
              width: el.w,
              height: el.h,
            };
            return (
              <div
                key={el.id}
                className={`absolute border-[1px] border-white/15 ${
                  isActive ? "ring-2 ring-blue-400" : ""
                } ${selectedElId === el.id ? "ring-2 ring-yellow-400" : ""}`}
                onPointerDown={(e) => {
                  setSelectedElId(el.id);
                  startMoveElement(e, el);
                }}
                style={elStyle}
              >
                {file?.type?.startsWith("image") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={file.url}
                    alt={file.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video
                    ref={(v) => {
                      videoRefs.current[el.id] = v;
                    }}
                    src={file?.url}
                    className="w-full h-full object-cover"
                  />
                )}
                <div
                  onPointerDown={(e) => startResizeElement(e, el, "tl")}
                  className="absolute w-3 h-3 bg-white/80 -left-1 -top-1 cursor-nwse-resize"
                />
                <div
                  onPointerDown={(e) => startResizeElement(e, el, "tr")}
                  className="absolute w-3 h-3 bg-white/80 -right-1 -top-1 cursor-nesw-resize"
                />
                <div
                  onPointerDown={(e) => startResizeElement(e, el, "bl")}
                  className="absolute w-3 h-3 bg-white/80 -left-1 -bottom-1 cursor-nesw-resize"
                />
                <div
                  onPointerDown={(e) => startResizeElement(e, el, "br")}
                  className="absolute w-3 h-3 bg-white/80 -right-1 -bottom-1 cursor-nwse-resize"
                />
              </div>
            );
          })}
        </div>

        <div className="mt-2 flex gap-2">
          <button
            onClick={() => saveCanvas()}
            className="px-3 py-1 bg-blue-600 text-white rounded"
          >
            Save
          </button>
          <button
            onClick={() => {
              setElements([]);
              setTimeline([]);
            }}
            className="px-3 py-1 border rounded"
          >
            Reset
          </button>
          <div className="ml-2 flex items-center gap-2">
            {hasUnsavedChanges && (
              <div className="text-xs text-yellow-400">Unsaved changes</div>
            )}
            <button
              onClick={() => saveCanvas()}
              disabled={isSaving}
              className="px-3 py-1 bg-indigo-600 text-white rounded"
            >
              {isSaving ? "Saving..." : "Sync timeline"}
            </button>
          </div>
        </div>

        <div className="w-full mt-4">
          <h4 className="text-sm font-medium mb-2">
            Timeline (drag to reorder)
          </h4>
          <div className="mb-2 flex items-center gap-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={aspectLock}
                onChange={(e) => setAspectLock(e.target.checked)}
              />{" "}
              Lock Aspect Ratio
            </label>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <label className="text-xs">Seek</label>
              <input
                aria-label="seek-range"
                type="range"
                min={0}
                max={totalDurationMs || 1}
                value={seekMs}
                onChange={(e) => seekTo(Number(e.target.value))}
                className="w-64"
              />
              <div className="text-xs">
                {Math.round(seekMs / 1000)}s /{" "}
                {Math.round((totalDurationMs || 0) / 1000)}s
              </div>
              <div className="ml-3 flex items-center gap-2">
                <button
                  onClick={zoomOutTimeline}
                  className="px-2 py-1 border rounded text-xs"
                >
                  -
                </button>
                <div className="text-xs">{pxPerSecond}px/s</div>
                <button
                  onClick={zoomInTimeline}
                  className="px-2 py-1 border rounded text-xs"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Ruler */}
          <div className="w-full h-8 mb-2 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-white/3 to-transparent" />
            <div className="absolute left-0 top-0 h-8 w-full">
              <svg
                className="w-full h-full"
                viewBox={`0 0 ${Math.max(
                  800,
                  (totalDurationMs / 1000) * pxPerSecond
                )} 32`}
                preserveAspectRatio="xMinYMin meet"
              >
                {/* compute tick spacing */}
                {(() => {
                  const totalSec = Math.max(
                    10,
                    Math.ceil((totalDurationMs || 1000) / 1000)
                  );
                  const px = pxPerSecond;
                  const stepSec = px > 100 ? 1 : px > 40 ? 2 : px > 20 ? 5 : 10;
                  const ticks: any[] = [];
                  for (let t = 0; t <= totalSec; t += stepSec) {
                    const x = t * px - (seekMs / 1000) * px + 400; // center offset so it feels smooth
                    ticks.push(
                      <g key={t} transform={`translate(${x},0)`}>
                        <line
                          x1={0}
                          y1={20}
                          x2={0}
                          y2={28}
                          stroke="rgba(255,255,255,0.6)"
                          strokeWidth={1}
                        />
                        <text
                          x={4}
                          y={16}
                          fontSize={10}
                          fill="rgba(255,255,255,0.8)"
                        >
                          {t}s
                        </text>
                      </g>
                    );
                  }
                  return ticks;
                })()}
              </svg>
            </div>
          </div>

          <div className="w-full overflow-x-auto py-2 px-1 border-t">
            <div className="flex gap-2 flex-nowrap">
              {timeline
                .sort((a, b) => a.order - b.order)
                .map((item, idx) => {
                  const widthPx = (item.duration_seconds ?? 5) * pxPerSecond;
                  return (
                    <div
                      key={item.id}
                      draggable
                      onClick={() => {
                        // select canvas element associated with this timeline item
                        setSelectedElId(item.id);
                        // seek to the start of this item
                        const msBefore = timeline
                          .slice(0, idx)
                          .reduce(
                            (s, t) => s + (t.duration_seconds ?? 5) * 1000,
                            0
                          );
                        setSeekMs(msBefore);
                        // if currently playing, restart playback from this index
                        if (isPlaying) {
                          if (timerRef.current) {
                            window.clearTimeout(timerRef.current);
                            timerRef.current = null;
                          }
                          playFrom(idx);
                        }
                      }}
                      onDragStart={(e) => {
                        setDragFromIndex(idx);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverIndex(idx);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = dragFromIndex;
                        const to = dragOverIndex ?? idx;
                        if (from == null) return;
                        const next = [...timeline].sort(
                          (a, b) => a.order - b.order
                        );
                        const [moved] = next.splice(from, 1);
                        next.splice(to, 0, moved);
                        const reindexed = next.map((t, i) => ({
                          ...t,
                          order: i,
                        }));
                        setTimeline(reindexed);
                        setDragFromIndex(null);
                        setDragOverIndex(null);
                      }}
                      className="flex-shrink-0"
                    >
                      <div
                        style={{ width: `${widthPx}px` }}
                        className="flex-shrink-0 p-2 bg-white/5 rounded border"
                      >
                        <div className="text-sm font-medium">
                          {(() => {
                            const full =
                              files.find((f) => f.id === item.fileId)?.name ??
                              item.fileId;
                            return (
                              <span
                                title={full}
                                className="block w-full truncate"
                              >
                                {full}
                              </span>
                            );
                          })()}
                        </div>
                        {(() => {
                          const showDuration = widthPx >= 80; // hide duration when card is too narrow
                          if (!showDuration) return null;
                          return (
                            <div className="mt-2 flex items-center gap-2">
                              <label className="text-xs">Durasi</label>
                              <div className="w-20 p-1 border rounded text-sm">
                                {item.duration_seconds} s
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </main>

      {/* Right-side inspector for selected element */}
      <aside className="w-64 p-2 border-l">
        <h4 className="text-sm font-medium">Inspector</h4>
        {selectedElId ? (
          (() => {
            const sel = elements.find((x) => x.id === selectedElId);
            if (!sel)
              return (
                <div className="text-xs text-muted-foreground">
                  Selected element not found
                </div>
              );
            const file = files.find((f) => f.id === sel.fileId);
            const right = Math.max(0, Math.round(canvasWidth - sel.x - sel.w));
            const base = `inspector-${sel.id}`;
            return (
              <div className="mt-2 space-y-2">
                <div>
                  {file?.url && file.type?.startsWith("video") ? (
                    <video
                      src={file.url}
                      className="w-28 h-16 object-cover rounded mb-2"
                      autoPlay
                      muted
                      playsInline
                      loop
                    />
                  ) : file?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={file.url}
                      alt={file.name}
                      className="w-28 h-16 object-cover rounded mb-2"
                    />
                  ) : null}
                  <div className="text-sm font-medium">
                    {file?.name ?? sel.fileId}
                  </div>
                </div>
                <div>
                  <label htmlFor={`${base}-left`} className="text-xs">
                    X (px)
                  </label>
                  <input
                    id={`${base}-left`}
                    title="X"
                    placeholder="x"
                    type="number"
                    value={Math.round(sel.x)}
                    onChange={(e) => {
                      const v = Math.max(0, Number(e.target.value) || 0);
                      setElements((prev) =>
                        prev.map((el) =>
                          el.id === sel.id ? { ...el, x: v } : el
                        )
                      );
                    }}
                    className="w-full p-1 border rounded mt-1"
                  />
                </div>
                <div>
                  <label htmlFor={`${base}-y`} className="text-xs">
                    Y (px)
                  </label>
                  <input
                    id={`${base}-y`}
                    title="Y"
                    placeholder="y"
                    type="number"
                    value={Math.round(sel.y)}
                    onChange={(e) => {
                      const v = Math.max(0, Number(e.target.value) || 0);
                      setElements((prev) =>
                        prev.map((el) =>
                          el.id === sel.id ? { ...el, y: v } : el
                        )
                      );
                    }}
                    className="w-full p-1 border rounded mt-1"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={!!sel.fullCanvas}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setElements((prev) =>
                          prev.map((el) =>
                            el.id === sel.id
                              ? {
                                  ...el,
                                  fullCanvas: checked,
                                  x: checked ? 0 : el.x,
                                  y: checked ? 0 : el.y,
                                  w: checked ? canvasWidth : el.w,
                                  h: checked ? canvasHeight : el.h,
                                }
                              : el
                          )
                        );
                      }}
                    />{" "}
                    Full canvas
                  </label>
                  <label
                    htmlFor={`${base}-width`}
                    className="text-xs block mt-1"
                  >
                    Width (px)
                  </label>
                  <input
                    id={`${base}-width`}
                    title="Width"
                    placeholder="width"
                    type="number"
                    value={Math.round(sel.w)}
                    onChange={(e) => {
                      const w = Math.max(1, Number(e.target.value) || 1);
                      setElements((prev) =>
                        prev.map((el) => (el.id === sel.id ? { ...el, w } : el))
                      );
                    }}
                    className="w-full p-1 border rounded mt-1"
                  />
                </div>
                <div>
                  <label htmlFor={`${base}-height`} className="text-xs">
                    Height (px)
                  </label>
                  <input
                    id={`${base}-height`}
                    title="Height"
                    placeholder="height"
                    type="number"
                    value={Math.round(sel.h)}
                    onChange={(e) => {
                      const h = Math.max(1, Number(e.target.value) || 1);
                      setElements((prev) =>
                        prev.map((el) => (el.id === sel.id ? { ...el, h } : el))
                      );
                    }}
                    className="w-full p-1 border rounded mt-1"
                  />
                </div>
                <div>
                  <label htmlFor={`${base}-duration`} className="text-xs">
                    Durasi (s)
                  </label>
                  <input
                    id={`${base}-duration`}
                    aria-label="inspector-duration"
                    type="number"
                    min={1}
                    value={
                      timeline.find((tt) => tt.id === sel.id)
                        ?.duration_seconds ?? 5
                    }
                    onChange={(e) => {
                      const v = Math.max(1, Number(e.target.value) || 1);
                      setTimeline((prev) =>
                        prev.map((t) =>
                          t.id === sel.id ? { ...t, duration_seconds: v } : t
                        )
                      );
                    }}
                    className="w-full p-1 border rounded mt-1"
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => setSelectedElId(null)}
                    className="px-2 py-1 border rounded text-sm"
                  >
                    Deselect
                  </button>
                  <button
                    onClick={() => {
                      setElements((prev) =>
                        prev.filter((el) => el.id !== sel.id)
                      );
                      setTimeline((prev) =>
                        prev.filter((t) => t.id !== sel.id)
                      );
                      setSelectedElId(null);
                    }}
                    className="px-2 py-1 bg-red-600 text-white rounded text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })()
        ) : (
          <div className="text-xs text-muted-foreground mt-2">
            No element selected. Tap an element on the canvas.
          </div>
        )}
      </aside>

      {selectedFileForAdd && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeQuickAdd}
          />
          <div className="bg-white text-black rounded p-4 z-10 w-[420px]">
            <h3 className="font-semibold mb-2">
              Add: {selectedFileForAdd.name}
            </h3>
            <div className="mb-2">
              <div className="text-sm mb-1">Position</div>
              <div className="flex gap-3">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="quickPos"
                    checked={quickPos === "left"}
                    onChange={() => setQuickPos("left")}
                  />{" "}
                  Left
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="quickPos"
                    checked={quickPos === "center"}
                    onChange={() => setQuickPos("center")}
                  />{" "}
                  Center
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="quickPos"
                    checked={quickPos === "right"}
                    onChange={() => setQuickPos("right")}
                  />{" "}
                  Right
                </label>
              </div>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <label className="text-sm">W</label>
              <input
                aria-label="quick-width"
                placeholder="px"
                type="number"
                value={quickWidth}
                onChange={(e) =>
                  setQuickWidth(Math.max(1, Number(e.target.value) || 1))
                }
                className="w-28 p-1 border rounded"
              />
              <label className="text-sm">H</label>
              <input
                aria-label="quick-height"
                placeholder="px"
                type="number"
                value={quickHeight}
                onChange={(e) =>
                  setQuickHeight(Math.max(1, Number(e.target.value) || 1))
                }
                className="w-28 p-1 border rounded"
              />
            </div>
            <div className="mb-4">
              <label className="text-sm">Durasi (s)</label>
              <input
                aria-label="quick-duration"
                placeholder="s"
                type="number"
                value={quickDuration}
                onChange={(e) =>
                  setQuickDuration(Math.max(1, Number(e.target.value) || 1))
                }
                className="w-28 p-1 border rounded ml-2"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={closeQuickAdd}
                className="px-3 py-1 border rounded"
              >
                Cancel
              </button>
              <button
                onClick={addSelectedFileToCanvas}
                className="px-3 py-1 bg-blue-600 text-white rounded"
              >
                Add to canvas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
