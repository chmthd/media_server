import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { ensureTranscoding, fullPathFromRelative, waitForFile } from "@/utils/hlsManager";

export const runtime = "nodejs";

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

  const { dir } = await ensureTranscoding(full);
  const segPath = path.join(dir, seg);

  const ok = await waitForFile(segPath, 6000);
  if (!ok) return new Response("Segment not ready", { status: 404 });

  const stream = fs.createReadStream(segPath);
  return new Response(stream as any, {
    headers: {
      "Content-Type": "video/mp2t",
      "Cache-Control": "no-cache",
    },
  });
}
