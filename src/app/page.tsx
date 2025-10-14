"use client";

import { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";

const CanvasEditor = dynamic(() => import("@/components/CanvasEditor"), {
  ssr: false,
});

type FileMeta = {
  id: string;
  name: string;
  type: string;
  url: string;
};

type Player = {
  code: string;
  name?: string;
  files?: string[]; // file ids
};

export default function Dashboard() {
  const [tab, setTab] = useState<"gallery" | "players" | "canvas">("gallery");
  const [canvases, setCanvases] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [editingCanvasId, setEditingCanvasId] = useState<string | null>(null);
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // modal for new template / rename (kept for possible modal flows)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"new" | "rename">("new");
  const [modalCanvasId, setModalCanvasId] = useState<string | null>(null);
  const [modalName, setModalName] = useState<string>("Untitled");

  useEffect(() => {
    fetchFiles();
    fetchPlayers();
    fetchCanvases();
  }, []);

  async function fetchCanvases() {
    try {
      const res = await fetch("/api/canvas");
      const data = await res.json();
      setCanvases(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchFiles() {
    try {
      const res = await fetch("/api/files");
      const data = await res.json();
      setFiles(data || []);
    } catch (error) {
      console.error(error);
    }
  }

  async function fetchPlayers() {
    try {
      const res = await fetch("/api/players");
      const data = await res.json();
      setPlayers(data || []);
    } catch (error) {
      console.error(error);
    }
  }

  function handleTab(t: "gallery" | "players" | "canvas") {
    setTab(t);
    setSelectedPlayer(null);
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "video/mp4"];
    if (!allowed.includes(file.type)) {
      alert("Tipe file tidak didukung. Hanya JPG, PNG, MP4.");
      return;
    }
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error("upload failed");
      await fetchFiles();
      // reset the input using the captured reference (avoid SyntheticEvent pooling)
      try {
        input.value = "";
      } catch {
        // ignore if it fails
      }
    } catch (error) {
      console.error(error);
      alert("Gagal upload");
    } finally {
      setUploading(false);
    }
  }

  async function createPlayer() {
    try {
      const res = await fetch("/api/players", { method: "POST" });
      const data = await res.json();
      // normalize files to an array to avoid undefined
      const normalized = { ...data, files: data.files ?? [] };
      setPlayers((p) => [normalized, ...p]);
      setSelectedPlayer(data.code);
      setTab("players");
    } catch (error) {
      console.error(error);
    }
  }

  async function toggleAssign(playerCode: string, fileId: string) {
    const pl = players.find((p) => p.code === playerCode);
    if (!pl) return;
    const currentFiles = pl.files ?? [];
    const has = currentFiles.includes(fileId);
    const body = {
      files: has
        ? currentFiles.filter((f) => f !== fileId)
        : [...currentFiles, fileId],
    };
    const res = await fetch(`/api/players/${playerCode}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      fetchPlayers();
    } else {
      alert("gagal update player");
    }
  }

  return (
    <div className="min-h-screen p-8 font-sans">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Signage Dashboard</h1>
        <div className="flex gap-2">
          <button
            className={`px-3 py-1 rounded ${
              tab === "gallery" ? "bg-gray-800 text-white" : "border"
            }`}
            onClick={() => handleTab("gallery")}
          >
            Gallery
          </button>
          <button
            className={`px-3 py-1 rounded ${
              tab === "players" ? "bg-gray-800 text-white" : "border"
            }`}
            onClick={() => handleTab("players")}
          >
            Players
          </button>
          <button
            className={`px-3 py-1 rounded ${
              tab === "canvas" ? "bg-gray-800 text-white" : "border"
            }`}
            onClick={() => handleTab("canvas")}
          >
            Canvas
          </button>
        </div>
      </header>

      {tab === "gallery" && (
        <section>
          <div className="mb-4 flex items-center gap-4">
            <label className="px-4 py-2 border rounded cursor-pointer bg-white">
              {uploading ? "Uploading..." : "Upload file (JPG/PNG/MP4)"}
              <input
                type="file"
                accept="image/jpeg,image/png,video/mp4"
                onChange={onFileChange}
                className="hidden"
              />
            </label>
            <small className="text-sm text-gray-600">
              Files are stored centrally and can be assigned to players.
            </small>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {files.length === 0 && (
              <div className="text-gray-500">Belum ada file.</div>
            )}
            {files.map((f) => (
              <div key={f.id} className="border rounded p-2">
                {f.type.startsWith("image") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={f.url}
                    alt={f.name}
                    className="w-full h-40 object-cover"
                  />
                ) : (
                  <video
                    src={f.url}
                    className="w-full h-40 bg-black"
                    controls
                  />
                )}
                <div className="mt-2 text-sm">{f.name}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "players" && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded"
              onClick={createPlayer}
            >
              Buat player baru
            </button>
            <div className="text-sm text-gray-600">
              Pilih player untuk mengedit file yang tampil
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {players.length === 0 && (
              <div className="text-gray-500">Belum ada player.</div>
            )}
            {players.map((p) => (
              <div
                key={p.code}
                className={`border rounded p-3 cursor-pointer ${
                  selectedPlayer === p.code ? "ring-2 ring-blue-400" : ""
                }`}
                onClick={() => setSelectedPlayer(p.code)}
              >
                <div className="font-mono text-lg">{p.code}</div>
                <div className="text-sm text-gray-600">
                  {p.name || "Player"}
                </div>
                <div className="mt-2 text-xs text-gray-600">
                  {p.files?.length ?? 0} files assigned
                </div>
              </div>
            ))}
          </div>

          {selectedPlayer && (
            <div className="mt-6">
              <h3 className="font-semibold mb-2">
                Edit player: {selectedPlayer}
              </h3>
              <div className="mb-3 text-sm">Playlist (drag/order controls)</div>
              <PlaylistEditor
                player={players.find((p) => p.code === selectedPlayer)!}
                files={files}
                onSave={() => fetchPlayers()}
                onAssignToggle={(fileId) =>
                  toggleAssign(selectedPlayer, fileId)
                }
              />
            </div>
          )}
        </section>
      )}

      {tab === "canvas" && (
        <section>
          {!editingCanvasId ? (
            <div>
              <div className="mb-4 flex items-center gap-2">
                <button
                  className="px-3 py-1 bg-blue-600 text-white rounded"
                  onClick={async () => {
                    const id = `canvas-${Date.now()}`;
                    const name = "Untitled";
                    const body = { id, name, layout: [], timeline: [] };
                    try {
                      const res = await fetch("/api/canvas", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body),
                      });
                      if (!res.ok) throw new Error("create failed");
                      setEditingCanvasId(id);
                      fetchCanvases();
                    } catch (err) {
                      console.error(err);
                      alert("Failed to create template");
                    }
                  }}
                >
                  New template
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {canvases.length === 0 && (
                  <div className="text-gray-500">No templates saved yet.</div>
                )}
                {canvases.map((c) => (
                  <div key={c.id} className="border rounded p-3">
                    <div className="font-semibold">{c.name}</div>
                    <div className="mt-2 flex gap-2">
                      <button
                        className="px-2 py-1 border rounded"
                        onClick={() => setEditingCanvasId(c.id)}
                      >
                        Edit
                      </button>
                      <button
                        className="px-2 py-1 border rounded"
                        onClick={() => {
                          // open rename modal
                          setModalMode("rename");
                          setModalCanvasId(c.id);
                          setModalName(c.name || "Untitled");
                          setModalOpen(true);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        className="px-2 py-1 border rounded"
                        onClick={async () => {
                          // duplicate
                          try {
                            const res = await fetch(
                              `/api/canvas?id=${encodeURIComponent(c.id)}`
                            );
                            if (!res.ok) throw new Error("fetch failed");
                            const data = await res.json();
                            const newId = `canvas-${Date.now()}`;
                            const newName = `Copy of ${data.name || c.name}`;
                            const body = {
                              id: newId,
                              name: newName,
                              layout: data.layout ?? [],
                              timeline: data.timeline ?? [],
                            };
                            const post = await fetch("/api/canvas", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(body),
                            });
                            if (!post.ok) throw new Error("create failed");
                            fetchCanvases();
                          } catch (err) {
                            console.error(err);
                            alert("Duplicate failed");
                          }
                        }}
                      >
                        Duplicate
                      </button>
                      <button
                        className="px-2 py-1 border rounded text-red-600"
                        onClick={async () => {
                          if (!confirm("Delete this template?")) return;
                          try {
                            const res = await fetch(
                              `/api/canvas?id=${encodeURIComponent(c.id)}`,
                              { method: "DELETE" }
                            );
                            if (!res.ok) throw new Error("delete failed");
                            fetchCanvases();
                          } catch (err) {
                            console.error(err);
                            alert("Delete failed");
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <button
                className="px-2 py-1 border rounded mb-2"
                onClick={() => {
                  setEditingCanvasId(null);
                  fetchCanvases();
                }}
              >
                Back to templates
              </button>
              <CanvasEditor
                canvasId={editingCanvasId}
                onSaved={(id) => {
                  console.log("saved", id);
                  setEditingCanvasId(null);
                  fetchCanvases();
                }}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function PlaylistEditor({
  player,
  files,
  onSave,
  onAssignToggle,
}: {
  player: Player;
  files: FileMeta[];
  onSave: () => void;
  onAssignToggle: (fileId: string) => void;
}) {
  const [order, setOrder] = useState<string[]>(player.files ?? []);
  const dragIndex = useRef<number | null>(null);

  function onDragStart(e: React.DragEvent, idx: number) {
    dragIndex.current = idx;
    try {
      e.dataTransfer!.effectAllowed = "move";
    } catch {}
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    try {
      e.dataTransfer!.dropEffect = "move";
    } catch {}
  }

  function onDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    const from = dragIndex.current;
    if (from === null || from === undefined) return;
    if (from === idx) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(idx, 0, item);
    setOrder(next);
    dragIndex.current = null;
  }

  function onDragEnd() {
    dragIndex.current = null;
  }

  useEffect(() => setOrder(player.files ?? []), [player.files]);

  function move(index: number, delta: number) {
    const next = [...order];
    const newIndex = index + delta;
    if (newIndex < 0 || newIndex >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(newIndex, 0, item);
    setOrder(next);
  }

  function setPosition(index: number, pos: number) {
    const next = [...order];
    const [item] = next.splice(index, 1);
    const idx = Math.max(0, Math.min(pos - 1, next.length));
    next.splice(idx, 0, item);
    setOrder(next);
  }

  async function save() {
    try {
      const res = await fetch(`/api/players/${player.code}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ files: order }),
      });
      if (!res.ok) throw new Error("save failed");
      onSave();
    } catch (err) {
      console.error(err);
      alert("Gagal menyimpan playlist");
    }
  }

  const assignedFileObjects = order
    .map((id) => files.find((f) => f.id === id))
    .filter(Boolean) as FileMeta[];

  return (
    <div>
      <div className="space-y-2">
        {assignedFileObjects.length === 0 && (
          <div className="text-sm text-gray-500">No files assigned yet.</div>
        )}
        {assignedFileObjects.map((f, i) => (
          <div
            key={f.id}
            className="flex items-center gap-3 border border-white/10 rounded p-2 bg-transparent hover:shadow-md hover:ring-2 hover:ring-white/20 transition-shadow transition-all duration-150 ease-out"
            draggable={true}
            onDragStart={(e) => onDragStart(e, i)}
            onDragOver={(e) => onDragOver(e)}
            onDrop={(e) => onDrop(e, i)}
            onDragEnd={onDragEnd}
          >
            <div className="w-12 h-8 overflow-hidden">
              {f.type.startsWith("image") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={f.url}
                  alt={f.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <video src={f.url} className="w-full h-full bg-black" />
              )}
            </div>
            <div className="flex-1 text-sm">{f.name}</div>
            <div className="flex items-center gap-1">
              <button
                className="px-2 py-1 border border-white/10 rounded transition-colors duration-150 hover:bg-white/5"
                onClick={() => move(i, -1)}
              >
                Up
              </button>
              <button
                className="px-2 py-1 border border-white/10 rounded transition-colors duration-150 hover:bg-white/5"
                onClick={() => move(i, 1)}
              >
                Down
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                aria-label={`position-${f.id}`}
                type="number"
                min={1}
                max={order.length}
                value={i + 1}
                onChange={(e) => setPosition(i, Number(e.target.value))}
                className="w-12 p-1 border border-white/10 rounded text-sm transition-colors duration-150 focus:ring-2 focus:ring-white/20"
              />
              <button
                className="px-2 py-1 bg-red-500 text-white rounded text-sm transition-colors duration-150 hover:bg-red-600"
                onClick={() => onAssignToggle(f.id)}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          className="px-3 py-1 bg-blue-600 text-white rounded"
          onClick={save}
        >
          Save order
        </button>
        <button
          className="px-3 py-1 border rounded"
          onClick={() => setOrder(player.files ?? [])}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
