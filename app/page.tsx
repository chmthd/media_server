"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";

/* ----------------------------- Types ----------------------------- */

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

/* ------------------------ Constants & Utils ----------------------- */

const POSTER_FALLBACK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="640">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0a0f1f"/><stop offset="1" stop-color="#0b1220"/>
      </linearGradient></defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <g fill="#b3c0d1" font-family="Arial,Helvetica,sans-serif" font-size="28" text-anchor="middle">
        <text x="50%" y="50%">No Poster</text>
      </g>
    </svg>`
  );

const fmtTime = (t: number) => {
  if (!isFinite(t)) return "0:00";
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
};

/* ---------------------------- Poster Row ---------------------------- */

function PosterRow({
  title,
  items,
  onSelectGroup,
}: {
  title: string;
  items: GroupedMedia[];
  onSelectGroup: (group: GroupedMedia) => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
        e.preventDefault();
        el.scrollBy({ left: e.deltaY, behavior: "smooth" });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold px-6 mb-3">{title}</h2>
      <div className="edge-mask anim-up">
        <div
          ref={rowRef}
          className="flex gap-5 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory px-6 py-1"
          style={{ scrollPaddingLeft: 24, scrollPaddingRight: 24 }}
        >
          {items.map((g, idx) => (
            <button
              key={`${g.kind}-${g.key}`}
              className="poster-card flex-shrink-0 text-center snap-start"
              onClick={() => onSelectGroup(g)}
              title={g.displayTitle}
              style={{ ["--i" as any]: idx }}
            >
              <img
                src={g.poster}
                alt={g.displayTitle}
                className="poster w-28 sm:w-36 md:w-44 h-40 sm:h-56 md:h-64 object-cover rounded-xl"
                loading="lazy"
                onError={(e) => ((e.currentTarget as HTMLImageElement).src = POSTER_FALLBACK)}
              />
              <p className="mt-2 truncate w-28 sm:w-36 md:w-44 text-sm">{g.displayTitle}</p>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Main Page ---------------------------- */

export default function PS3StyleUI() {
  const [media, setMedia] = useState<GroupedMedia[]>([]);
  const [activeTab, setActiveTab] = useState<"TV" | "Movies">("TV");

  // selection (TV shows)
  const [selected, setSelected] = useState<GroupedMedia | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);

  // player
  const [nowPlaying, setNowPlaying] = useState<MediaFile | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const playerShellRef = useRef<HTMLDivElement | null>(null);

  // custom controls state
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [sliderVal, setSliderVal] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  /* ---------- manifest only probe ---------- */
  const probeHls = useCallback(
    async (filePath: string): Promise<{ ok: boolean; m3u8?: string }> => {
      try {
        const m3u8 = `/api/hls/manifest?file=${encodeURIComponent(filePath)}`;
        const res = await fetch(m3u8, { cache: "no-store" });
        if (!res.ok) return { ok: false };
        const txt = await res.text();
        const hasSegment = /^[^#\r\n]+\.ts$/m.test(txt);
        return { ok: hasSegment, m3u8 };
      } catch {
        return { ok: false };
      }
    },
    []
  );

  /* ------------------ player setup and fallback ------------------ */
  useEffect(() => {
    const el = videoRef.current;
    const file = nowPlaying;
    if (!el || !file) return;

    let cancelled = false;

    async function start(fileArg: MediaFile, elArg: HTMLVideoElement) {
      hlsRef.current?.destroy();
      hlsRef.current = null;

      setIsPlaying(false);
      setCurrent(0);
      setDuration(0);
      setSliderVal(null);

      const streamUrl = `/api/stream?file=${encodeURIComponent(fileArg.path)}`;
      const probe = await probeHls(fileArg.path);

      if (!probe.ok || !probe.m3u8) {
        if (cancelled) return;
        elArg.src = streamUrl;
        elArg.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        return;
      }

      const m3u8 = probe.m3u8;

      if (Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: 30,
          lowLatencyMode: false,
          fragLoadingRetryDelay: 500,
          manifestLoadingRetryDelay: 500,
        });
        hlsRef.current = hls;
        hls.attachMedia(elArg);
        hls.loadSource(m3u8);

        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (cancelled) return;
          const fatal = data.fatal || data.type === Hls.ErrorTypes.NETWORK_ERROR;
          const fragIssue =
            data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR ||
            data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT;
          if (fatal || fragIssue) {
            hls.destroy();
            hlsRef.current = null;
            elArg.src = streamUrl;
            elArg.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
          }
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (cancelled) return;
          elArg.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        });
      } else if (elArg.canPlayType("application/vnd.apple.mpegurl")) {
        const onError = () => {
          if (cancelled) return;
          elArg.removeEventListener("error", onError);
          elArg.src = streamUrl;
          elArg.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        };
        elArg.addEventListener("error", onError, { once: true });
        elArg.src = m3u8;
        elArg.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      } else {
        elArg.src = streamUrl;
        elArg.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      }
    }

    // call with narrowed values
    start(file, el);

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [nowPlaying, probeHls]);

  // media event listeners (safe – we guard null)
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => {
      if (sliderVal === null) setCurrent(el.currentTime || 0);
    };
    const onDur = () => setDuration(el.duration || 0);
    const onEnded = () => setIsPlaying(false);

    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("durationchange", onDur);
    el.addEventListener("ended", onEnded);

    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("durationchange", onDur);
      el.removeEventListener("ended", onEnded);
    };
  }, [sliderVal, nowPlaying]);

  // fullscreen
  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean((document as any).fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const shell = playerShellRef.current;
    const doc = document as any;
    if (!shell) return;
    if (!doc.fullscreenElement) shell.requestFullscreen?.();
    else doc.exitFullscreen?.();
  }, []);

  // keyboard
  useEffect(() => {
    if (!nowPlaying) return;
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      if (e.key === " ") {
        e.preventDefault();
        v.paused ? v.play() : v.pause();
      } else if (e.key.toLowerCase() === "f") {
        toggleFullscreen();
      } else if (e.key === "ArrowLeft") {
        v.currentTime = Math.max(0, v.currentTime - 10);
      } else if (e.key === "ArrowRight") {
        v.currentTime = Math.min(v.duration || v.currentTime + 10, v.currentTime + 10);
      } else if (e.key === "Escape") {
        setNowPlaying(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nowPlaying, toggleFullscreen]);

  /* -------------------------- data build -------------------------- */
  const buildGroups = useCallback(async (files: MediaFile[]): Promise<GroupedMedia[]> => {
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
          `/api/poster?type=${kind === "Movie" ? "movie" : "tv"}&query=${encodeURIComponent(
            title
          )}${first.year ? `&year=${first.year}` : ""}`
        );
        const posterData = posterRes.ok ? await posterRes.json() : { poster: null as string | null };
        const groupPoster = posterData.poster || POSTER_FALLBACK;

        if (kind === "Movie") {
          return {
            key,
            displayTitle: title,
            poster: groupPoster,
            kind,
            seasons: [{ seasonName: "Movie", poster: groupPoster, files: list }],
          };
        } else {
          const sMap = list.reduce((mm: Record<string, MediaFile[]>, f) => {
            const s = f.season || "Season 1";
            (mm[s] ||= []).push(f);
            return mm;
          }, {});
          const seasons = await Promise.all(
            Object.keys(sMap).map(async (sName) => {
              const sRes = await fetch(
                `/api/poster?type=tv&query=${encodeURIComponent(title)}&season=${encodeURIComponent(
                  sName
                )}${first.year ? `&year=${first.year}` : ""}`
              );
              const sData = sRes.ok ? await sRes.json() : { poster: null as string | null };
              return { seasonName: sName, poster: sData.poster || POSTER_FALLBACK, files: sMap[sName] };
            })
          );
          return { key, displayTitle: title, poster: groupPoster, kind, seasons };
        }
      })
    );

    return groups;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const cached = localStorage.getItem("mediaCache");
      const cachedAt = localStorage.getItem("mediaCacheTime");
      const maxAge = 10 * 60 * 1000;

      if (cached && cachedAt && Date.now() - parseInt(cachedAt) < maxAge) {
        try {
          const parsed = JSON.parse(cached) as GroupedMedia[];
          if (!cancelled) setMedia(parsed);
          return;
        } catch {
        }
      }

      const res = await fetch("/api/media");
      if (!res.ok) return;
      const files: MediaFile[] = await res.json();
      if (!Array.isArray(files)) return;

      const groups = await buildGroups(files);
      if (cancelled) return;

      localStorage.setItem("mediaCache", JSON.stringify(groups));
      localStorage.setItem("mediaCacheTime", Date.now().toString());
      setMedia(groups);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [buildGroups]);

  /* ----------------------- filter rows for tab ---------------------- */
  const visibleGroups = media.filter((g) =>
    activeTab === "Movies" ? g.kind === "Movie" : g.kind === "TV Show"
  );
  const chunkSize = Math.ceil(Math.max(1, visibleGroups.length) / 3);
  const rows = [
    { title: "Popular", items: visibleGroups.slice(0, chunkSize) },
    { title: "Recently Added", items: visibleGroups.slice(chunkSize, chunkSize * 2) },
    { title: "Classics", items: visibleGroups.slice(chunkSize * 2) },
  ];

  /* ---------------------- poster click behaviour ---------------------- */
  const handleSelect = useCallback((g: GroupedMedia) => {
    if (g.kind === "Movie") {
      const movie = g.seasons[0]?.files[0];
      if (movie) setNowPlaying(movie);
      return;
    }
    setSelected(g);
    setSelectedSeason(g.seasons[0]?.seasonName ?? null);
  }, []);

  /* ------------------------------- UI -------------------------------- */

  return (
    <div className="fa-bg min-h-screen text-white">
      <nav className="navbar glass">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/20 shadow-inner" />
          <span className="font-semibold text-lg drop-shadow">Local Media Server</span>
        </div>
        <div className="flex items-center gap-2 ml-6">
          <button
            className={`chip ${activeTab === "TV" ? "chip-active" : ""}`}
            onClick={() => setActiveTab("TV")}
          >
            TV Shows
          </button>
          <button
            className={`chip ${activeTab === "Movies" ? "chip-active" : ""}`}
            onClick={() => setActiveTab("Movies")}
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

      <main className="pt-24 pb-10">
        {rows.map((row) => (
          <PosterRow key={row.title} title={row.title} items={row.items} onSelectGroup={handleSelect} />
        ))}
      </main>

      {/* --------------------------- DETAILS MODAL (TV) --------------------------- */}
      {selected && (
        <section
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => {
            setSelected(null);
            setSelectedSeason(null);
          }}
        >
          <div
            className="glass w-full max-w-5xl max-h-[85vh] overflow-auto rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-1 md:grid-cols-[260px,1fr] gap-0">
              <div className="relative">
                <img
                  src={selected.poster}
                  alt={selected.displayTitle}
                  className="w-full h-64 md:h-full object-cover"
                  onError={(e) => ((e.currentTarget as HTMLImageElement).src = POSTER_FALLBACK)}
                />
              </div>
              <div className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl md:text-2xl font-semibold">{selected.displayTitle}</h3>
                  <button className="chip" onClick={() => setSelected(null)}>
                    ✕ Close
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-[220px,1fr] gap-4">
                  {/* Seasons list */}
                  <div className="md:border-r md:border-white/10 pr-0 md:pr-4">
                    <h4 className="mb-2 font-semibold">Seasons</h4>
                    <div className="flex md:block gap-2 md:gap-0 overflow-x-auto no-scrollbar">
                      {selected.seasons.map((s) => (
                        <button
                          key={s.seasonName}
                          className={`chip mr-2 mb-2 ${
                            (selectedSeason ?? selected.seasons[0]?.seasonName) === s.seasonName
                              ? "chip-active"
                              : ""
                          }`}
                          onClick={() => setSelectedSeason(s.seasonName)}
                        >
                          {s.seasonName}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Episodes */}
                  <div>
                    <h4 className="mb-2 font-semibold">Episodes</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {(selected.seasons.find(
                        (s) => s.seasonName === (selectedSeason ?? selected.seasons[0]?.seasonName)
                      )?.files || []
                      ).map((ep) => (
                        <button
                          key={ep.path}
                          className="group rounded-lg overflow-hidden bg-white/5 border border-white/10 hover:border-white/30 transition"
                          onClick={() => {
                            setNowPlaying(ep);
                            setSelected(null);
                            setSelectedSeason(null);
                          }}
                        >
                          <div className="aspect-video w-full bg-black/30 flex items-center justify-center">
                            <span className="opacity-80 text-sm px-2 text-center truncate">
                              {ep.name}
                            </span>
                          </div>
                          <div className="p-2 text-left">
                            <span className="block truncate text-xs opacity-80">
                              {ep.season ? `${ep.season}` : ""}
                            </span>
                            <span className="block truncate text-sm">{ep.name}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ----------------------------- VIDEO PLAYER ----------------------------- */}
      {nowPlaying && (
        <section className="fixed inset-0 z-[100] bg-black">
          <div ref={playerShellRef} className="absolute inset-0 flex flex-col">
            {/* Top bar */}
            <div className="flex items-center justify-between p-3 md:p-4 bg-gradient-to-b from-black/70 to-transparent">
              <div className="min-w-0">
                <h5 className="font-semibold drop-shadow truncate">
                  {nowPlaying.show ? `${nowPlaying.show} — ${nowPlaying.name}` : nowPlaying.name}
                </h5>
              </div>
              <div className="flex gap-2">
                <button className="chip" onClick={toggleFullscreen}>
                  {isFullscreen ? "⤢ Exit Fullscreen" : "⛶ Fullscreen"}
                </button>
                <button
                  className="chip"
                  onClick={() => {
                    setNowPlaying(null);
                    hlsRef.current?.destroy();
                    hlsRef.current = null;
                  }}
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {/* video area */}
            <div className="relative flex-1">
              <video
                ref={videoRef}
                key={nowPlaying.path}
                playsInline
                controls={false}
                className="absolute inset-0 w-full h-full object-contain bg-black"
              />

              {/* center transport controls */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center gap-6">
                <button
                  className="pointer-events-auto w-16 h-16 md:w-20 md:h-20 rounded-full bg-black/40 border border-white/30 flex items-center justify-center text-2xl backdrop-blur"
                  onClick={() => {
                    const v = videoRef.current;
                    if (!v) return;
                    v.currentTime = Math.max(0, v.currentTime - 10);
                  }}
                  title="Back 10s"
                >
                  ⟲10
                </button>

                <button
                  className="pointer-events-auto w-16 h-16 md:w-20 md:h-20 rounded-full bg-black/50 border border-white/40 flex items-center justify-center text-3xl font-semibold backdrop-blur"
                  onClick={() => {
                    const v = videoRef.current;
                    if (!v) return;
                    v.paused ? v.play() : v.pause();
                  }}
                  title="Play/Pause"
                >
                  {isPlaying ? "⏸" : "▶"}
                </button>

                <button
                  className="pointer-events-auto w-16 h-16 md:w-20 md:h-20 rounded-full bg-black/40 border border-white/30 flex items-center justify-center text-2xl backdrop-blur"
                  onClick={() => {
                    const v = videoRef.current;
                    if (!v) return;
                    v.currentTime = Math.min(v.duration || v.currentTime + 10, v.currentTime + 10);
                  }}
                  title="Forward 10s"
                >
                  10⟳
                </button>
              </div>

              {/* bottom control bar */}
              <div className="absolute left-0 right-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center gap-3 text-sm">
                  <span className="w-16 text-right tabular-nums">{fmtTime(sliderVal ?? current)}</span>
                  <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    step={0.1}
                    value={sliderVal ?? current}
                    onChange={(e) => setSliderVal(Number(e.target.value))}
                    onMouseDown={() => setSliderVal(current)}
                    onMouseUp={(e) => {
                      const v = videoRef.current;
                      const val = Number((e.target as HTMLInputElement).value);
                      if (v) v.currentTime = val;
                      setSliderVal(null);
                    }}
                    onTouchStart={() => setSliderVal(current)}
                    onTouchEnd={(e) => {
                      const v = videoRef.current;
                      const val = Number((e.target as HTMLInputElement).value);
                      if (v) v.currentTime = val;
                      setSliderVal(null);
                    }}
                    className="flex-1 accent-white"
                  />
                  <span className="w-16 tabular-nums">{fmtTime(duration)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
