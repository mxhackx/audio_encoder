import { NextResponse } from "next/server";
import OpenAI from "openai";
import { toMp3 } from "@/lib/ffmpeg";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const useGroq = !!process.env.GROQ_API_KEY;
    if (!useGroq && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "GROQ_API_KEY (ou OPENAI_API_KEY) n'est pas configurée sur le serveur." },
        { status: 500 }
      );
    }
    const form = await req.formData();
    const file = form.get("file");
    const lang = String(form.get("language") ?? "auto");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
    }

    // Vidéo ou fichier trop lourd : on réduit à un MP3 léger via FFmpeg.
    let upload: File = file;
    if (file.type.startsWith("video/") || file.size > MAX_BYTES) {
      const mp3 = await toMp3(file, true);
      upload = new File([new Uint8Array(mp3)], "audio.mp3", { type: "audio/mpeg" });
    }
    if (upload.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Même compressé, l'audio dépasse 25 Mo : découpez le fichier." },
        { status: 413 }
      );
    }

    const openai = useGroq
      ? new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" })
      : new OpenAI();
    const res = await openai.audio.transcriptions.create({
      file: upload,
      model: process.env.TRANSCRIBE_MODEL || (useGroq ? "whisper-large-v3-turbo" : "gpt-4o-transcribe"),
      ...(lang !== "auto" ? { language: lang } : {}),
    });
    return NextResponse.json({ text: res.text });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
