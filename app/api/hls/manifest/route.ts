import { NextRequest } from "next/server";
import fsp from "fs/promises";
import path from "path";
import { ensureTranscoding, fullPathFromRelative, waitForFile } from "@/utils/hlsManager";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const mediaRoot = process.env.MEDIA_PATH;
  if (!mediaRoot) return new Response("MEDIA_PATH not set", { status: 500 });

  const rel = req.nextUrl.searchParams.get("file");
  if (!rel) return new Response("Missing file", { status: 400 });

  let full: string;
  try {
    full = fullPathFromRelative(decodeURIComponent(rel), mediaRoot);
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const { dir } = await ensureTranscoding(full);
  const manifestPath = path.join(dir, "index.m3u8");

  const ok = await waitForFile(manifestPath, 12000);
  if (!ok) {
    // hint the client to retry soon
    return new Response("#EXTM3U\n# Waiting for transcoder…", {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    });
  }

  let text = await fsp.readFile(manifestPath, "utf8");
  text = text
    .split("\n")
    .map((line) =>
      line.trim().endsWith(".ts")
        ? `/api/hls/segment?file=${encodeURIComponent(rel)}&seg=${encodeURIComponent(line.trim())}`
        : line
    )
    .join("\n");

  return new Response(text, {
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "no-store",
      "ETag": `"${Date.now()}"`, // cheap change trigger
    },
  });
}
