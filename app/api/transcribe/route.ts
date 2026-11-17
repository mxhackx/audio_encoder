import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import OpenAI from "openai";
import { HttpError, toMp3Segments, withUpload } from "@/lib/ffmpeg";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 25 * 1024 * 1024;
const VIDEO = /\.(mp4|mov)$/i;

export async function POST(req: Request) {
  try {
    const useGroq = !!process.env.GROQ_API_KEY;
    if (!useGroq && !process.env.OPENAI_API_KEY) {
      throw new HttpError("GROQ_API_KEY (ou OPENAI_API_KEY) n'est pas configurée sur le serveur.", 500);
    }
    const lang = new URL(req.url).searchParams.get("language") ?? "auto";

    // Un fichier audio léger passe tel quel ; sinon (vidéo ou > 25 Mo) on
    // extrait un MP3 compressé, découpé en morceaux transcrits un par un.
    const parts = await withUpload(req, async (f) => {
      if (!VIDEO.test(f.name) && f.size <= MAX_BYTES) {
        return [new File([new Uint8Array(await readFile(f.path))], f.name)];
      }
      const chunks = await toMp3Segments(f.path);
      return chunks.map((c, n) => new File([new Uint8Array(c)], `part${n}.mp3`, { type: "audio/mpeg" }));
    });

    const openai = useGroq
      ? new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" })
      : new OpenAI();
    const model = process.env.TRANSCRIBE_MODEL || (useGroq ? "whisper-large-v3-turbo" : "gpt-4o-transcribe");

    // Réponse en flux (une ligne JSON par événement) pour suivre la progression.
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(c) {
        const send = (o: object) => c.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        try {
          send({ total: parts.length });
          const texts: string[] = [];
          for (let i = 0; i < parts.length; i++) {
            const res = await openai.audio.transcriptions.create({
              file: parts[i],
              model,
              ...(lang !== "auto" ? { language: lang } : {}),
            });
            texts.push(res.text.trim());
            send({ done: i + 1 });
          }
          send({ text: texts.join(" ") });
        } catch (e) {
          send({ error: (e as Error).message });
        }
        c.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
