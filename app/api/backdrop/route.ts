export const dynamic = "force-dynamic";

function byQuality(a: any, b: any) {
  const qa = (a.vote_average ?? 0) + (a.vote_count ?? 0) * 0.01;
  const qb = (b.vote_average ?? 0) + (b.vote_count ?? 0) * 0.01;
  const sa = (a.width ?? 0) * (a.height ?? 0);
  const sb = (b.width ?? 0) * (b.height ?? 0);
  return qb - qa || sb - sa;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = (url.searchParams.get("type") || "tv").toLowerCase(); // tv | movie
  const query = url.searchParams.get("query") || "";
  const year = url.searchParams.get("year") || "";

  const key = process.env.TMDB_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ error: "TMDB_API_KEY missing" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    // id
    const searchEndpoint =
      type === "movie"
        ? `https://api.themoviedb.org/3/search/movie?api_key=${key}&query=${encodeURIComponent(
            query
          )}${year ? `&year=${year}` : ""}`
        : `https://api.themoviedb.org/3/search/tv?api_key=${key}&query=${encodeURIComponent(
            query
          )}${year ? `&first_air_date_year=${year}` : ""}`;

    const sRes = await fetch(searchEndpoint, { next: { revalidate: 3600 } });
    const sJson = await sRes.json();
    const id = sJson?.results?.[0]?.id;
    if (!id) return new Response(JSON.stringify({ backdrop: null }), { headers: { "content-type": "application/json" } });

    // pull and choose backdrop
    const imgRes = await fetch(
      `https://api.themoviedb.org/3/${type}/${id}/images?api_key=${key}&include_image_language=en,null`,
      { next: { revalidate: 3600 } }
    );
    const imgJson = await imgRes.json();
    const backs = (imgJson?.backdrops || [])
      .filter((b: any) => (b.aspect_ratio ?? 0) >= 1.6); 

    backs.sort(byQuality);
    const best = backs[0];

    const base = "https://image.tmdb.org/t/p";
    const backdrop = best?.file_path ? `${base}/w1280${best.file_path}` : null;

    return new Response(JSON.stringify({ backdrop }), { headers: { "content-type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ backdrop: null }), { headers: { "content-type": "application/json" } });
  }
}
