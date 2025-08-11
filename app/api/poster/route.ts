import { NextRequest } from "next/server";

export const runtime = "nodejs";

const TMDB = "https://api.themoviedb.org/3";

export async function GET(req: NextRequest) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return new Response("TMDB_API_KEY not set", { status: 500 });

  const q = req.nextUrl.searchParams.get("query") || "";
  const type = (req.nextUrl.searchParams.get("type") || "multi").toLowerCase();
  const seasonParam = req.nextUrl.searchParams.get("season");
  if (!q) return new Response("Missing query", { status: 400 });

  try {
    const searchUrl =
      type === "movie"
        ? `${TMDB}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(q)}`
        : type === "tv"
        ? `${TMDB}/search/tv?api_key=${apiKey}&query=${encodeURIComponent(q)}`
        : `${TMDB}/search/multi?api_key=${apiKey}&query=${encodeURIComponent(q)}`;

    const sRes = await fetch(searchUrl);
    if (!sRes.ok) throw new Error(`TMDB search error: ${sRes.status}`);
    const sData = await sRes.json();

    if (!sData.results?.length) return Response.json({ poster: null });

    // TV season specific poster
    if (type === "tv" && seasonParam) {
      const showId = sData.results[0].id;
      const n = seasonParam.match(/^s?(\d{1,2})/i)?.[1] || seasonParam;
      const seaRes = await fetch(`${TMDB}/tv/${showId}/season/${n}?api_key=${apiKey}`);
      if (seaRes.ok) {
        const sea = await seaRes.json();
        if (sea.poster_path) {
          return Response.json({ poster: `https://image.tmdb.org/t/p/w500${sea.poster_path}` });
        }
      }
    }

    const first = sData.results[0];
    const poster = first.poster_path ? `https://image.tmdb.org/t/p/w500${first.poster_path}` : null;
    return Response.json({ poster });
  } catch (e) {
    console.error(e);
    return new Response("Error fetching from TMDB", { status: 500 });
  }
}
