"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, Copy, Download, Loader2, Upload } from "lucide-react";

const INPUTS = ["MP4", "MP3", "WAV", "M4A"];
const OUTPUTS = ["MP3", "Texte"];

export default function Home() {
  const [inFmt, setInFmt] = useState("MP4");
  const [outFmt, setOutFmt] = useState("MP3");
  const [language, setLanguage] = useState("auto");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const toText = outFmt === "Texte";
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file) return setPreview("");
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function reset() {
    setText("");
    setError("");
    setAudioUrl("");
  }

  async function convert() {
    if (!file) return;
    setLoading(true);
    reset();
    const body = new FormData();
    body.append("file", file);
    body.append("language", language);
    try {
      const res = await fetch(toText ? "/api/transcribe" : "/api/extract", { method: "POST", body });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erreur inconnue");
      if (toText) setText((await res.json()).text);
      else setAudioUrl(URL.createObjectURL(await res.blob()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const base = file?.name.replace(/\.[^.]+$/, "") ?? "resultat";
  const sel = "w-full rounded-md border border-slate-300 bg-white p-2 text-sm";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-10">
      <AudioLines className="mx-auto h-10 w-10 text-indigo-600" />

      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-medium text-slate-500">
          Format d&apos;entrée
          <select className={sel} value={inFmt} onChange={(e) => (setInFmt(e.target.value), setFile(null), reset())}>
            {INPUTS.map((f) => <option key={f}>{f}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-500">
          Format de sortie
          <select className={sel} value={outFmt} onChange={(e) => (setOutFmt(e.target.value), reset())}>
            {OUTPUTS.map((f) => <option key={f}>{f}</option>)}
          </select>
        </label>
      </div>

      <button
        onClick={() => input.current?.click()}
        className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-6 py-10 text-sm text-slate-500 hover:border-indigo-400"
      >
        <Upload className="h-7 w-7" />
        {file ? `${file.name} (${(file.size / 1048576).toFixed(1)} Mo)` : `Choisir un fichier ${inFmt}`}
      </button>
      {preview && !file?.type.startsWith("video/") && (
        <audio src={preview} controls className="w-full" />
      )}
      {preview && file?.type.startsWith("video/") && (
        <video src={preview} controls muted playsInline className="max-h-56 w-full rounded-xl bg-black" />
      )}
      <input
        ref={input}
        type="file"
        hidden
        accept={"." + inFmt.toLowerCase()}
        onChange={(e) => (setFile(e.target.files?.[0] ?? null), reset())}
      />

      {toText && (
        <select className={sel} value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="auto">Langue : détection automatique</option>
          <option value="fr">Français</option>
          <option value="en">Anglais</option>
        </select>
      )}

      <button
        onClick={convert}
        disabled={!file || loading}
        className="flex items-center justify-center gap-2 rounded-md bg-indigo-600 py-3 font-medium text-white disabled:opacity-50"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Convertir
      </button>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {audioUrl && (
        <div className="space-y-3">
          <audio controls src={audioUrl} className="w-full" />
          <a href={audioUrl} download={base + ".mp3"} className="flex items-center gap-2 text-sm font-medium text-indigo-600">
            <Download className="h-4 w-4" /> Télécharger le MP3
          </a>
        </div>
      )}

      {text && (
        <div className="space-y-3 rounded-xl bg-white p-4 shadow">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
          <div className="flex gap-4 text-sm font-medium text-indigo-600">
            <button onClick={() => navigator.clipboard.writeText(text)} className="flex items-center gap-1">
              <Copy className="h-4 w-4" /> Copier
            </button>
            <a
              href={"data:text/plain;charset=utf-8," + encodeURIComponent(text)}
              download={base + ".txt"}
              className="flex items-center gap-1"
            >
              <Download className="h-4 w-4" /> .txt
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
