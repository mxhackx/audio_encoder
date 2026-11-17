import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-y", "-loglevel", "error", ...args]);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", () => reject(new Error("FFmpeg est introuvable sur le serveur.")));
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error("Échec FFmpeg : " + err.slice(-300)))
    );
  });
}

/** Extrait la piste audio en MP3. `small` = mono 16 kHz 48 kbps (idéal pour la transcription). */
export async function toMp3(file: File, small = false): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "audioconvert-"));
  try {
    const input = path.join(dir, "input" + (path.extname(file.name) || ".bin"));
    const output = path.join(dir, "output.mp3");
    await writeFile(input, Buffer.from(await file.arrayBuffer()));
    const codec = small
      ? ["-ac", "1", "-ar", "16000", "-b:a", "48k"]
      : ["-q:a", "2"];
    await run(["-i", input, "-vn", ...codec, output]);
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
