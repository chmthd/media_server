import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { spawn, ChildProcess, spawnSync } from "child_process";

/**
 * GPU offload policy
 * - Set TRANSCODE_ACCEL to one of: "nvenc" | "vaapi" | "videotoolbox" | "cpu"
 *   (defaults to "cpu" if unset).
 * - For VAAPI, ensure /dev/dri/renderD128 is accessible.
 */
const ACCEL = (process.env.TRANSCODE_ACCEL || "cpu").toLowerCase();

type Session = { dir: string; proc: ChildProcess | null; lastAccess: number };
const SESSIONS = new Map<string, Session>();

function hashKey(fullPath: string, extra = "") {
  return crypto.createHash("md5").update(fullPath + "|" + extra).digest("hex");
}

export function fullPathFromRelative(rel: string, mediaRoot: string) {
  const resolved = path.resolve(mediaRoot, rel);
  if (!resolved.startsWith(path.resolve(mediaRoot))) throw new Error("Forbidden path");
  return resolved;
}

/* ----------------------------- ffprobe helpers ----------------------------- */

type Probe = {
  format?: { format_name?: string };
  streams?: Array<{ codec_type?: string; codec_name?: string }>;
};

function ffprobeJson(input: string): Probe | null {
  try {
    const out = spawnSync("ffprobe", [
      "-v", "error",
      "-print_format", "json",
      "-show_streams",
      "-show_format",
      input
    ], { encoding: "utf8" });
    if (out.status !== 0) return null;
    return JSON.parse(out.stdout || "{}") as Probe;
  } catch {
    return null;
  }
}

function pickCodecs(p: Probe) {
  const v = p.streams?.find(s => s.codec_type === "video")?.codec_name?.toLowerCase();
  const a = p.streams?.find(s => s.codec_type === "audio")?.codec_name?.toLowerCase();
  const fmt = p.format?.format_name?.toLowerCase() || "";
  return { vCodec: v, aCodec: a, format: fmt };
}

/**
 * Decide how to build HLS:
 * - Prefer COPY where possible (video H.264; audio AAC).
 * - If audio is not AAC, re-encode audio only.
 * - If video is not H.264, transcode video (on GPU if configured).
 *
 * We do HLS (not MP4 remux) so the existing /api/hls/* endpoints keep working.
 */
function buildFfmpegArgs(input: string, outDir: string, codecs: { vCodec?: string; aCodec?: string }) {
  const seg = path.join(outDir, "seg_%05d.ts");
  const index = path.join(outDir, "index.m3u8");

  // Video
  const videoIsH264 = codecs.vCodec === "h264" || codecs.vCodec === "mpeg4avc";

  let vArgs: string[] = [];
  if (videoIsH264) {
    // copy video
    vArgs = ["-c:v", "copy"];
  } else {
    // transcode video → h264 on GPU if possible
    if (ACCEL === "nvenc") {
      vArgs = ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda", "-c:v", "h264_nvenc", "-preset", "p4", "-b:v", "5M", "-maxrate", "7M", "-bufsize", "10M", "-g", "48", "-keyint_min", "48", "-sc_threshold", "0"];
    } else if (ACCEL === "vaapi") {
      vArgs = ["-hwaccel", "vaapi", "-vaapi_device", "/dev/dri/renderD128", "-vf", "format=nv12,hwupload", "-c:v", "h264_vaapi", "-b:v", "5M", "-maxrate", "7M", "-bufsize", "10M", "-g", "48", "-sc_threshold", "0"];
    } else if (ACCEL === "videotoolbox") {
      vArgs = ["-c:v", "h264_videotoolbox", "-b:v", "5M", "-maxrate", "7M", "-bufsize", "10M", "-g", "48"];
    } else {
      vArgs = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-g", "48", "-sc_threshold", "0"];
    }
  }

  // Audio
  const audioIsAAC = codecs.aCodec === "aac" || codecs.aCodec === "mp4a";
  const aArgs = audioIsAAC ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "160k", "-ac", "2"];

  return [
    "-hide_banner", "-loglevel", "error",
    "-i", input,
    ...vArgs,
    ...aArgs,
    "-movflags", "+faststart",
    "-hls_time", "4",
    "-hls_list_size", "10",
    "-hls_flags", "delete_segments+append_list",
    "-hls_segment_filename", seg,
    "-f", "hls",
    index,
  ];
}

/* ----------------------------- Public API ----------------------------- */

export async function ensureTranscoding(fullPath: string) {
  // Probe once and key the session on codec decision so caching is correct.
  const probe = ffprobeJson(fullPath) || {};
  const codecs = pickCodecs(probe);
  const keyExtra = JSON.stringify({ ACCEL, v: codecs.vCodec, a: codecs.aCodec });
  const key = hashKey(fullPath, keyExtra);

  let sess = SESSIONS.get(key);

  if (!sess) {
    const dir = path.join("/tmp", "hls", key);
    await fsp.mkdir(dir, { recursive: true });

    const args = buildFfmpegArgs(fullPath, dir, codecs);
    const proc = spawn("ffmpeg", args, { stdio: "ignore" });
    sess = { dir, proc, lastAccess: Date.now() };
    SESSIONS.set(key, sess);
  } else {
    sess.lastAccess = Date.now();
  }

  return { key, dir: sess.dir };
}

export async function waitForFile(filePath: string, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fsp.access(filePath, fs.constants.R_OK);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  return false;
}
