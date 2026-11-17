"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, Copy, Download, Loader2, Upload, X } from "lucide-react";

const VIDEO_IN = ["MP4", "MOV"];
const AUDIO_IN = ["MP3", "WAV", "M4A"];
const INPUTS = [...VIDEO_IN, ...AUDIO_IN];
const OUTPUTS = ["MP3", "Texte"];
const MAX = 1024 * 1024 * 1024;

type Item = {
  id: number;
  file: File;
  status: "idle" | "loading" | "done" | "error";
  text?: string;
  url?: string;
  error?: string;
};

let nextId = 1;

function Preview({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  if (!url) return null;
  return /\.(mp4|mov)$/i.test(file.name) ? (
    <video src={url} controls muted playsInline className="max-h-44 w-full rounded-lg bg-black" />
  ) : (
    <audio src={url} controls className="w-full" />
  );
}

export default function Home() {
  const [inFmt, setInFmt] = useState("MP4");
  const [outFmt, setOutFmt] = useState("MP3");
  const [language, setLanguage] = useState("auto");
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const toText = outFmt === "Texte";
  const kind = VIDEO_IN.includes(inFmt) ? "vidéos" : "audios";

  function patch(id: number, p: Partial<Item>) {
    setItems((all) => all.map((i) => (i.id === id ? { ...i, ...p } : i)));
  }

  function clear() {
    items.forEach((i) => i.url && URL.revokeObjectURL(i.url));
    setItems([]);
    setError("");
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const files = Array.from(list);
    const tooBig = files.filter((f) => f.size > MAX);
    setError(tooBig.length ? `Trop gros (max 1 Go) : ${tooBig.map((f) => f.name).join(", ")}` : "");
    setItems((all) => [
      ...all,
      ...files.filter((f) => f.size <= MAX).map((file) => ({ id: nextId++, file, status: "idle" as const })),
    ]);
    if (input.current) input.current.value = "";
  }

  async function convertOne(item: Item) {
    patch(item.id, { status: "loading", error: undefined, text: undefined, url: undefined });
    const qs = new URLSearchParams({ name: item.file.name, language });
    try {
      const res = await fetch((toText ? "/api/transcribe?" : "/api/extract?") + qs, {
        method: "POST",
        body: item.file,
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erreur inconnue");
      if (toText) patch(item.id, { status: "done", text: (await res.json()).text });
      else patch(item.id, { status: "done", url: URL.createObjectURL(await res.blob()) });
    } catch (e) {
      patch(item.id, { status: "error", error: (e as Error).message });
    }
  }

  async function convertAll() {
    setRunning(true);
    for (const item of items) await convertOne(item); // un par un
    setRunning(false);
  }

  const base = (f: File) => f.name.replace(/\.[^.]+$/, "");
  const sel = "w-full rounded-md border border-slate-300 bg-white p-2 text-sm";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-10">
      <AudioLines className="mx-auto h-10 w-10 text-indigo-600" />

      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-medium text-slate-500">
          Format d&apos;entrée
          <select className={sel} value={inFmt} onChange={(e) => (setInFmt(e.target.value), clear())}>
            {INPUTS.map((f) => <option key={f}>{f}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-500">
          Format de sortie
          <select className={sel} value={outFmt} onChange={(e) => (setOutFmt(e.target.value), clear())}>
            {OUTPUTS.map((f) => <option key={f}>{f}</option>)}
          </select>
        </label>
      </div>

      <button
        onClick={() => input.current?.click()}
        disabled={running}
        className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-6 py-8 text-sm text-slate-500 hover:border-indigo-400"
      >
        <Upload className="h-7 w-7" />
        Choisir des {kind} {inFmt}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={"." + inFmt.toLowerCase()}
        onChange={(e) => addFiles(e.target.files)}
      />

      {items.length > 0 && (
        <ul className="space-y-4">
          {items.map((i) => (
            <li key={i.id} className="space-y-2 rounded-xl bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{i.file.name}</span>
                <span className="text-xs text-slate-400">{(i.file.size / 1048576).toFixed(1)} Mo</span>
                {i.status === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                ) : (
                  !running && (
                    <button onClick={() => setItems((a) => a.filter((x) => x.id !== i.id))} aria-label="Retirer">
                      <X className="h-4 w-4 text-slate-400" />
                    </button>
                  )
                )}
              </div>
              <Preview file={i.file} />
              {i.status === "error" && <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{i.error}</p>}
              {i.url && (
                <div className="space-y-2">
                  <audio controls src={i.url} className="w-full" />
                  <a href={i.url} download={base(i.file) + ".mp3"} className="flex items-center gap-2 text-sm font-medium text-indigo-600">
                    <Download className="h-4 w-4" /> Télécharger le MP3
                  </a>
                </div>
              )}
              {i.text !== undefined && (
                <div className="space-y-2">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{i.text}</p>
                  <div className="flex gap-4 text-sm font-medium text-indigo-600">
                    <button onClick={() => navigator.clipboard.writeText(i.text!)} className="flex items-center gap-1">
                      <Copy className="h-4 w-4" /> Copier
                    </button>
                    <a
                      href={"data:text/plain;charset=utf-8," + encodeURIComponent(i.text)}
                      download={base(i.file) + ".txt"}
                      className="flex items-center gap-1"
                    >
                      <Download className="h-4 w-4" /> .txt
                    </a>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {toText && (
        <select className={sel} value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="auto">Langue : détection automatique</option>
          <option value="fr">Français</option>
          <option value="en">Anglais</option>
        </select>
      )}

      <button
        onClick={convertAll}
        disabled={!items.length || running}
        className="flex items-center justify-center gap-2 rounded-md bg-indigo-600 py-3 font-medium text-white disabled:opacity-50"
      >
        {running && <Loader2 className="h-4 w-4 animate-spin" />}
        Convertir{items.length > 1 ? ` (${items.length})` : ""}
      </button>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </main>
  );
}
