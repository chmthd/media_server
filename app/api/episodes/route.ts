export const dynamic = "force-dynamic";

type TmdbEpisode = {
  episode_number: number;
  name: string;
  overview?: string;
  still_path?: string | null;
};

async function searchShowId(query: string, year: string | undefined, key: string): Promise<number | null> {
  // try with year if provided
  if (year) {
    const res = await fetch(
      `https://api.themoviedb.org/3/search/tv?api_key=${key}&query=${encodeURIComponent(query)}&first_air_date_year=${year}`,
      { next: { revalidate: 3600 } }
    );
    const json = await res.json();
    const withYear = json?.results?.[0]?.id;
    if (withYear) return withYear;
  }
  // fallback without year
  const res2 = await fetch(
    `https://api.themoviedb.org/3/search/tv?api_key=${key}&query=${encodeURIComponent(query)}`,
    { next: { revalidate: 3600 } }
  );
  const json2 = await res2.json();
  return json2?.results?.[0]?.id ?? null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get("query") || "";
  const season = Number(url.searchParams.get("season") || "1");
  const year = url.searchParams.get("year") || undefined;
  const key = process.env.TMDB_API_KEY;

  if (!key) {
    return new Response(JSON.stringify({ error: "TMDB_API_KEY missing" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    // find tv show id from search (with fallback)
    const id = await searchShowId(query, year, key);
    if (!id) {
      return new Response(JSON.stringify({ episodes: {} }), {
        headers: { "content-type": "application/json" },
      });
    }

    // fetch season details → episodes list
    const seasonRes = await fetch(
      `https://api.themoviedb.org/3/tv/${id}/season/${season}?api_key=${key}`,
      { next: { revalidate: 3600 } }
    );
    const seasonJson = await seasonRes.json();

    const eps: TmdbEpisode[] = seasonJson?.episodes || [];
    const map: Record<number, TmdbEpisode> = {};
    for (const e of eps) {
      if (e?.episode_number != null) map[e.episode_number] = e;
    }

    const imageBase = "https://image.tmdb.org/t/p";
    return new Response(
      JSON.stringify({
        episodes: map,
        imageBase,
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch {
    return new Response(JSON.stringify({ episodes: {} }), {
      headers: { "content-type": "application/json" },
    });
  }
}
