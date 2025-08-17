"use client";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Hls from "hls.js";

/* NEW: Framer Motion */
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";

/* ----------------------------- Types ----------------------------- */

type MediaFile = {
  name: string;
  path: string;
  poster?: string;
  show: string;
  type: "Movie" | "TV Show";
  rootFolder: string;
  season?: string; // e.g. "S01" or "Season 1"
  cleanTitle: string;
  year?: number;
};

type GroupedMedia = {
  key: string;
  displayTitle: string;
  poster: string;
  kind: "Movie" | "TV Show";
  seasons: {
    seasonName: string; // e.g. "S01"
    poster: string;
    files: MediaFile[];
  }[];
};

type TmdbEpisode = {
  episode_number: number;
  name: string;
  overview?: string;
  still_path?: string | null;
};

type EpisodesResponse = {
  episodes: Record<number, TmdbEpisode>;
  imageBase?: string;
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

const pad2 = (n: number) => String(n).padStart(2, "0");

// normalize for search
const norm = (s: string) =>
  s.toLowerCase().replace(/['".,!?()\-_:]/g, " ").replace(/\s+/g, " ").trim();

const singularize = (s: string) => s.replace(/s\b/g, "");

// try to parse SxxExx from a filename (or path)
const parseEpisodeFromName = (name: string): { season?: number; episode?: number } => {
  const re = /(?:^|[^a-z0-9])s(\d{1,2})e(\d{1,3})(?:[^a-z0-9]|$)/i;
  const m = name.match(re);
  if (m) return { season: Number(m[1]), episode: Number(m[2]) };

  const re2 = /(?:^|[^a-z0-9])(\d{1,2})x(\d{1,3})(?:[^a-z0-9]|$)/i;
  const n = name.match(re2);
  if (n) return { season: Number(n[1]), episode: Number(n[2]) };

  const re3 = /(?:^|[^a-z0-9])e(\d{1,3})(?:[^a-z0-9]|$)/i;
  const eOnly = name.match(re3);
  if (eOnly) return { episode: Number(eOnly[1]) };

  const re4 = /episode\s*(\d{1,3})/i;
  const epWord = name.match(re4);
  if (epWord) return { episode: Number(epWord[1]) };

  return {};
};

// normalize season label like "S01" / "Season 1" to numeric 1
const seasonLabelToNumber = (s?: string | null): number | undefined => {
  if (!s) return undefined;
  const m = s.match(/(?:s|season)\s*(\d{1,2})/i);
  return m ? Number(m[1]) : undefined;
};

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

/* Player volume icons */
const volIconCls = "w-5 h-5 md:w-6 md:h-6";
function VolumeMuteIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={volIconCls} {...props}>
      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 9 4 12h-1v0h1l5 3V9zM14 10l6 6M20 10l-6 6" />
    </svg>
  );
}
function VolumeLowIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={volIconCls} {...props}>
      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 9 4 12h-1v0h1l5 3V9z" />
    </svg>
  );
}
function VolumeHighIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={volIconCls} {...props}>
      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 9 4 12h-1v0h1l5 3V9z" />
      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M14 8a4 4 0 0 1 0 8" />
      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M16.5 5.5a7 7 0 0 1 0 13" />
    </svg>
  );
}

/* ---------------------- PosterCard (hover effects + FM) ---------------------- */

