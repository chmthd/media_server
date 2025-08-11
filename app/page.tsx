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
};

type GroupedMedia = {
  rootFolder: string;
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
      if (req) {
        try { req.call(el); } catch {}
      }
      setFsPending(false);
    }
  }, [selectedEpisode, fsPending]);

  // Attach HLS when an episode/file is selected
  useEffect(() => {
    if (!selectedEpisode || !videoRef.current) return;

    const video = videoRef.current;
    const manifestUrl = `/api/hls/manifest?file=${encodeURIComponent(selectedEpisode.path)}`;

    // Native HLS (Safari/iOS)
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = manifestUrl;
    } else if (Hls.isSupported()) {
      // MSE HLS (Chrome/Firefox/Edge)
      const hls = new Hls({ maxBufferLength: 30, lowLatencyMode: false });
      hls.loadSource(manifestUrl);
      hls.attachMedia(video);
      hlsRef.current = hls;
    } else {
      // Fallback to progressive (won't play HEVC)
      video.src = `/api/stream?file=${encodeURIComponent(selectedEpisode.path)}`;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [selectedEpisode]);

  // Load and group media
  useEffect(() => {
    async function loadMedia() {
      try {
        const res = await fetch("/api/media");
        if (!res.ok) { console.error("API error:", res.status); return; }
        const data: MediaFile[] = await res.json();
        if (!Array.isArray(data)) { console.error("Unexpected format:", data); return; }

        const grouped = data.reduce((acc: Record<string, MediaFile[]>, file: MediaFile) => {
          const key = file.rootFolder;
          if (!acc[key]) acc[key] = [];
          acc[key].push(file);
          return acc;
        }, {});

        const withPosters: GroupedMedia[] = await Promise.all(
          Object.keys(grouped).map(async (group) => {
            const groupFiles = grouped[group];
            const firstItem = groupFiles[0];
            const cleanName = firstItem.rootFolder
              .replace(/\.[^/.]+$/, "")
              .replace(/[._-]/g, " ");

            try {
              const posterRes = await fetch(`/api/poster?query=${encodeURIComponent(cleanName)}`);
              const posterData = posterRes.ok ? await posterRes.json() : { poster: null };

              const seasonsMap = groupFiles.reduce(
                (seasonAcc: Record<string, MediaFile[]>, file: MediaFile) => {
                  const seasonName = file.season || "Unknown Season";
                  if (!seasonAcc[seasonName]) seasonAcc[seasonName] = [];
                  seasonAcc[seasonName].push(file);
                  return seasonAcc;
                },
                {}
              );

              const seasons = await Promise.all(
                Object.keys(seasonsMap).map(async (seasonName) => {
                  const seasonPosterRes = await fetch(
                    `/api/poster?query=${encodeURIComponent(seasonName)}`
                  );
                  const seasonPosterData = seasonPosterRes.ok
                    ? await seasonPosterRes.json()
                    : { poster: null };
                  return {
                    seasonName,
                    poster: seasonPosterData.poster || "/placeholder.jpg",
                    files: seasonsMap[seasonName],
                  };
                })
              );

              return {
                rootFolder: firstItem.rootFolder,
                poster: posterData.poster || "/placeholder.jpg",
                kind: firstItem.type, 
                seasons,
              };
            } catch {
              return {
                rootFolder: firstItem.rootFolder,
                poster: "/placeholder.jpg",
                kind: firstItem.type,
                seasons: [],
              };
            }
          })
        );

        setMedia(withPosters);
      } catch (err) {
        console.error("Failed to load media:", err);
      }
    }

    loadMedia();
  }, []);

  const visibleGroups = media.filter((g) =>
    activeTab === "Movies" ? g.kind === "Movie" : g.kind === "TV Show"
  );

  return (
    <div className="fa-bg min-h-screen text-white">
      {/* NAVBAR with tabs */}
      <nav className="navbar glass">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/20 shadow-inner" />
          <span className="font-semibold text-lg drop-shadow">Media Server</span>
        </div>

        <div className="flex items-center gap-2 ml-6">
          <button
            className={`chip ${activeTab === "TV" ? "chip-active" : ""}`}
            onClick={() => { setActiveTab("TV"); setSelectedShow(null); setSelectedEpisode(null); }}
          >
            TV Shows
          </button>
          <button
            className={`chip ${activeTab === "Movies" ? "chip-active" : ""}`}
            onClick={() => { setActiveTab("Movies"); setSelectedShow(null); setSelectedEpisode(null); }}
          >
            Movies
          </button>
        </div>

        <div className="flex-1" />
        <div className="hidden sm:flex items-center gap-2">
          <input
            placeholder="Search"
            className="search text-sm outline-none text-white placeholder-white/70 bg-transparent border border-white/20 rounded-full px-3 py-1"
          />
        </div>
      </nav>

      {/* MAIN */}
      <main className="pt-24 px-5 md:px-8 pb-10">
        {/* ROW */}
        <section className="glass rounded-2xl p-4 md:p-6 shadow-2xl">
          <div className="flex gap-5 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory">
            {visibleGroups.map((item) => (
              <button
                key={`${item.kind}-${item.rootFolder}`}
                className="poster-card flex-shrink-0 text-center cursor-pointer transition-transform snap-start"
                onClick={() => { setSelectedShow(item); setSelectedEpisode(null); }}
                title={item.rootFolder}
              >
                <img
                  src={item.poster}
                  alt={item.rootFolder}
                  className="poster w-28 sm:w-36 md:w-44 h-40 sm:h-56 md:h-64 object-cover rounded-xl"
                />
                <p className="mt-2 truncate w-28 sm:w-36 md:w-44 text-sm">{item.rootFolder}</p>
              </button>
            ))}
          </div>
        </section>

        {/* DETAILS / EPISODES */}
        {selectedShow && (
          <section className="mt-8">
            {/* compact header */}
            <div className="glass rounded-2xl p-4 md:p-6 shadow-2xl mb-6">
              <div className="flex items-center gap-4">
                <img
                  src={selectedShow.poster}
                  alt={selectedShow.rootFolder}
                  className="w-14 h-20 object-cover rounded-lg"
                />
                <div className="flex-1">
                  <h3 className="text-2xl font-semibold drop-shadow">
                    {selectedShow.rootFolder}
                  </h3>
                  <p className="text-white/70 text-sm">
                    {selectedShow.kind === "Movie"
                      ? "Choose a file to play"
                      : "Select an episode to play"}
                  </p>
                </div>
                <button
                  className="chip"
                  onClick={() => { setSelectedShow(null); setSelectedEpisode(null); }}
                >
                  ← Back to Library
                </button>
              </div>
            </div>

            {/* episodes / files grid */}
            <div className="glass rounded-2xl p-4 md:p-6 shadow-2xl">
              {selectedShow.seasons.map((season) => (
                <div key={season.seasonName} className="mb-6">
                  <div className="flex items-center gap-3 mb-3">
                    <img
                      src={season.poster}
                      alt={season.seasonName}
                      className="w-12 h-12 object-cover rounded-md"
                    />
                    <h4 className="text-lg font-medium drop-shadow">{season.seasonName}</h4>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-3">
                    {season.files.map((episode) => {
                      const active = selectedEpisode?.path === episode.path;
                      return (
                        <button
                          key={episode.path}
                          className={`chip text-xs sm:text-sm ${active ? "chip-active" : ""}`}
                          onClick={() => { setSelectedEpisode(episode); setFsPending(true); }}
                          title={episode.name}
                        >
                          {episode.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* PLAYER */}
        {selectedEpisode && (
          <section className="mt-8">
            <div className="glass rounded-2xl p-3 md:p-4 shadow-2xl">
              <div className="flex items-center justify-between mb-2 px-1">
                <h5 className="font-semibold drop-shadow">
                  Now Playing: <span className="opacity-90">{selectedEpisode.name}</span>
                </h5>
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
