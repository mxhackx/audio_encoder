import { NextResponse } from "next/server";
import { HttpError, toMp3, withUpload } from "@/lib/ffmpeg";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    return await withUpload(req, async (f) => {
      const mp3 = await toMp3(f.path);
      const name = f.name.replace(/\.[^.]+$/, "") + ".mp3";
      return new Response(new Uint8Array(mp3), {
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        },
      });
    });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
