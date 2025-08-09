import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("query");
  if (!query) {
    return new Response("Missing query", { status: 400 });
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return new Response("TMDB_API_KEY not set", { status: 500 });
  }

  const searchUrl = `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(searchUrl);
    if (!res.ok) {
      throw new Error(`TMDB API error: ${res.status}`);
    }
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      return Response.json({ poster: null });
    }

    const posterPath = data.results[0].poster_path
      ? `https://image.tmdb.org/t/p/w500${data.results[0].poster_path}`
      : null;

    return Response.json({ poster: posterPath });
  } catch (err) {
    console.error(err);
    return new Response("Error fetching from TMDB", { status: 500 });
  }
}
