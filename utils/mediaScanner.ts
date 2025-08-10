import fs from 'fs';  
import fsPromises from 'fs/promises';  
import path from 'path';

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov'];

export async function getMediaFiles(dir: string) {
  let results: any[] = [];

  try {
    const stats = await fsPromises.stat(dir);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${dir}`);
    }
  } catch (err) {
    throw new Error(`Directory not found or accessible: ${dir}`);
  }

  async function scanFolder(folderPath: string) {
    const items = await fsPromises.readdir(folderPath, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(folderPath, item.name);

      if (item.isDirectory()) {
        await scanFolder(fullPath); 
      } else {
        const ext = path.extname(item.name).toLowerCase();
        if (VIDEO_EXTENSIONS.includes(ext)) {
          const fileName = item.name;
          const relativePath = path.relative(dir, fullPath);

          const showFolder = path.basename(path.dirname(fullPath)); 
          const rootFolder = path.basename(path.dirname(path.dirname(fullPath))); 

          const isTVShow = fs.existsSync(path.join(folderPath, rootFolder, "Season"));
          const mediaType = isTVShow ? "TV Show" : "Movie";

          results.push({
            name: fileName,
            path: relativePath,
            show: showFolder,
            type: mediaType, 
            rootFolder,       
          });
        }
      }
    }
  }

  await scanFolder(dir);
  return results;
}
