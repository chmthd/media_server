"use client";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
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

// tiny normalizer for matching (handles plural/singular crudely)
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/['".,!?()\-_:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const singularize = (s: string) => s.replace(/s\b/g, "");

/* --------------------------- Icons (SVG) --------------------------- */

const iconCls = "w-4 h-4 md:w-5 md:h-5";
function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconCls} {...props}>
      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" />
    </svg>
  );
}
function ShuffleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconCls} {...props}>
      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M16 3h5v5M3 8h6l7 8h5M21 16v5h-5M3 16h6l2.5-2.9" />
    </svg>
  );
}
function MoonIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconCls} {...props}>
      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
function CogIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconCls} {...props}>
      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M10.3 3.2 9.7 5.1a7.6 7.6 0 0 0-1.8 1l-1.9-.6-1.8 3.1 1.6 1.3a7.8 7.8 0 0 0 0 2.1L2.3 14l1.8 3.1 1.9-.6c.6.4 1.2.7 1.8 1l.6 1.9h3.6l.6-1.9c.6-.3 1.2-.6 1.8-1l1.9.6 1.8-3.1-1.6-1.3c.1-.7.1-1.4 0-2.1l1.6-1.3-1.8-3.1-1.9.6c-.6-.4-1.2-.7-1.8-1l-.6-1.9h-3.6z" />
      <circle cx="12" cy="12" r="3" strokeWidth="2" />
    </svg>
  );
}
function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconCls} {...props}>
      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6l-12 12" />
    </svg>
  );
}

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

  // search state
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false); 
  const [activeIdx, setActiveIdx] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

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

    start(file, el);

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [nowPlaying, probeHls]);

  // media event listeners
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

  // keyboard (player + search overlay)
  useEffect(() => {
    if (!nowPlaying && !searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      // player controls
      if (nowPlaying) {
        const v = videoRef.current;
        const showUI = () => showControlsTemporarily();

        // helpers
        const step = (delta: number) => {
          if (!v) return;
          v.currentTime = Math.max(0, Math.min((v.duration || v.currentTime + delta), v.currentTime + delta));
        };
        const vol = (delta: number) => {
          if (!v) return;
          v.volume = Math.max(0, Math.min(1, v.volume + delta));
        };

        if (e.key === " " || e.key.toLowerCase() === "k") {
          e.preventDefault();
          if (v) v.paused ? v.play() : v.pause();
          showUI();
          return;
        }
        if (e.key.toLowerCase() === "f") {
          toggleFullscreen();
          showUI();
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          step(-10);
          showUI();
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          step(10);
          showUI();
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          vol(0.05);
          showUI();
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          vol(-0.05);
          showUI();
          return;
        }
        if (e.key.toLowerCase() === "m") {
          if (v) v.muted = !v.muted;
          showUI();
          return;
        }
        if (e.key === "Escape") {
          setNowPlaying(null);
          return;
        }
      }

      // search overlay nav
      if (searchOpen) {
        if (e.key === "Escape") {
          setSearchOpen(false);
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActiveIdx((i) => i + 1);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setActiveIdx((i) => Math.max(0, i - 1));
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nowPlaying, searchOpen, toggleFullscreen]);

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
          /* ignore cache parse error */
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

  /* -------------------------- SEARCH INDEX -------------------------- */

  // one entry per group (movie or show)
  type SearchItem = {
    key: string;
    title: string;
    titleNorm: string;
    titleNormSingular: string;
    kind: "Movie" | "TV Show";
    poster: string;
    year?: number;
    group: GroupedMedia;
  };

  const searchIndex: SearchItem[] = useMemo(() => {
    return media.map((g) => {
      const year = g.seasons?.[0]?.files?.[0]?.year;
      const title = g.displayTitle;
      const n = norm(title);
      return {
        key: g.key,
        title,
        titleNorm: n,
        titleNormSingular: singularize(n),
        kind: g.kind,
        poster: g.poster || POSTER_FALLBACK,
        year,
        group: g,
      };
    });
  }, [media]);

  // debounced query
  const [qLive, setQLive] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQLive(q), 120);
    return () => clearTimeout(id);
  }, [q]);

  const results = useMemo(() => {
    const nq = norm(qLive);
    if (!nq) return [];
    const nqS = singularize(nq);
    const scored = searchIndex
      .map((it) => {
        const t = it.titleNorm;
        const tS = it.titleNormSingular;
        let score = 0;
        if (t === nq || tS === nqS) score = 100; // exact
        else if (t.startsWith(nq) || tS.startsWith(nqS)) score = 80; // prefix
        else if (t.includes(nq) || tS.includes(nqS)) score = 60; // substring
        const yearMatch = qLive.match(/(^|\D)(19|20)\d{2}(\D|$)/);
        if (yearMatch && it.year && yearMatch[0].includes(String(it.year))) score += 5;
        return { it, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.it.title.localeCompare(b.it.title))
      // no slice: show ALL matches (overlay list scrolls independently)
      .map((x) => x.it);
    return scored;
  }, [qLive, searchIndex]);

  // clamp active index
  useEffect(() => {
    if (!results.length) setActiveIdx(0);
    else setActiveIdx((i) => Math.min(i, results.length - 1));
  }, [results.length]);

  const openFromResult = useCallback(
    (item: SearchItem) => {
      setSearchOpen(false);
      setQ("");
      setQLive("");
      if (item.kind === "Movie") {
        const movie = item.group.seasons[0]?.files[0];
        if (movie) setNowPlaying(movie);
      } else {
        setSelected(item.group);
        setSelectedSeason(item.group.seasons[0]?.seasonName ?? null);
      }
    },
    []
  );

  // focus/lock scroll when overlay opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden"; // prevent page scroll while overlay is open
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [searchOpen]);

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

  /* ---------------------- Player UI auto-hide ---------------------- */

  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

  const clearHideTimer = () => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    // only auto-hide while playing
    if (!isPlaying) {
      setControlsVisible(true);
      return;
    }
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, 2500);
  }, [isPlaying]);

  const showControlsTemporarily = useCallback(() => {
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  // When play/pause changes, (re)schedule hiding
  useEffect(() => {
    if (!nowPlaying) return;
    if (isPlaying) scheduleHide();
    else {
      clearHideTimer();
      setControlsVisible(true);
    }
    return clearHideTimer;
  }, [isPlaying, nowPlaying, scheduleHide]);

  // Mouse movement over player shows controls
  useEffect(() => {
    if (!nowPlaying) return;
    const el = playerShellRef.current;
    if (!el) return;
    const onMove = () => showControlsTemporarily();
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseenter", onMove);
    el.addEventListener("mouseleave", onMove);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseenter", onMove);
      el.removeEventListener("mouseleave", onMove);
    };
  }, [nowPlaying, showControlsTemporarily]);

  /* ------------------------------- UI -------------------------------- */

  // groups for rows per tab
  const visibleGroups = media.filter((g) =>
    activeTab === "Movies" ? g.kind === "Movie" : g.kind === "TV Show"
  );
  const chunkSize = Math.ceil(Math.max(1, visibleGroups.length) / 3);
  const rows = [
    { title: "Popular", items: visibleGroups.slice(0, chunkSize) },
    { title: "Recently Added", items: visibleGroups.slice(chunkSize, chunkSize * 2) },
    { title: "Classics", items: visibleGroups.slice(chunkSize * 2) },
  ];

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

        {/* Right-side actions — consistent chips with SVG icons */}
        <div className="hidden md:flex items-center gap-2 mr-2">
          <button
            className="chip flex items-center gap-2"
            title="Shuffle a Movie"
            onClick={() => {
              const m = media.filter((g) => g.kind === "Movie");
              if (!m.length) return;
              const rand = m[Math.floor(Math.random() * m.length)];
              const file = rand.seasons[0]?.files[0];
              if (file) setNowPlaying(file);
            }}
          >
            <ShuffleIcon />
            <span className="hidden sm:inline">Random</span>
          </button>

          <button className="chip flex items-center gap-2" title="Theme (placeholder)">
            <MoonIcon />
            <span className="hidden sm:inline">Theme</span>
          </button>

          <button className="chip flex items-center gap-2" title="Settings (placeholder)">
            <CogIcon />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>

        {/* Icon-only Search trigger */}
        <button className="chip p-2" aria-label="Search" title="Search" onClick={() => setSearchOpen(true)}>
          <SearchIcon />
        </button>
      </nav>

      <main className="pt-24 pb-10">
        {rows.map((row) => (
          <PosterRow key={row.title} title={row.title} items={row.items} onSelectGroup={handleSelect} />
        ))}
      </main>

      {/* ---------------------- SEARCH OVERLAY (Prime-like) ---------------------- */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm overscroll-none"
          onClick={() => setSearchOpen(false)}
        >
          <div className="mx-auto mt-16 max-w-5xl px-4" onClick={(e) => e.stopPropagation()}>
            {/* Input bar */}
            <div className="glass rounded-2xl p-3 md:p-4">
              <div className="flex items-center gap-3">
                <SearchIcon />
                <input
                  ref={searchInputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && results[activeIdx]) {
                      openFromResult(results[activeIdx]);
                    }
                    if (e.key === "Escape") setSearchOpen(false);
                  }}
                  placeholder="Search"
                  className="w-full bg-transparent outline-none text-white text-lg md:text-xl placeholder-white/70"
                />
                <button className="chip p-2" onClick={() => { setSearchOpen(false); setQ(""); }}>
                  <XIcon />
                </button>
              </div>
            </div>

            {/* Results (independent scroll, doesn’t affect page) */}
            {qLive && results.length > 0 && (
              <div className="mt-3 glass rounded-2xl max-h-[60vh] overflow-y-auto overscroll-contain">
                {results.map((r, i) => (
                  <button
                    key={r.key}
                    className={`w-full flex gap-4 items-center px-4 py-3 text-left hover:bg-white/5 ${
                      i === activeIdx ? "bg-white/10" : ""
                    }`}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => openFromResult(r)}
                  >
                    <img
                      src={r.poster || POSTER_FALLBACK}
                      onError={(e) => ((e.currentTarget as HTMLImageElement).src = POSTER_FALLBACK)}
                      className="w-[46px] h-[68px] object-cover rounded"
                      alt=""
                    />
                    <div className="min-w-0">
                      <div className="truncate text-base md:text-lg">{r.title}</div>
                      <div className="text-xs opacity-70">
                        {r.kind} {r.year ? `• ${r.year}` : ""}
                      </div>
                    </div>
                  </button>
                ))}
                <div className="px-4 py-2 text-xs opacity-60 border-t border-white/10 sticky bottom-0 bg-black/20 backdrop-blur">
                  {results.length} result{results.length === 1 ? "" : "s"}
                </div>
              </div>
            )}

            {qLive && results.length === 0 && (
              <div className="mt-3 glass rounded-2xl p-4 text-sm opacity-80">No results for “{qLive}”.</div>
            )}
          </div>
        </div>
      )}

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
                            <span className="opacity-80 text-sm px-2 text-center truncate">{ep.name}</span>
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
          <div
            ref={playerShellRef}
            className={`absolute inset-0 flex flex-col ${controlsVisible ? "" : "cursor-none"}`}
          >
            {/* Top bar (auto-hide) */}
            <div
              className={`transition-opacity duration-300 ${
                controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
              } flex items-center justify-between p-3 md:p-4 bg-gradient-to-b from-black/70 to-transparent`}
            >
              <div className="min-w-0">
                <h5 className="font-semibold drop-shadow truncate">
                  {/* Clean title: just name + year */}
                  {(() => {
                    const t = nowPlaying.cleanTitle || nowPlaying.name || "Untitled";
                    const y = nowPlaying.year ? ` (${nowPlaying.year})` : "";
                    return `${t}${y}`;
                  })()}
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
                onClick={() => {
                  const v = videoRef.current;
                  if (!v) return;
                  v.paused ? v.play() : v.pause();
                  showControlsTemporarily();
                }}
              />

              {/* center transport controls (auto-hide) */}
              <div
                className={`absolute inset-0 transition-opacity duration-300 ${
                  controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                } pointer-events-none flex items-center justify-center gap-6`}
              >
                <button
                  className="pointer-events-auto w-16 h-16 md:w-20 md:h-20 rounded-full bg-black/40 border border-white/30 flex items-center justify-center text-2xl backdrop-blur"
                  onClick={() => {
                    const v = videoRef.current;
                    if (!v) return;
                    v.currentTime = Math.max(0, v.currentTime - 10);
                    showControlsTemporarily();
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
                    showControlsTemporarily();
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
                    showControlsTemporarily();
                  }}
                  title="Forward 10s"
                >
                  10⟳
                </button>
              </div>

              {/* bottom control bar (auto-hide) */}
              <div
                className={`absolute left-0 right-0 bottom-0 transition-opacity duration-300 ${
                  controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                } p-4 bg-gradient-to-t from-black/80 to-transparent`}
              >
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
                      showControlsTemporarily();
                    }}
                    onTouchStart={() => setSliderVal(current)}
                    onTouchEnd={(e) => {
                      const v = videoRef.current;
                      const val = Number((e.target as HTMLInputElement).value);
                      if (v) v.currentTime = val;
                      setSliderVal(null);
                      showControlsTemporarily();
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
