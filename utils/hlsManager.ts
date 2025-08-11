import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { spawn, ChildProcess } from "child_process";

type Session = {
  dir: string;
  proc: ChildProcess | null;   
  lastAccess: number;
};

const SESSIONS = new Map<string, Session>();

function hashKey(fullPath: string) {
  return crypto.createHash("md5").update(fullPath).digest("hex");
}

export function fullPathFromRelative(rel: string, mediaRoot: string) {
  const resolved = path.resolve(mediaRoot, rel);
  if (!resolved.startsWith(path.resolve(mediaRoot))) {
    throw new Error("Forbidden path");
  }
  return resolved;
}

export async function ensureTranscoding(fullPath: string) {
  const key = hashKey(fullPath);
  let sess = SESSIONS.get(key);

  if (!sess) {
    const dir = path.join("/tmp", "hls", key);
    await fsp.mkdir(dir, { recursive: true });

    const args = [
      "-hide_banner",
      "-loglevel", "error",
      "-i", fullPath,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "21",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "faststart",
      "-f", "hls",
      "-hls_time", "4",
      "-hls_list_size", "0",
      "-hls_segment_filename", path.join(dir, "seg_%05d.ts"),
      path.join(dir, "index.m3u8"),
    ];

    const proc = spawn("ffmpeg", args, { stdio: "ignore" }); // streams may be null
    sess = { dir, proc, lastAccess: Date.now() };
    SESSIONS.set(key, sess);

    proc.on("exit", () => {
    });
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
