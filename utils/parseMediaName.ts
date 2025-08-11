// utils/parseMediaFilename.ts
/**
 * Extracts a clean, human title and (optional) year from noisy scene-style filenames
 * or folder names. Works for both movies and TV show folder names.
 */
const JUNK_TOKENS = [
  "1080p","720p","2160p","480p",
  "x264","x265","h264","h265","hevc","av1",
  "blu-ray","bluray","brrip","hdrip","dvdrip","webrip","web-dl","webdl","remux",
  "dvdscr","cam","r5",
  "aac","dts","truehd","atmos","eac3","dd5","ddp5","ddp7","5.1","7.1",
  "proper","repack","extended","remaster","remastered","uncut","unrated",
  "directors","director","cut","multi","dubbed","subbed","limited","internal"
];

const JUNK_REGEX = new RegExp(`\\b(?:${JUNK_TOKENS.join("|")})\\b`, "i");

function stripBrackets(s: string) {
  return s.replace(/\[[^\]]*]/g, " ").replace(/\{[^}]*}/g, " ");
}

export function parseMediaName(raw: string): { title: string; year?: number } {
  let s = raw.replace(/\.[^.]+$/, "");
  s = s.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
  s = stripBrackets(s);

  const ym = s.match(/(?:^|\D)((19|20)\d{2})(?!\d)/);
  const year = ym ? parseInt(ym[1], 10) : undefined;

  if (ym) {
    s = s.replace(ym[0], " ");
  }

  s = s
    .split(/\s+/)
    .filter(t => !JUNK_REGEX.test(t))
    .join(" ");

  s = s.replace(/[()\[\]-]/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^the\s*,\s*(.+)$/i, "The $1");

  return { title: s, year };
}