function PosterCard({
  group,
  idx,
  onClick,
}: {
  group: GroupedMedia;
  idx: number;
  onClick: () => void;
}) {
  const cardRef = useRef<HTMLButtonElement | null>(null);

  // tiny tilt based on pointer position (already existed)
  const handleMove = useCallback((e: React.MouseEvent) => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;  // 0..1
    const py = (e.clientY - r.top) / r.height; // 0..1

    const rx = (py - 0.5) * -6; // X tilt
    const ry = (px - 0.5) * 6;  // Y tilt

    el.style.setProperty("--rx", `${rx}deg`);
    el.style.setProperty("--ry", `${ry}deg`);
    el.style.setProperty("--mx", `${(px * 100).toFixed(2)}%`);
    el.style.setProperty("--my", `${(py * 100).toFixed(2)}%`);
  }, []);

  const handleLeave = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty("--rx", `0deg`);
    el.style.setProperty("--ry", `0deg`);
  }, []);

  return (
    <motion.button
      ref={cardRef}
      className="poster-card poster-tilt flex-shrink-0 text-center snap-start"
      title={group.displayTitle}
      style={{ ["--i" as any]: idx }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 450, damping: 30, mass: 0.2 }}
    >
      <div className="poster-wrap">
        {/* Shared element for morphs: poster → modal/player */}
        <motion.img
          layoutId={`poster-${group.key}`}
          src={group.poster}
          alt={group.displayTitle}
          className="poster w-28 sm:w-36 md:w-44 h-40 sm:h-56 md:h-64 object-cover rounded-xl"
          loading="lazy"
          onError={(e) => ((e.currentTarget as HTMLImageElement).src = POSTER_FALLBACK)}
        />
        {/* sheen / glare sweep layer (already existed) */}
        <span aria-hidden className="poster-sheen" />
      </div>
      <p className="mt-2 truncate w-28 sm:w-36 md:w-44 text-sm">{group.displayTitle}</p>
    </motion.button>
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
      <motion.h2
        className="text-lg font-semibold px-6 mb-3"
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-10% 0px -10% 0px" }}
        transition={{ duration: 0.55, ease: [0.55, 1, 0.78, 1] }}
      >
        {title}
      </motion.h2>

      <div className="edge-mask anim-up">
        <div
          ref={rowRef}
          className="flex gap-5 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory px-6 py-1"
          style={{ scrollPaddingLeft: 24, scrollPaddingRight: 24 }}
        >
          {items.map((g, idx) => (
            <motion.div
              key={`${g.kind}-${g.key}`}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{
                duration: 0.28,
                ease: [0.55, 1, 0.78, 1],
                delay: Math.min(idx, 6) * 0.055, // mild stagger for first few visible
              }}
            >
              <PosterCard group={g} idx={idx} onClick={() => onSelectGroup(g)} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------ Episodes meta hook ------------------------ */

const EPISODE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function useSeasonEpisodesMeta(
  showTitle: string | undefined,
  year: number | undefined,
  seasonLabel: string | undefined
): { byEp: Record<number, TmdbEpisode>; imageBase?: string; ready: boolean } {
  const [state, setState] = useState<{ byEp: Record<number, TmdbEpisode>; imageBase?: string; ready: boolean }>({
    byEp: {},
    imageBase: undefined,
    ready: false,
  });

  useEffect(() => {
    const seasonNum = seasonLabelToNumber(seasonLabel);
    if (!showTitle || !seasonNum) {
      setState({ byEp: {}, imageBase: undefined, ready: true });
      return;
    }

    const key = `eps:${showTitle}:${year ?? ""}:S${pad2(seasonNum)}`;
    const cached = localStorage.getItem(key);
    const cachedAt = localStorage.getItem(`${key}:t`);

    const parseCached = () => {
      if (cached && cachedAt && Date.now() - Number(cachedAt) < EPISODE_CACHE_TTL_MS) {
        try {
          const parsed: EpisodesResponse = JSON.parse(cached);
          setState({ byEp: parsed.episodes || {}, imageBase: parsed.imageBase, ready: true });
          return true;
        } catch {}
      }
      return false;
    };

    if (parseCached()) return;

    let aborted = false;
    (async () => {
      try {
        // primary attempt (with year if we have one)
        let url = `/api/episodes?query=${encodeURIComponent(showTitle)}&season=${seasonNum}${
          year ? `&year=${year}` : ""
        }`;
        let res = await fetch(url);
        let data: EpisodesResponse = res.ok ? await res.json() : { episodes: {} };

        // Fallback: try again without a year filter if no episodes returned
        if (Object.keys(data.episodes || {}).length === 0 && year) {
          url = `/api/episodes?query=${encodeURIComponent(showTitle)}&season=${seasonNum}`;
          res = await fetch(url);
          data = res.ok ? await res.json() : { episodes: {} };
        }

        if (aborted) return;

        setState({ byEp: data.episodes || {}, imageBase: data.imageBase, ready: true });
        // cache
        localStorage.setItem(key, JSON.stringify(data));
        localStorage.setItem(`${key}:t`, String(Date.now()));
      } catch {
        if (!aborted) setState({ byEp: {}, imageBase: undefined, ready: true });
      }
    })();

    return () => {
      aborted = true;
    };
  }, [showTitle, year, seasonLabel]);

  return state;
}

/* ----------------------------- Main Page ---------------------------- */

export default function PS3StyleUI() {
  const [media, setMedia] = useState<GroupedMedia[]>([]);
  const [activeTab, setActiveTab] = useState<"TV" | "Movies">("TV");

  // selection (TV shows)
  const [selected, setSelected] = useState<GroupedMedia | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [selectedBackdrop, setSelectedBackdrop] = useState<string | null>(null);

  // track where we clicked from (for FLIP poster → modal/player)
  const [lastClickedKey, setLastClickedKey] = useState<string | null>(null);

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

  // volume state
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  // search state
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // navbar: blur only after scroll (already existed)
  const [navSolid, setNavSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setNavSolid(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  /* ------------------ player setup and fallback (native first) ------------------ */
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

      // 1) Try native progressive first
      elArg.src = streamUrl;
      try {
        await elArg.play();
        if (!cancelled) setIsPlaying(true);
        return;
      } catch {
        // fall through
      }

      // 2) Fallback to HLS
      const probe = await probeHls(fileArg.path);
      if (!probe.ok || !probe.m3u8) {
        if (cancelled) return;
        elArg.src = streamUrl;
        elArg.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        return;
      }

      const m3u8 = probe.m3u8!;

      if (Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: 20,
          lowLatencyMode: false,
          fragLoadingRetryDelay: 600,
          manifestLoadingRetryDelay: 600,
        });
        hlsRef.current = hls;
        hls.attachMedia(elArg);
        hls.loadSource(m3u8);

        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (cancelled) return;
          const fatal = data.fatal || data.type === Hls.ErrorTypes.NETWORK_ERROR;
          const fragIssue =
            data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR ||
            Hls.ErrorDetails.FRAG_LOAD_TIMEOUT === data.details;
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

  // keep volume/muted in sync with element + persist
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const savedVol = Number(localStorage.getItem("player:vol") ?? "1");
    const savedMuted = localStorage.getItem("player:muted") === "1";
    if (!Number.isNaN(savedVol)) v.volume = Math.max(0, Math.min(1, savedVol));
    v.muted = savedMuted;

    setVolume(v.volume);
    setMuted(v.muted);

    const onVol = () => {
      setVolume(v.volume);
      setMuted(v.muted);
      localStorage.setItem("player:vol", String(v.volume));
      localStorage.setItem("player:muted", v.muted ? "1" : "0");
    };

    v.addEventListener("volumechange", onVol);
    return () => v.removeEventListener("volumechange", onVol);
  }, [nowPlaying]);

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
      if (nowPlaying) {
        const v = videoRef.current;
        const showUI = () => showControlsTemporarily();
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
            const label = f.season || "S01";
            (mm[label] ||= []).push(f);
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
        } catch {}
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
        if (t === nq || tS === nqS) score = 100;
        else if (t.startsWith(nq) || tS.startsWith(nqS)) score = 80;
        else if (t.includes(nq) || tS.includes(nqS)) score = 60;
        const yearMatch = qLive.match(/(^|\D)(19|20)\d{2}(\D|$)/);
        if (yearMatch && it.year && yearMatch[0].includes(String(it.year))) score += 5;
        return { it, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.it.title.localeCompare(b.it.title))
      .map((x) => x.it);
    return scored;
  }, [qLive, searchIndex]);

  useEffect(() => {
    if (!results.length) setActiveIdx(0);
    else setActiveIdx((i) => Math.min(i, results.length - 1));
  }, [results.length]);

  const openFromResult = useCallback(
    (item: SearchItem) => {
      setSearchOpen(false);
      setQ("");
      setQLive("");
      setLastClickedKey(item.key); // for morphs
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

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [searchOpen]);

  /* ---------------------- poster click behaviour ---------------------- */
  const handleSelect = useCallback((g: GroupedMedia) => {
    setLastClickedKey(g.key);
    if (g.kind === "Movie") {
      const movie = g.seasons[0]?.files[0];
      if (movie) setNowPlaying(movie);
      return;
    }
    setSelected(g);
    setSelectedSeason(g.seasons[0]?.seasonName ?? null);
  }, []);

  // compute show year (min across files)
  const selectedYear = useMemo(() => {
    if (!selected) return undefined;
    const years: number[] = [];
    selected.seasons.forEach((s) =>
      s.files.forEach((f) => {
        if (typeof f.year === "number") years.push(f.year);
      })
    );
    if (!years.length) return undefined;
    return Math.min(...years);
  }, [selected]);

  // wide hero backdrop
  useEffect(() => {
    let aborted = false;
    async function fetchBackdrop() {
      if (!selected || selected.kind !== "TV Show") {
        setSelectedBackdrop(null);
        return;
      }
      const res = await fetch(
        `/api/backdrop?type=tv&query=${encodeURIComponent(selected.displayTitle)}${
          selectedYear ? `&year=${selectedYear}` : ""
        }`
      );
      const data = res.ok ? await res.json() : { backdrop: null as string | null };
      if (!aborted) setSelectedBackdrop(data.backdrop || null);
    }
    fetchBackdrop();
    return () => {
      aborted = true;
    };
  }, [selected, selectedYear]);

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

  // volume helpers
  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    showControlsTemporarily();
  }, [showControlsTemporarily]);

  const setVolumeSafe = useCallback(
    (val: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.volume = Math.max(0, Math.min(1, val));
      if (v.volume > 0 && v.muted) v.muted = false;
      showControlsTemporarily();
    },
    [showControlsTemporarily]
  );

  useEffect(() => {
    if (!nowPlaying) return;
    if (isPlaying) scheduleHide();
    else {
      clearHideTimer();
      setControlsVisible(true);
    }
    return clearHideTimer;
  }, [isPlaying, nowPlaying, scheduleHide]);

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

  const visibleGroups = media.filter((g) =>
    activeTab === "Movies" ? g.kind === "Movie" : g.kind === "TV Show"
  );
  const chunkSize = Math.ceil(Math.max(1, visibleGroups.length) / 3);
  const rows = [
    { title: "Popular", items: visibleGroups.slice(0, chunkSize) },
    { title: "Recently Added", items: visibleGroups.slice(chunkSize, chunkSize * 2) },
    { title: "Classics", items: visibleGroups.slice(chunkSize * 2) },
  ];

  // ----- episodes meta for the selected show/season
  const { byEp: epMeta, imageBase, ready: epReady } = useSeasonEpisodesMeta(
    selected?.displayTitle,
    selectedYear,
    selectedSeason ?? selected?.seasons[0]?.seasonName
  );

  // the selected season's local files
  const currentSeasonFiles: MediaFile[] = useMemo(() => {
    if (!selected) return [];
    const label = selectedSeason ?? selected.seasons[0]?.seasonName;
    const list = selected.seasons.find((s) => s.seasonName === label)?.files ?? [];
    return [...list].sort((a, b) => {
      const ea = parseEpisodeFromName(a.name).episode ?? 0;
      const eb = parseEpisodeFromName(b.name).episode ?? 0;
      return ea - eb || a.name.localeCompare(b.name);
    });
  }, [selected, selectedSeason]);

  // choose correct volume icon
  const VolumeIcon = muted || volume === 0 ? VolumeMuteIcon : volume < 0.5 ? VolumeLowIcon : VolumeHighIcon;

  return (
    <LayoutGroup>
      <div className="fa-bg min-h-screen text-white">
        {/* NAVBAR */}
        <nav
          className={[
            "fixed top-0 left-0 right-0 z-30 transition-all duration-300",
            "px-4 md:px-6 py-3 flex items-center gap-3",
            navSolid
              ? "bg-black/60 backdrop-blur-md border-b border-white/10 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]"
              : "bg-transparent"
          ].join(" ")}
        >
          <div className="flex items-center gap-3">{/* logo slot */}</div>

          {/* Segmented control (existing) */}
          <div>
            <div className="segment">
              <button
                className={`segment-btn ${activeTab === "TV" ? "is-active" : ""}`}
                onClick={() => setActiveTab("TV")}
              >
                TV Shows
              </button>
              <button
                className={`segment-btn ${activeTab === "Movies" ? "is-active" : ""}`}
                onClick={() => setActiveTab("Movies")}
              >
                Movies
              </button>
            </div>
          </div>

          <div className="flex-1" />

          {/* Right actions */}
          <div className="hidden md:flex items-center gap-2 mr-1">
            <button
              className="chip flex items-center gap-2"
              title="Shuffle a Movie"
              onClick={() => {
                const m = media.filter((g) => g.kind === "Movie");
                if (!m.length) return;
                const rand = m[Math.floor(Math.random() * m.length)];
                setLastClickedKey(rand.key);
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

          {/* Icon-only Search */}
          <button className="chip" aria-label="Search" title="Search" onClick={() => setSearchOpen(true)}>
            <SearchIcon />
          </button>
        </nav>

        <main className="pt-24 pb-10">
          {rows.map((row) => (
            <PosterRow key={row.title} title={row.title} items={row.items} onSelectGroup={handleSelect} />
          ))}
        </main>

        {/* ---------------------- SEARCH OVERLAY (FM) ---------------------- */}
        <AnimatePresence>
          {searchOpen && (
            <motion.div
              className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm overscroll-none"
              onClick={() => setSearchOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <motion.div
                className="mx-auto mt-16 max-w-5xl px-4"
                onClick={(e) => e.stopPropagation()}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 10, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
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
                    <button className="chip" onClick={() => { setSearchOpen(false); setQ(""); }}>
                      <XIcon />
                    </button>
                  </div>
                </div>

                {/* Results */}
                <AnimatePresence initial={false}>
                  {qLive && results.length > 0 && (
                    <motion.div
                      className="mt-3 glass rounded-2xl max-h-[60vh] overflow-y-auto overscroll-contain"
                      initial={{ opacity: 0, scale: 0.995 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.995 }}
                      transition={{ duration: 0.55 }}
                    >
                      {results.map((r, i) => (
                        <motion.button
                          key={r.key}
                          className={`w-full flex gap-4 items-center px-4 py-3 text-left hover:bg-white/5 ${
                            i === activeIdx ? "bg-white/10" : ""
                          }`}
                          onMouseEnter={() => setActiveIdx(i)}
                          onClick={() => openFromResult(r)}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 6 }}
                          transition={{ duration: 0.18, delay: Math.min(i, 6) * 0.035 }}
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
                        </motion.button>
                      ))}
                      <div className="px-4 py-2 text-xs opacity-60 border-t border-white/10 sticky bottom-0 bg-black/20 backdrop-blur">
                        {results.length} result{results.length === 1 ? "" : "s"}
                      </div>
                    </motion.div>
                  )}

                  {qLive && results.length === 0 && (
                    <motion.div
                      className="mt-3 glass rounded-2xl p-4 text-sm opacity-80"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                    >
                      No results for “{qLive}”.
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* --------------------------- DETAILS MODAL (TV) --------------------------- */}
        <AnimatePresence>
          {selected && (
            <motion.section
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => {
                setSelected(null);
                setSelectedSeason(null);
                setSelectedBackdrop(null);
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <motion.div
                className="glass w-full max-w-5xl max-h-[85vh] overflow-auto rounded-2xl"
                onClick={(e) => e.stopPropagation()}
                initial={{ y: 12, opacity: 0, scale: 0.98 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 12, opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.55, ease: [0.55, 1, 0.78, 1] }}
              >
                {/* HERO with shared element morph from poster */}
                <div className="relative h-[38vh] min-h-[240px] w-full overflow-hidden rounded-t-2xl">
                  <motion.img
                    layoutId={lastClickedKey ? `poster-${lastClickedKey}` : undefined}
                    src={selectedBackdrop || selected.poster || POSTER_FALLBACK}
                    alt={selected.displayTitle}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => ((e.currentTarget as HTMLImageElement).src = POSTER_FALLBACK)}
                    loading="eager"
                    transition={{ type: "spring", stiffness: 350, damping: 35, mass: 0.4 }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="absolute left-4 right-4 bottom-4 flex flex-wrap items-end gap-3 justify-between">
                    {/* Left: Title + Year + Season dropdown */}
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-2xl md:text-3xl font-semibold drop-shadow">
                        {selected.displayTitle}
                        {selectedYear ? <span className="opacity-80 text-base md:text-lg"> ({selectedYear})</span> : null}
                      </h3>

                      {/* Seasons dropdown (only what exists locally) */}
                      {selected.kind === "TV Show" && selected.seasons.length > 0 && (
                        <label className="sr-only" htmlFor="seasonSelect">Season</label>
                      )}

                      {selected.kind === "TV Show" && selected.seasons.length > 0 && (
                        <select
                          id="seasonSelect"
                          value={selectedSeason ?? selected.seasons[0]?.seasonName}
                          onChange={(e) => setSelectedSeason(e.target.value)}
                          className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm backdrop-blur hover:bg-white/15 focus:outline-none"
                        >
                          {selected.seasons.map((s) => (
                            <option key={s.seasonName} value={s.seasonName}>
                              {s.seasonName} ({s.files.length})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Right: Close */}
                    <button
                      className="chip"
                      onClick={() => {
                        setSelected(null);
                        setSelectedSeason(null);
                        setSelectedBackdrop(null);
                      }}
                    >
                      ✕ Close
                    </button>
                  </div>
                </div>

                {/* CONTENT: Episodes */}
                <div className="p-4 md:p-6">
                  <h4 className="mb-2 font-semibold">
                    Episodes — {selectedSeason ?? selected.seasons[0]?.seasonName}
                  </h4>

                  {!epReady && <div className="opacity-70 text-sm mb-2">Loading episode details…</div>}

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {currentSeasonFiles.map((file: MediaFile, i: number) => {
                      const parsed = parseEpisodeFromName(file.name);
                      const epNo = parsed.episode;
                      const tmdb = epNo ? epMeta[epNo] : undefined;

                      const title =
                        tmdb?.name
                          ? `Episode ${pad2(epNo!)} — ${tmdb.name}`
                          : epNo
                            ? `Episode ${pad2(epNo)}`
                            : file.name;

                      const stillSrc =
                        tmdb?.still_path && imageBase ? `${imageBase}/w780${tmdb.still_path}` : undefined;

                      return (
                        <motion.button
                          key={file.path}
                          className="group rounded-lg overflow-hidden bg-white/5 border border-white/10 hover:border-white/30 transition"
                          onClick={() => {
                            setNowPlaying(file);
                            setLastClickedKey(selected.key);
                            setSelected(null);
                            setSelectedSeason(null);
                            setSelectedBackdrop(null);
                          }}
                          title={title}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: Math.min(i, 8) * 0.04 }}
                          whileTap={{ scale: 0.985 }}
                        >
                          <div className="aspect-video w-full bg-black/30 overflow-hidden">
                            {stillSrc ? (
                              <img
                                src={stillSrc}
                                alt={title}
                                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                                onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <span className="opacity-80 text-sm px-2 text-center truncate">{title}</span>
                              </div>
                            )}
                          </div>
                          <div className="p-2 text-left">
                            <span className="block truncate text-xs opacity-70">
                              {selectedSeason ?? ""}
                            </span>
                            <span className="block truncate text-sm">{title}</span>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ----------------------------- VIDEO PLAYER ----------------------------- */}
        <AnimatePresence>
          {nowPlaying && (
            <motion.section
              className="fixed inset-0 z-[100] bg-black"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <motion.div
                ref={playerShellRef}
                className={`absolute inset-0 flex flex-col ${controlsVisible ? "" : "cursor-none"}`}
                initial={{ scale: 0.995 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.995 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Optional: shared element morph poster → video background */}
                <AnimatePresence>
                  {lastClickedKey && (
                    <motion.div
                      className="absolute inset-0"
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.28 }}
                    >
                      <motion.img
                        layoutId={`poster-${lastClickedKey}`}
                        src={
                          media.find((g) => g.key === lastClickedKey)?.poster ||
                          POSTER_FALLBACK
                        }
                        alt=""
                        className="absolute inset-0 w-full h-full object-contain opacity-30"
                        transition={{ type: "spring", stiffness: 360, damping: 36, mass: 0.4 }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Top bar (auto-hide) */}
                <motion.div
                  className={`${
                    controlsVisible ? "hud-top hud-top--visible" : "hud-top hud-top--hidden pointer-events-none"
                  } flex items-center justify-between p-3 md:p-4 bg-gradient-to-b from-black/70 to-transparent`}
                  initial={false}
                  animate={{ opacity: controlsVisible ? 1 : 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <div className="min-w-0">
                    <h5 className="font-semibold drop-shadow truncate">
                      {(() => {
                        const t = nowPlaying?.cleanTitle || nowPlaying?.name || "Untitled";
                        const y = nowPlaying?.year ? ` (${nowPlaying.year})` : "";
                        return `${t}${y}`;
                      })()}
                    </h5>
                  </div>
                  <div className="flex gap-2">
                    <button className="chip" onClick={toggleFullscreen}>
                      ⛶ Fullscreen
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
                </motion.div>

                {/* video area */}
                <div className="relative flex-1">
                  <video
                    ref={videoRef}
                    key={nowPlaying?.path}
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

                  {/* center transport controls */}
                  <motion.div
                    className={`absolute inset-0 ${
                      controlsVisible ? "hud-center hud-center--visible" : "hud-center hud-center--hidden pointer-events-none"
                    } flex items-center justify-center gap-6`}
                    initial={false}
                    animate={{ opacity: controlsVisible ? 1 : 0 }}
                    transition={{ duration: 0.18 }}
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
                      ⟲
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
                      ⟳
                    </button>
                  </motion.div>

                  {/* bottom control bar */}
                  <motion.div
                    className={`absolute left-0 right-0 bottom-0 ${
                      controlsVisible ? "hud-bottom hud-bottom--visible" : "hud-bottom hud-bottom--hidden pointer-events-none"
                    } p-4 bg-gradient-to-t from-black/80 to-transparent`}
                    initial={false}
                    animate={{ opacity: controlsVisible ? 1 : 0 }}
                    transition={{ duration: 0.18 }}
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
                        aria-label="Seek"
                      />

                      <span className="w-16 tabular-nums">{fmtTime(duration)}</span>

                      <button
                        className="chip px-3"
                        onClick={toggleMute}
                        title={muted ? "Unmute" : "Mute"}
                        aria-label={muted ? "Unmute" : "Mute"}
                      >
                        <VolumeIcon />
                      </button>

                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={muted ? 0 : volume}
                        onChange={(e) => setVolumeSafe(Number(e.target.value))}
                        onMouseDown={showControlsTemporarily}
                        onTouchStart={showControlsTemporarily}
                        className="w-24 md:w-32 accent-white"
                        aria-label="Volume"
                      />
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}
