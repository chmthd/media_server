import fs from "fs";
import fsp from "fs/promises";
import path from "path";

const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".avi", ".mov"];

type Scanned = {
  name: string;
  path: string;        
  show: string;       
  type: "Movie" | "TV Show";
  rootFolder: string;  
  season?: string;     
};

export async function getMediaFiles(root: string): Promise<Scanned[]> {
  const results: Scanned[] = [];

  const stat = await fsp.stat(root).catch(() => null);
  if (!stat || !stat.isDirectory()) throw new Error(`Directory not found or accessible: ${root}`);

  async function walk(dir: string) {
    const items = await fsp.readdir(dir, { withFileTypes: true });
    for (const it of items) {
      const full = path.join(dir, it.name);
      if (it.isDirectory()) {
        await walk(full);
        continue;
      }

      const ext = path.extname(it.name).toLowerCase();
      if (!VIDEO_EXTENSIONS.includes(ext)) continue;

      const rel = path.relative(root, full);                 
      const parts = rel.split(path.sep);
      const top = (parts[0] || "").toLowerCase();

      const isTV = top.includes("tv") && top.includes("show"); 
      const baseNoExt = path.basename(it.name, ext);

      if (isTV) {

        const showTitle = parts[1] || "Unknown Show";
        const seasonFolder = parts[2] || "";
        const m =
          seasonFolder.match(/^(?:season\s*)?(\d{1,2})$/i) ||
          seasonFolder.match(/^s(\d{1,2})$/i) ||
          baseNoExt.match(/S(\d{1,2})/i);
        const s = m ? `S${m[1].padStart(2, "0")}` : "Unknown Season";

        results.push({
          name: it.name,
          path: rel,
          show: showTitle,
          type: "TV Show",
          rootFolder: showTitle,
          season: s,
        });
      } else {
        const second = parts[1];
        const movieTitle = second ? second : baseNoExt;

        results.push({
          name: it.name,
          path: rel,
          show: movieTitle,
          type: "Movie",
          rootFolder: movieTitle,
        });
      }
    }
  }

  await walk(root);
  return results;
}
