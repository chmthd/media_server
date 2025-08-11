import { NextRequest } from "next/server";

export const runtime = "nodejs";
const TMDB = "https://api.themoviedb.org/3";

function norm(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return new Response("TMDB_API_KEY not set", { status: 500 });

  const q = (req.nextUrl.searchParams.get("query") || "").trim();
  const type = (req.nextUrl.searchParams.get("type") || "multi").toLowerCase();
  const seasonParam = req.nextUrl.searchParams.get("season");
  const year = req.nextUrl.searchParams.get("year") || "";

  if (!q) return new Response("Missing query", { status: 400 });

  try {
    const qs = new URLSearchParams({ api_key: apiKey, query: q });
    if (year) {
      if (type === "movie") qs.set("year", year);
      if (type === "tv") qs.set("first_air_date_year", year);
    }

    const searchUrl =
      type === "movie" ? `${TMDB}/search/movie?${qs}` :
      type === "tv"    ? `${TMDB}/search/tv?${qs}` :
                         `${TMDB}/search/multi?${qs}`;

    const sRes = await fetch(searchUrl);
    if (!sRes.ok) throw new Error(`TMDB search error: ${sRes.status}`);
    const sData = await sRes.json();

    if (!sData.results?.length) return Response.json({ poster: null });
    if (type === "tv" && seasonParam) {
      const show = sData.results[0];
      if (show?.id) {
        const n = seasonParam.match(/^s?(\d{1,2})/i)?.[1] || seasonParam;
        const seaRes = await fetch(`${TMDB}/tv/${show.id}/season/${n}?api_key=${apiKey}`);
        if (seaRes.ok) {
          const sea = await seaRes.json();
          if (sea.poster_path) {
            return Response.json({ poster: `https://image.tmdb.org/t/p/w500${sea.poster_path}` });
          }
        }
      }
    }

    // pick best result
    const qn = norm(q);
    const candidates = sData.results as any[];

    const byYear = (r: any) => {
      const y = (r.release_date || r.first_air_date || "").slice(0, 4);
      return year ? y === year : true;
    };

    const best =
      candidates.find(r => byYear(r) && norm(r.title || r.name) === qn) ||
      candidates.find(r => norm(r.title || r.name) === qn) ||
      candidates.find(r => byYear(r)) ||
      candidates[0];

    const poster = best?.poster_path ? `https://image.tmdb.org/t/p/w500${best.poster_path}` : null;
    return Response.json({ poster });
  } catch (e) {
    console.error(e);
    return new Response("Error fetching from TMDB", { status: 500 });
  }
}
