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
  label?: string;
  pct?: number; // undefined = barre indéterminée
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

  // XHR plutôt que fetch : seul moyen d'avoir la progression de l'envoi.
  function request(item: Item, toText: boolean): Promise<{ blob?: Blob; text?: string }> {
    return new Promise((resolve, reject) => {
      const qs = new URLSearchParams({ name: item.file.name, language });
      const xhr = new XMLHttpRequest();
      xhr.open("POST", (toText ? "/api/transcribe?" : "/api/extract?") + qs);
      if (!toText) xhr.responseType = "blob";
      let seen = 0;
      let result: string | undefined;
      let failure = "";
      let total = 0;

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        patch(item.id, pct < 100
          ? { label: `Envoi… ${pct} %`, pct }
          : { label: toText ? "Extraction de l'audio…" : "Conversion en MP3…", pct: undefined });
      };

      if (toText) {
        xhr.onprogress = () => {
          const lines = xhr.responseText.slice(seen).split("\n");
          lines.pop(); // dernière ligne éventuellement incomplète
          seen += lines.reduce((n, l) => n + l.length + 1, 0);
          for (const l of lines.filter(Boolean)) {
            let m: any;
            try { m = JSON.parse(l); } catch { continue; }
            if (m.total) { total = m.total; patch(item.id, { label: `Transcription 0/${total}`, pct: 0 }); }
            if (m.done) patch(item.id, { label: `Transcription ${m.done}/${total}`, pct: (m.done / total) * 100 });
            if (m.text !== undefined) result = m.text;
            if (m.error) failure = m.error;
          }
        };
      }

      xhr.onerror = () => reject(new Error("Connexion au serveur impossible."));
      xhr.onload = async () => {
        if (xhr.status !== 200) {
          let msg = "";
          try {
            const raw = toText ? xhr.responseText : await (xhr.response as Blob).text();
            msg = JSON.parse(raw).error;
          } catch {}
          return reject(new Error(msg || (xhr.status === 413 ? "Fichier trop gros pour le serveur." : `Erreur serveur (${xhr.status}).`)));
        }
        if (!toText) return resolve({ blob: xhr.response });
        xhr.onprogress?.(null as any); // vide les dernières lignes
        failure ? reject(new Error(failure)) : resolve({ text: result ?? "" });
      };
      xhr.send(item.file);
    });
  }

  async function convertOne(item: Item) {
    patch(item.id, { status: "loading", error: undefined, text: undefined, url: undefined, label: "Envoi… 0 %", pct: 0 });
    try {
      const r = await request(item, toText);
      if (toText) patch(item.id, { status: "done", text: r.text, label: undefined });
      else patch(item.id, { status: "done", url: URL.createObjectURL(r.blob!), label: undefined });
    } catch (e) {
      patch(item.id, { status: "error", error: (e as Error).message, label: undefined });
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
              {i.status === "loading" && (
                <div>
                  <p className="mb-1 text-xs text-slate-500">{i.label}</p>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full bg-indigo-600 transition-all ${i.pct === undefined ? "w-full animate-pulse" : ""}`}
                      style={i.pct === undefined ? undefined : { width: `${i.pct}%` }}
                    />
                  </div>
                </div>
              )}
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
