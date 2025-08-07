
import fs from 'fs';
import path from 'path';

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov'];

export function getMediaFiles(dir: string): { name: string; path: string }[] {
  const files: { name: string; path: string }[] = [];

  if (!fs.existsSync(dir)) {
    console.warn(`Directory not found: ${dir}`);
    return files;
  }

  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...getMediaFiles(fullPath));
    } else if (VIDEO_EXTENSIONS.includes(path.extname(item).toLowerCase())) {
      files.push({
        name: path.basename(item),
        path: fullPath,
      });
    }
  }

  return files;
}
