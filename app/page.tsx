"use client";
import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

type MediaFile = {
  name: string;
  path: string;
  poster?: string;
  show: string;
  type: "Movie" | "TV Show";
  rootFolder: string;
  season?: string;
  cleanTitle: string;
  year?: number;
};

type GroupedMedia = {
  key: string;
  displayTitle: string;
  poster: string;
  kind: "Movie" | "TV Show";
  seasons: {
    seasonName: string;
    poster: string;
    files: MediaFile[];
  }[];
};

export default function PS3StyleUI() {
  const [media, setMedia] = useState<GroupedMedia[]>([]);
  const [activeTab, setActiveTab] = useState<"TV" | "Movies">("TV");
  const [selectedShow, setSelectedShow] = useState<GroupedMedia | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<MediaFile | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [fsPending, setFsPending] = useState(false);

  useEffect(() => {
    if (selectedEpisode && fsPending && videoRef.current) {
      const el = videoRef.current;
      const req =
        el.requestFullscreen ||
        // @ts-ignore
        el.webkitRequestFullscreen ||
        // @ts-ignore
        el.mozRequestFullScreen ||
        // @ts-ignore
        el.msRequestFullscreen;
      if (req) try { req.call(el); } catch {}
      setFsPending(false);
    }
  }, [selectedEpisode, fsPending]);

  useEffect(() => {
    if (!selectedEpisode || !videoRef.current) return;
    const video = videoRef.current;
    const m3u8 = `/api/hls/manifest?file=${encodeURIComponent(selectedEpisode.path)}`;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = m3u8;
    } else if (Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 30, lowLatencyMode: false });
      hls.loadSource(m3u8);
      hls.attachMedia(video);
      hlsRef.current = hls;
    } else {
      video.src = `/api/stream?file=${encodeURIComponent(selectedEpisode.path)}`;
    }

    return () => { hlsRef.current?.destroy(); hlsRef.current = null; };
  }, [selectedEpisode]);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/media");
      if (!res.ok) { console.error("API error:", res.status); return; }
      const files: MediaFile[] = await res.json();
      if (!Array.isArray(files)) { console.error("Unexpected format:", files); return; }

      const buckets = files.reduce((acc: Record<string, MediaFile[]>, f) => {
        const key = f.cleanTitle || f.show || f.rootFolder;
        (acc[key] ||= []).push(f);
        return acc;
      }, {});

      const groups: GroupedMedia[] = await Promise.all(
        Object.entries(buckets).map(async ([key, list]) => {
          const first = list[0];
          const kind = first.type;
          const title = first.cleanTitle || first.show || first.rootFolder;

          const posterRes = await fetch(
            `/api/poster?type=${kind === "Movie" ? "movie" : "tv"}&query=${encodeURIComponent(title)}${first.year ? `&year=${first.year}` : ""}`
          );
          const posterData = posterRes.ok ? await posterRes.json() : { poster: null };
          const groupPoster = posterData.poster || "/placeholder.jpg";

          let seasons: GroupedMedia["seasons"] = [];
          if (kind === "Movie") {
            seasons = [{ seasonName: "Movie", poster: groupPoster, files: list }];
          } else {
            const sMap = list.reduce((mm: Record<string, MediaFile[]>, f) => {
              const s = f.season || "Unknown Season";
              (mm[s] ||= []).push(f);
              return mm;
            }, {});
            seasons = await Promise.all(
              Object.keys(sMap).map(async (sName) => {
                const sRes = await fetch(
                  `/api/poster?type=tv&query=${encodeURIComponent(title)}&season=${encodeURIComponent(sName)}${first.year ? `&year=${first.year}` : ""}`
                );
                const sData = sRes.ok ? await sRes.json() : { poster: null };
                return { seasonName: sName, poster: sData.poster || "/placeholder.jpg", files: sMap[sName] };
              })
            );
          }

          return { key, displayTitle: title, poster: groupPoster, kind, seasons };
        })
      );

      setMedia(groups);
    }
    load();
  }, []);

  const visibleGroups = media.filter((g) =>
    activeTab === "Movies" ? g.kind === "Movie" : g.kind === "TV Show"
  );

  return (
    <div className="fa-bg min-h-screen text-white">
      <nav className="navbar glass">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/20 shadow-inner" />
          <span className="font-semibold text-lg drop-shadow">Local Media Server</span>
        </div>
        <div className="flex items-center gap-2 ml-6">
          <button className={`chip ${activeTab === "TV" ? "chip-active" : ""}`}
                  onClick={() => { setActiveTab("TV"); setSelectedShow(null); setSelectedEpisode(null); }}>
            TV Shows
          </button>
          <button className={`chip ${activeTab === "Movies" ? "chip-active" : ""}`}
                  onClick={() => { setActiveTab("Movies"); setSelectedShow(null); setSelectedEpisode(null); }}>
            Movies
          </button>
        </div>
        <div className="flex-1" />
        <div className="hidden sm:flex items-center gap-2">
          <input placeholder="Search"
                 className="search text-sm outline-none text-white placeholder-white/70 bg-transparent border border-white/20 rounded-full px-3 py-1" />
        </div>
      </nav>

      <main className="pt-24 px-5 md:px-8 pb-10">
        <section className="glass rounded-2xl p-4 md:p-6 shadow-2xl">
          <div className="flex gap-5 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory">
            {visibleGroups.map((g) => (
              <button key={`${g.kind}-${g.key}`} className="poster-card flex-shrink-0 text-center snap-start"
                      onClick={() => { setSelectedShow(g); setSelectedEpisode(null); }}>
                <img src={g.poster} alt={g.displayTitle}
                     className="poster w-28 sm:w-36 md:w-44 h-40 sm:h-56 md:h-64 object-cover rounded-xl" />
                <p className="mt-2 truncate w-28 sm:w-36 md:w-44 text-sm">{g.displayTitle}</p>
              </button>
            ))}
          </div>
        </section>

        {selectedShow && (
          <section className="mt-8">
            <div className="glass rounded-2xl p-4 md:p-6 shadow-2xl mb-6">
              <div className="flex items-center gap-4">
                <img src={selectedShow.poster} alt={selectedShow.displayTitle}
                     className="w-14 h-20 object-cover rounded-lg" />
                <div className="flex-1">
                  <h3 className="text-2xl font-semibold drop-shadow">{selectedShow.displayTitle}</h3>
                  <p className="text-white/70 text-sm">
                    {selectedShow.kind === "Movie" ? "Choose a file to play" : "Select an episode to play"}
                  </p>
                </div>
                <button className="chip" onClick={() => { setSelectedShow(null); setSelectedEpisode(null); }}>
                  ← Back to Library
                </button>
              </div>
            </div>

            <div className="glass rounded-2xl p-4 md:p-6 shadow-2xl">
              {selectedShow.seasons.map((s) => (
                <div key={s.seasonName} className="mb-6">
                  <div className="flex items-center gap-3 mb-3">
                    <img src={s.poster} alt={s.seasonName} className="w-12 h-12 object-cover rounded-md" />
                    <h4 className="text-lg font-medium drop-shadow">{s.seasonName}</h4>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-3">
                    {s.files.map((ep) => (
                      <button key={ep.path}
                              className="chip text-xs sm:text-sm"
                              onClick={() => { setSelectedEpisode(ep); setFsPending(true); }}>
                        {ep.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {selectedEpisode && (
          <section className="mt-8">
            <div className="glass rounded-2xl p-3 md:p-4 shadow-2xl">
              <div className="flex items-center justify-between mb-2 px-1">
                <h5 className="font-semibold drop-shadow">Now Playing: <span className="opacity-90">{selectedEpisode.name}</span></h5>
                <button className="chip" onClick={() => setSelectedEpisode(null)}>✕ Close</button>
              </div>
              <video ref={videoRef} key={selectedEpisode.path} controls className="w-full max-h-[78vh] rounded-xl" />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
