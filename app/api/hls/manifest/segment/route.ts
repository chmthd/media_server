import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { ensureTranscoding, fullPathFromRelative } from "@/utils/hlsManager";

export async function GET(req: NextRequest) {
  const mediaRoot = process.env.MEDIA_PATH;
  if (!mediaRoot) return new Response("MEDIA_PATH not set", { status: 500 });

  const rel = req.nextUrl.searchParams.get("file");
  const seg = req.nextUrl.searchParams.get("seg");
  if (!rel || !seg) return new Response("Missing params", { status: 400 });

  let full: string;
  try {
    full = fullPathFromRelative(decodeURIComponent(rel), mediaRoot);
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const { dir } = await ensureTranscoding(full);
    const segPath = path.join(dir, seg);

    if (!fs.existsSync(segPath)) return new Response("Segment not found", { status: 404 });

    const stream = fs.createReadStream(segPath);
    return new Response(stream as any, {
      status: 200,
      headers: {
        "Content-Type": "video/mp2t",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e: any) {
    return new Response(e?.message || "Segment error", { status: 500 });
  }
}
