import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export const MAX_UPLOAD = 1024 * 1024 * 1024; // 1 Go

const FFMPEG = process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ["-y", "-loglevel", "error", ...args]);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", () => reject(new Error("FFmpeg est introuvable sur le serveur.")));
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error("Échec FFmpeg : " + err.slice(-300)))
    );
  });
}

export class HttpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Écrit le corps de la requête sur disque en flux (sans le charger en mémoire). */
export async function withUpload<T>(
  req: Request,
  fn: (file: { path: string; size: number; name: string }) => Promise<T>
): Promise<T> {
  const url = new URL(req.url);
  const name = url.searchParams.get("name") || "input.bin";
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD) throw new HttpError("Fichier trop gros (max 1 Go).", 413);
  if (!req.body) throw new HttpError("Aucun fichier reçu.", 400);

  const dir = await mkdtemp(path.join(tmpdir(), "audioconvert-"));
  try {
    const input = path.join(dir, "input" + (path.extname(name).replace(/[^.\w]/g, "") || ".bin"));
    let size = 0;
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        size += chunk.length;
        size > MAX_UPLOAD ? cb(new HttpError("Fichier trop gros (max 1 Go).", 413)) : cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(req.body as any), counter, createWriteStream(input));
    return await fn({ path: input, size, name });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Extrait la piste audio en MP3. `small` = mono 16 kHz 48 kbps (idéal pour la transcription). */
export async function toMp3(inputPath: string, small = false): Promise<Buffer> {
  const output = inputPath + ".mp3";
  const codec = small ? ["-ac", "1", "-ar", "16000", "-b:a", "48k"] : ["-q:a", "2"];
  await run(["-i", inputPath, "-vn", ...codec, output]);
  return readFile(output);
}

/** MP3 léger (mono 16 kHz) découpé en morceaux de ~10 min pour la transcription. */
export async function toMp3Segments(inputPath: string): Promise<Buffer[]> {
  const seconds = process.env.SEGMENT_SECONDS || "600";
  const dir = path.dirname(inputPath);
  await run([
    "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k",
    "-f", "segment", "-segment_time", seconds, "-reset_timestamps", "1",
    path.join(dir, "chunk_%04d.mp3"),
  ]);
  const names = (await readdir(dir)).filter((n) => n.startsWith("chunk_")).sort();
  return Promise.all(names.map((n) => readFile(path.join(dir, n))));
}
