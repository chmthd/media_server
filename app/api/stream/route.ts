import fs from "fs";
import { NextRequest } from "next/server";
import path from "path";

export const runtime = "nodejs";

/** Minimal extension → mime map so we don't depend on "mime" */
function guessMime(p: string): string {
  const ext = path.extname(p).toLowerCase();
  switch (ext) {
    case ".mp4":
    case ".m4v":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".ts":
    case ".m2ts":
      return "video/mp2t";
    case ".mkv":
      // Not an official browser-playable mime, but fine for download/stream.
      // Browsers will still play if codecs are supported and the container is OK.
      return "video/x-matroska";
    case ".mov":
      return "video/quicktime";
    case ".avi":
      return "video/x-msvideo";
    case ".mpg":
    case ".mpeg":
      return "video/mpeg";
    default:
      return "application/octet-stream";
  }
}

export async function GET(req: NextRequest) {
  const mediaPath = process.env.MEDIA_PATH!;
  const fileParam = req.nextUrl.searchParams.get("file");

  if (!fileParam) {
    return new Response("Missing file param", { status: 400 });
  }

  const decodedPath = decodeURIComponent(fileParam);
  const fullPath = path.join(mediaPath, decodedPath);

  // directory traversal guard
  if (!fullPath.startsWith(path.resolve(mediaPath))) {
    return new Response("Forbidden", { status: 403 });
  }

  if (!fs.existsSync(fullPath)) {
    return new Response("File not found", { status: 404 });
  }

  const stat = fs.statSync(fullPath);
  const fileSize = stat.size;
  const range = req.headers.get("range");
  const contentType = guessMime(fullPath);

  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    const stream = fs.createReadStream(fullPath, { start, end });
    return new Response(stream as any, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": `${chunkSize}`,
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
      },
    });
  } else {
    const stream = fs.createReadStream(fullPath);
    return new Response(stream as any, {
      status: 200,
      headers: {
        "Content-Length": `${fileSize}`,
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
      },
    });
  }
}
