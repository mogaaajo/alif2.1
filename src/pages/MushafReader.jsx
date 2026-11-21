import { playbackStart } from "@/lib/practiceSession";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu, Settings, Search, ChevronLeft, ChevronRight, Play, Pause, SkipBack, SkipForward,
  Eye, EyeOff, Users, Brain, X, SlidersHorizontal, Repeat, Palette, BookOpen, Home,
  Moon, Sun, Type, Square, Volume2,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSettings } from "@/context/SettingsContext";
import { usePlayback } from "@/context/PlaybackContext";
import { getPageAudio, getSurah, getJuzAudio, getSurahs, getTajweed } from "@/lib/api";
import MushafAyahText from "@/components/MushafAyahText";
import ReaderHeader from "@/components/ReaderHeader";
import SettingsDrawer from "@/components/SettingsDrawer";
import MushafReciteDock from "@/components/MushafReciteDock";
import { fitMushafPage, getCachedPageFontSize } from "@/lib/fitMushafPage";
import { BASMALA_TEXT, needsBasmalaBefore, appendAyahWithBasmala } from "@/lib/basmala";
import { surahStartPage } from "@/lib/mushafPages";
import { TAJWEED_RULES } from "@/lib/tajweed";

const toArabicNum = (n) => String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);
const clampPage = (p) => Math.min(604, Math.max(1, p));

const SCOPES = [
  { id: "page", label: "This page" },
  { id: "surah", label: "This surah" },
  { id: "nextN", label: "Next N surahs" },
  { id: "range", label: "Range" },
  { id: "juz", label: "Full Juz" },
];

const MushafReader = () => {
  const { page: pageParam } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isReciteAlongMode = searchParams.get("mode") === "along";
  const {
    theme,
    setTheme,
    reciter,
    setReciter,
    translation,
    reciters,
    repeatEach,
    setRepeatEach,
    tajweedOn,
    setTajweedOn,
  } = useSettings();
  const { current, isPlaying, playQueue, toggle, clear } = usePlayback();

  const page = clampPage(Number(pageParam) || 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retryLoad, setRetryLoad] = useState(0);
  const [controlsOpen, setControlsOpen] = useState(true);
  const [readerTheme, setReaderTheme] = useState(() => (theme === "dark" ? "night" : "paper"));
  const [arabicSize, setArabicSize] = useState(() => Number(localStorage.getItem("alif_mushaf_text_size") || 0));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [readerMenuOpen, setReaderMenuOpen] = useState(false);
  const [hideVerses, setHideVerses] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState(() => new Set());
  const [reciteAyahIndex, setReciteAyahIndex] = useState(0);
  const [tajweedMap, setTajweedMap] = useState({});
  const [tajweedRule, setTajweedRule] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [surahList, setSurahList] = useState([]);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("page");
  const [playNextN, setPlayNextN] = useState(3);
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(3);

  const touchX = useRef(null);
  const lastTapRef = useRef({ key: null, t: 0 });
  const basmalaCacheRef = useRef({});
  const pageSurfaceRef = useRef(null);
  const pageTextRef = useRef(null);

  const pageCacheRef = useRef(new Map());

  useEffect(() => {
    let active = true;
    setLoadError("");
    setCtx(null);

    // Reset scroll smoothly to top
    if (pageSurfaceRef.current) {
      pageSurfaceRef.current.scrollTop = 0;
    }

    const cacheKey = `${page}_${reciter}_${translation}`;
    const cached = pageCacheRef.current.get(cacheKey);

    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    getPageAudio(page, reciter, translation)
      .then((pageData) => {
        if (!active) return;
        pageCacheRef.current.set(cacheKey, pageData);
        setData(pageData);
        setLoading(false);

        // Preload adjacent pages to make next/prev instant with zero flicker
        if (page > 1) {
          const prevKey = `${page - 1}_${reciter}_${translation}`;
          if (!pageCacheRef.current.has(prevKey)) {
            getPageAudio(page - 1, reciter, translation)
              .then((d) => pageCacheRef.current.set(prevKey, d))
              .catch(() => {});
          }
        }
        if (page < 604) {
          const nextKey = `${page + 1}_${reciter}_${translation}`;
          if (!pageCacheRef.current.has(nextKey)) {
            getPageAudio(page + 1, reciter, translation)
              .then((d) => pageCacheRef.current.set(nextKey, d))
              .catch(() => {});
          }
        }
      })
      .catch(() => {
        if (active) {
          setLoadError("Could not load this page.");
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [page, reciter, translation, retryLoad]);

  useEffect(() => { getSurahs().then(setSurahList).catch(() => {}); }, []);
  useEffect(() => { localStorage.setItem("alif_mushaf_theme", readerTheme); }, [readerTheme]);
  // Home, Focus, practice modes, and the full Mushaf all share one visual preference.
  useEffect(() => { setReaderTheme(theme === "dark" ? "night" : "paper"); }, [theme]);
  useEffect(() => { localStorage.setItem("alif_mushaf_text_size", String(arabicSize)); }, [arabicSize]);

  const ayahs = useMemo(() => data?.ayahs || [], [data]);
  const meta = ayahs[0];
  const juz = meta?.juz;
  const curSurah = meta?.surahNumber || 1;

  // Track active playing ayah index on current page
  const currentAyahPageIndex = useMemo(() => {
    if (!current || !ayahs.length) return -1;
    return ayahs.findIndex(
      (a) => a.surahNumber === current.surahNumber && a.numberInSurah === current.numberInSurah
    );
  }, [current, ayahs]);

  // Audio-guided progressive reveal: as playback reaches or passes an ayah, keep it revealed permanently
  useEffect(() => {
    if (!hideVerses || currentAyahPageIndex < 0) return;
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      for (let i = 0; i <= currentAyahPageIndex; i++) {
        const a = ayahs[i];
        if (a) next.add(`${a.surahNumber}:${a.numberInSurah}`);
      }
      return next;
    });
  }, [hideVerses, currentAyahPageIndex, ayahs]);

  // Reset reveals on page navigation
  useEffect(() => {
    setRevealedKeys(new Set());
    setReciteAyahIndex(0);
  }, [page]);

  const isAyahRevealed = (a, idx) => {
    if (!hideVerses) return true;
    const key = `${a.surahNumber}:${a.numberInSurah}`;
    if (revealedKeys.has(key)) return true;
    if (currentAyahPageIndex >= 0 && idx <= currentAyahPageIndex) return true;
    if (isReciteAlongMode && reciteAyahIndex >= 0 && idx <= reciteAyahIndex) return true;
    return false;
  };

  useLayoutEffect(() => {
    if (loading || !ayahs.length) return undefined;
    let active = true;
    let frame;
    const fit = (isInitial = false) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (active && pageSurfaceRef.current && pageTextRef.current) {
          fitMushafPage(pageSurfaceRef.current, pageTextRef.current, arabicSize, page, isInitial);
        }
      });
    };
    const observer = new ResizeObserver(() => fit(false));
    if (pageSurfaceRef.current) observer.observe(pageSurfaceRef.current);
    // On page turn or initial mount, do not run heavy binary search reflow immediately
    fit(true);
    document.fonts?.ready.then(() => { if (active) fit(false); });
    document.fonts?.addEventListener("loadingdone", () => fit(false));
    window.visualViewport?.addEventListener("resize", () => fit(false));
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.fonts?.removeEventListener("loadingdone", () => fit(false));
      window.visualViewport?.removeEventListener("resize", () => fit(false));
    };
  }, [loading, ayahs, arabicSize, page, tajweedMap]);

  useEffect(() => { setRangeStart(curSurah); setRangeEnd(Math.min(114, curSurah + 2)); }, [curSurah]);

  // fetch tajweed for every surah appearing on this page when toggled on
  useEffect(() => {
    if (!tajweedOn || !ayahs.length) return;
    let active = true;
    const surahs = [...new Set(ayahs.map((a) => a.surahNumber))];
    Promise.all(surahs.map((s) => getTajweed(s).then((r) => ({ s, r })).catch(() => null))).then((res) => {
      if (!active) return;
      const m = {};
      res.forEach((x) => x && x.r.ayahs.forEach((a) => (m[`${x.s}:${a.numberInSurah}`] = a.segments)));
      setTajweedMap(m);
    });
    return () => { active = false; };
  }, [tajweedOn, ayahs]);

  const goToPage = (p) => {
    const np = clampPage(p);
    if (np !== page) {
      try {
        localStorage.setItem("alif_last_page", String(np));
      } catch {}
      navigate(`/mushaf/${np}`);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem("alif_last_page", String(page));
      if (curSurah) localStorage.setItem("alif_last_surah", String(curSurah));
    } catch {}
  }, [page, curSurah]);

  const onTouchStart = (e) => {
    if (e.target.closest("button, a, [role=button], [data-testid=mushaf-audiobar], [data-testid=mushaf-topbar], [data-testid=settings-drawer]")) { touchX.current = null; return; }
    const touch = e.changedTouches[0];
    touchX.current = { x: touch.clientX, y: touch.clientY };
  };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current.x;
    const dy = e.changedTouches[0].clientY - touchX.current.y;
    touchX.current = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) <= Math.abs(dy)) return;
    // Quran RTL: Swiping left advances forward (page + 1), swiping right goes backward (page - 1)
    if (dx < 0) goToPage(page + 1); else goToPage(page - 1);
  };

  const isActive = (a) => current && current.surahNumber === a.surahNumber && current.numberInSurah === a.numberInSurah;
  const pagePlaying = current && (current.isBasmala ? current.page === page : ayahs.some((a) => isActive(a)));

  const getBasmalaUrl = async () => {
    if (basmalaCacheRef.current[reciter]) return basmalaCacheRef.current[reciter];
    try {
      const d = await getSurah(1, reciter, translation);
      const url = d.ayahs?.[0]?.audio || null;
      basmalaCacheRef.current[reciter] = url;
      return url;
    } catch {
      return null;
    }
  };

  const buildScopeQueue = async () => {
    const basmalaAudio = await getBasmalaUrl();
    const push = (arr, ays, fallbackSurah = curSurah, fallbackName, fallbackPage) => ays.forEach((a) => appendAyahWithBasmala(arr, {
      ayah: a,
      surahNumber: a.surahNumber ?? fallbackSurah,
      surahName: a.surahName ?? fallbackName,
      basmalaAudio,
      page: a.page ?? fallbackPage,
    }));
    let items = [];
    if (scope === "page") {
      push(items, ayahs, curSurah, ayahs[0]?.surahName, page);
      return { items, label: `Page ${page}` };
    }
    if (scope === "surah") {
      const d = await getSurah(curSurah, reciter, translation);
      push(items, d.ayahs, curSurah, d.surah.englishName);
      return { items, label: d.surah.englishName };
    }
    if (scope === "nextN" || scope === "range") {
      const s = scope === "nextN" ? curSurah : Math.min(rangeStart, rangeEnd);
      const e = scope === "nextN" ? Math.min(114, curSurah + Math.max(1, playNextN) - 1) : Math.max(rangeStart, rangeEnd);
      const nums = []; for (let n = s; n <= e; n++) nums.push(n);
      const results = await Promise.all(nums.map((n) => getSurah(n, reciter, translation)));
      results.forEach((d, i) => push(items, d.ayahs, nums[i], d.surah.englishName));
      return { items, label: scope === "nextN" ? `Next ${playNextN} surahs` : `Surahs ${s}–${e}` };
    }
    const jd = await getJuzAudio(juz || 1, reciter, translation);
    push(items, jd.ayahs);
    return { items, label: `Juz ${juz}` };
  };

  const play = async (startAyah) => {
    const { items, label } = await buildScopeQueue();
    const anchor = startAyah || ayahs[0];
    const idx = playbackStart(items, anchor?.surahNumber, anchor?.numberInSurah);
    playQueue(items, idx, label);
  };

  const onPlayFab = () => { if (pagePlaying) toggle(); else play(null); };

  // page auto-follow: turn the page as recitation crosses page boundaries
  useEffect(() => {
    if (current && current.page && current.page !== page) goToPage(current.page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const handleAyahClick = (e, a, idx) => {
    e.stopPropagation();
    const key = `${a.surahNumber}:${a.numberInSurah}`;
    if (hideVerses && !isAyahRevealed(a, idx)) {
      setRevealedKeys((prev) => new Set(prev).add(key));
    }
    if (isReciteAlongMode) {
      setReciteAyahIndex(idx);
      return;
    }
    const now = Date.now();
    const last = lastTapRef.current;
    if (last.key === key && now - last.t < 320) {
      lastTapRef.current = { key: null, t: 0 };
      setCtx({ ayah: a, x: e.clientX, y: e.clientY });
    } else {
      lastTapRef.current = { key, t: now };
    }
  };

  const surahEnglish = ayahs.length ? [...new Set(ayahs.map((a) => a.surahName))].join(" · ") : "";
  const norm = (s = "") => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(.)\1+/g, "$1");
  const filteredSurahs = surahList.filter((s) => {
    const q = norm(query);
    return !q || norm(s.englishName).includes(q) || norm(s.englishNameTranslation || "").includes(q) || String(s.number) === query.trim();
  });
  const night = readerTheme === "night";
  const pageColors = night
    ? { shell: "bg-[#151815] text-[#f5f7f2]", bar: "border-white/10 bg-[#1a1d1a]/95", surface: "bg-[#151815]", text: "text-[#f5f7f2]", banner: "border-[#789d82]/45 bg-[#203127] text-[#e7f2e8]", muted: "text-slate-300" }
    : { shell: "bg-[#f7f3e8] text-[#273127]", bar: "border-[#d8cfbb] bg-[#fffdf6]/95", surface: "bg-[#f7f3e8]", text: "text-[#252d25]", banner: "border-[#b69752]/60 bg-[#b59752] text-[#fffaf0]", muted: "text-[#596559]" };

  return (
    <div
      className={`relative flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden select-none ${pageColors.shell}`}
      dir="rtl"
      onClick={() => { setCtx(null); setControlsOpen((o) => !o); }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      data-testid="mushaf-reader"
    >
      {/* Top bar overlay with subtle segmented mode switcher */}
      <ReaderHeader
        currentMode={isReciteAlongMode ? "along" : "mushaf"}
        page={page}
        surahNumber={curSurah}
        surahName={surahEnglish}
        juz={juz}
        onPrevPage={() => goToPage(page - 1)}
        onNextPage={() => goToPage(page + 1)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onModeChange={(modeId) => {
          if (modeId === "along") {
            setSearchParams({ mode: "along" });
          } else if (modeId === "mushaf") {
            setSearchParams({});
          } else if (modeId === "focus") {
            navigate(`/surah/${curSurah}`);
          } else if (modeId === "memorize") {
            navigate(`/surah/${curSurah}/memorize`);
          }
        }}
        theme={theme}
        onToggleTheme={() => setTheme(night ? "light" : "dark")}
        visible={controlsOpen}
        night={night}
      />

      {/* Page surface: 100% constant dimensions and padding regardless of controls visibility */}
      <main
        ref={pageSurfaceRef}
        className={`min-h-0 flex-1 overflow-y-auto px-4 sm:px-8 pt-24 pb-28 sm:pt-28 sm:pb-32 ${pageColors.surface}`}
        data-testid="mushaf-page-surface"
      >
        {loadError ? (
          <div role="alert" className="p-6 text-center">
            {loadError}
            <button className="ml-3 underline" onClick={() => setRetryLoad((n) => n + 1)}>
              Retry
            </button>
          </div>
        ) : loading && !data ? (
          <div className={`mx-auto mt-20 h-64 max-w-2xl animate-pulse rounded-2xl ${night ? "bg-white/5" : "bg-[#e9e2d3]"}`} />
        ) : (
          <div className="mx-auto w-full max-w-[820px] flex flex-col justify-center min-h-full transition-opacity duration-150">
            <p
              ref={pageTextRef}
              className={`font-arabic text-right ${pageColors.text}`}
              dir="rtl"
              style={{
                fontSize: `${getCachedPageFontSize(page, arabicSize, typeof window !== "undefined" && window.innerWidth < 640)}px`,
                lineHeight: 2.1,
                direction: "rtl",
                unicodeBidi: "plaintext",
                textAlign: "justify",
                textAlignLast: "center",
                textJustify: "inter-word",
                wordSpacing: "normal",
                letterSpacing: "normal",
              }}
              data-testid="mushaf-text"
            >
              {ayahs.map((a, idx) => {
                const seg = tajweedOn ? tajweedMap[`${a.surahNumber}:${a.numberInSurah}`] : null;
                const revealed = isAyahRevealed(a, idx);
                const activeAudio = isActive(a);
                const activeRecite = isReciteAlongMode && idx === reciteAyahIndex;
                const active = activeAudio || activeRecite;

                return (
                  <React.Fragment key={`${a.surahNumber}:${a.numberInSurah}`}>
                    {a.numberInSurah === 1 && (
                      <span className="block">
                        <span className={`my-1.5 flex h-8 items-center justify-center rounded-md border-y-2 font-arabic text-base sm:my-3 sm:h-11 sm:text-xl ${pageColors.banner}`} data-testid={`mushaf-banner-${a.surahNumber}`}>
                          ﴾ {a.surahNameArabic || a.surahName} ﴿
                        </span>
                      </span>
                    )}
                    {needsBasmalaBefore(a.surahNumber, a.numberInSurah) && (
                      <span className="block text-center" style={{ lineHeight: 2.1, textAlign: "center", textAlignLast: "center" }} data-testid={`mushaf-basmala-${a.surahNumber}`}>
                        {BASMALA_TEXT}
                      </span>
                    )}
                    <span
                      onClick={(e) => handleAyahClick(e, a, idx)}
                      data-testid={`mushaf-ayah-${a.surahNumber}-${a.numberInSurah}`}
                      title={!revealed ? "Hidden ayah — tap to reveal" : undefined}
                      className={`cursor-pointer rounded-md [box-decoration-break:clone] [-webkit-box-decoration-break:clone] transition-all duration-200 ${
                        !revealed
                          ? "opacity-100 select-none hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                          : `opacity-100 filter-none select-auto ${
                              active
                                ? activeRecite
                                  ? "bg-emerald-500/30 ring-2 ring-emerald-500 shadow-sm"
                                  : "bg-emerald-500/25 ring-2 ring-emerald-500/30"
                                : night
                                ? "hover:bg-white/5"
                                : "hover:bg-[#d8e5d6]"
                            }`
                      }`}
                    >
                      <MushafAyahText
                        text={a.arabic}
                        segments={seg}
                        hidden={!revealed}
                        onRule={setTajweedRule}
                        marker={
                          <span
                            className={`mx-0.5 inline-flex items-center justify-center rounded-full border align-middle font-sans font-medium transition-opacity ${
                              !revealed ? "opacity-70" : "opacity-100"
                            } ${night ? "border-[#87a695] text-[#c8d8cc]" : "border-[#b59752] text-[#8e7138]"}`}
                            style={{ width: "2.2em", height: "2.2em", fontSize: "0.55em", lineHeight: 1 }}
                            data-testid={`mushaf-medallion-${a.surahNumber}-${a.numberInSurah}`}
                          >
                            {toArabicNum(a.numberInSurah)}
                          </span>
                        }
                      />
                    </span>{" "}
                  </React.Fragment>
                );
              })}
            </p>
          </div>
        )}
      </main>

      {/* Floating Overlays */}
      {/* page pill */}
      <div
        className={`pointer-events-none fixed inset-x-0 bottom-16 z-30 flex justify-center transition-opacity duration-200 ease-out sm:bottom-44 ${
          controlsOpen && !isReciteAlongMode ? "opacity-100" : "opacity-0"
        }`}
        dir="ltr"
      >
        <span className={`rounded-full border px-3 py-0.5 text-[11px] font-semibold backdrop-blur-xl sm:px-4 sm:py-1 sm:text-xs ${night ? "border-white/10 bg-[#0a0a0a]/80 text-slate-200" : "border-[#d8cfbb] bg-[#fffdf6]/85 text-[#596559]"}`} data-testid="mushaf-page-pill">{page}</span>
      </div>

      {/* Play FAB */}
      {!isReciteAlongMode && (
        <button
          onClick={(e) => { e.stopPropagation(); onPlayFab(); }}
          className={`fixed bottom-28 right-6 z-40 hidden h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-black shadow-[0_0_28px_rgba(16,185,129,0.5)] transition-all duration-200 hover:scale-105 sm:flex ${
            controlsOpen
              ? "translate-y-0 opacity-100 pointer-events-auto"
              : "translate-y-4 opacity-0 pointer-events-none"
          }`}
          data-testid="mushaf-play-fab"
          aria-label="Play page"
        >
          {pagePlaying && isPlaying ? <Pause className="h-7 w-7" /> : <Play className="ml-0.5 h-7 w-7" />}
        </button>
      )}

      {/* Bottom Dock: Native Recite Along Dock or Audio Dock */}
      {isReciteAlongMode ? (
        <MushafReciteDock
          ayahs={ayahs}
          page={page}
          surahNumber={curSurah}
          activeAyahIndex={reciteAyahIndex}
          onSelectAyahIndex={setReciteAyahIndex}
          onClose={() => setSearchParams({})}
          night={night}
        />
      ) : (
        <div
          className={`fixed inset-x-0 bottom-0 z-50 flex flex-col gap-2 border-t px-3 py-1.5 backdrop-blur-2xl transition-all duration-200 ease-out sm:gap-3 sm:px-4 sm:py-3 ${pageColors.bar} ${
            controlsOpen
              ? "translate-y-0 opacity-100 pointer-events-auto"
              : "translate-y-full opacity-0 pointer-events-none"
          }`}
          dir="ltr"
          onClick={(e) => e.stopPropagation()}
          data-testid="mushaf-audiobar"
        >
          <div className="flex items-center justify-between gap-2">
            <Select value={reciter} onValueChange={setReciter}>
              <SelectTrigger className={`h-9 max-w-[180px] min-w-[108px] flex-1 rounded-full text-sm sm:w-[180px] sm:flex-none ${night ? "border-white/10 bg-white/5 text-slate-100" : "border-[#d8cfbb] bg-[#fffdf6] text-[#455545]"}`} style={{ width: "clamp(108px, 40vw, 180px)" }} data-testid="mushaf-reciter-select"><Volume2 className="mr-1 h-3.5 w-3.5 shrink-0" /><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">{reciters.map((r) => <SelectItem key={r.identifier} value={r.identifier}>{r.englishName}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setHideVerses((hidden) => !hidden)}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${pageColors.muted} ${
                  hideVerses ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : ""
                }`}
                data-testid="mushaf-hide-verses"
                aria-label={hideVerses ? "Show verses" : "Hide verses"}
                aria-pressed={hideVerses}
                title={hideVerses ? "Testing mode active — unrecited verses hidden" : "Normal reading mode"}
              >
                {hideVerses ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              {hideVerses && revealedKeys.size > 0 && (
                <button
                  type="button"
                  onClick={() => setRevealedKeys(new Set())}
                  className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                  data-testid="mushaf-rehide-btn"
                  title="Re-hide manually revealed verses"
                >
                  Re-hide
                </button>
              )}
              {/* Continuous play scope + repeat */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className={`flex items-center gap-1 rounded-full border px-3 py-2 text-xs font-medium ${night ? "border-white/10 text-slate-200 hover:bg-white/10" : "border-[#d8cfbb] text-[#455545] hover:bg-[#eee7d7]"}`} data-testid="mushaf-scope-btn">
                    <SlidersHorizontal className="h-4 w-4" /> <span className="hidden sm:inline">{SCOPES.find((s) => s.id === scope)?.label}</span><span className="sm:hidden">Play options</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="end" className="w-64" data-testid="mushaf-scope-panel">
                  <p className="mb-2 text-sm font-semibold">Continuous play</p>
                  <div className="space-y-1.5">
                    {SCOPES.map((s) => (
                      <button key={s.id} onClick={() => setScope(s.id)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-left text-sm ${scope === s.id ? "border-primary bg-primary/5" : "border-border text-muted-foreground"}`} data-testid={`mushaf-scope-${s.id}`}>
                        {s.label}{s.id === "juz" && <span className="text-xs text-muted-foreground">Juz {juz}</span>}
                      </button>
                    ))}
                  </div>
                  {scope === "nextN" && (
                    <div className="mt-3 flex items-center justify-between"><span className="text-sm">Surahs</span>
                      <div className="flex items-center gap-2">
                        <button className="h-7 w-7 rounded-full border" onClick={() => setPlayNextN(Math.max(1, playNextN - 1))} data-testid="mushaf-nextn-minus">-</button>
                        <span className="w-5 text-center text-sm font-semibold" data-testid="mushaf-nextn-value">{playNextN}</span>
                        <button className="h-7 w-7 rounded-full border" onClick={() => setPlayNextN(Math.min(20, playNextN + 1))} data-testid="mushaf-nextn-plus">+</button>
                      </div>
                    </div>
                  )}
                  {scope === "range" && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Select value={String(rangeStart)} onValueChange={(v) => setRangeStart(Number(v))}><SelectTrigger className="h-8" data-testid="mushaf-range-start"><SelectValue /></SelectTrigger><SelectContent className="max-h-56">{surahList.map((s) => <SelectItem key={s.number} value={String(s.number)}>{s.number}. {s.englishName}</SelectItem>)}</SelectContent></Select>
                      <Select value={String(rangeEnd)} onValueChange={(v) => setRangeEnd(Number(v))}><SelectTrigger className="h-8" data-testid="mushaf-range-end"><SelectValue /></SelectTrigger><SelectContent className="max-h-56">{surahList.map((s) => <SelectItem key={s.number} value={String(s.number)}>{s.number}. {s.englishName}</SelectItem>)}</SelectContent></Select>
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                    <span className="flex items-center gap-1.5 text-sm"><Repeat className="h-4 w-4 text-primary" /> Repeat ayah</span>
                    <div className="flex items-center gap-2">
                      <button className="h-7 w-7 rounded-full border" onClick={() => setRepeatEach(Math.max(1, repeatEach - 1))} data-testid="mushaf-repeat-minus">-</button>
                      <span className="w-6 text-center text-sm font-semibold" data-testid="mushaf-repeat-value">{repeatEach}×</span>
                      <button className="h-7 w-7 rounded-full border" onClick={() => setRepeatEach(Math.min(10, repeatEach + 1))} data-testid="mushaf-repeat-plus">+</button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 sm:gap-4">
            <button onClick={() => goToPage(page - 1)} aria-label="Previous page" className={`rounded-full p-2 ${pageColors.muted}`} data-testid="mushaf-audio-prev"><SkipBack className="h-5 w-5" /></button>
            <button onClick={onPlayFab} className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-black" data-testid="mushaf-audio-play">{pagePlaying && isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}</button>
            <button onClick={clear} disabled={!current} className={`rounded-full p-2 ${pageColors.muted} disabled:opacity-35`} data-testid="mushaf-stop-btn" aria-label="Stop playback"><Square className="h-4 w-4 fill-current" /></button>
            <button onClick={() => goToPage(page + 1)} aria-label="Next page" className={`rounded-full p-2 ${pageColors.muted}`} data-testid="mushaf-audio-next"><SkipForward className="h-5 w-5" /></button>
          </div>
        </div>
      )}

      {/* Search sheet */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm" dir="ltr" onClick={(e) => { e.stopPropagation(); setSearchOpen(false); }} data-testid="mushaf-search-sheet">
            <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="absolute inset-x-0 top-0 max-h-[85vh] overflow-y-auto rounded-b-3xl border-b border-white/10 bg-[#0a0a0a] p-4" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center gap-2">
                <Search className="h-4 w-4 text-slate-400" />
                <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search surah or page number…" className="border-white/10 bg-white/5 text-slate-100" data-testid="mushaf-search-input" />
                <button onClick={() => setSearchOpen(false)} className="rounded-full p-2 text-slate-300 hover:bg-white/10"><X className="h-5 w-5" /></button>
              </div>
              {/^\d+$/.test(query.trim()) && Number(query) >= 1 && Number(query) <= 604 && (
                <button onClick={() => { goToPage(Number(query)); setSearchOpen(false); setQuery(""); }} className="mb-2 w-full rounded-xl border border-primary bg-primary/10 px-3 py-2 text-left text-sm text-slate-100" data-testid="mushaf-jump-page">Go to page {query}</button>
              )}
              <div className="space-y-1">
                {filteredSurahs.map((s) => (
                  <button key={s.number} onClick={() => { goToPage(surahStartPage(s.number)); setSearchOpen(false); setQuery(""); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/5" data-testid={`mushaf-search-surah-${s.number}`}>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-primary">{s.number}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm text-slate-100">{s.englishName}</span><span className="block text-[11px] text-slate-400">Page {surahStartPage(s.number)} · {s.numberOfAyahs} verses</span></span>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Double-tap context menu */}
      <AnimatePresence>
        {ctx && (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} style={{ left: Math.min(ctx.x, window.innerWidth - 200), top: Math.min(ctx.y, window.innerHeight - 180) }} className="fixed z-[80] w-48 overflow-hidden rounded-2xl border border-white/10 bg-[#121212] shadow-xl" dir="ltr" onClick={(e) => e.stopPropagation()} data-testid="mushaf-ctx-menu">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-xs text-slate-400"><span>{ctx.ayah.surahName} : {ctx.ayah.numberInSurah}</span><button onClick={() => setCtx(null)} data-testid="mushaf-ctx-close"><X className="h-3.5 w-3.5" /></button></div>
            <button onClick={() => { play(ctx.ayah); setCtx(null); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-100 hover:bg-white/5" data-testid="mushaf-ctx-play"><Play className="h-4 w-4 text-emerald-400" /> Play this ayah</button>
            <Link to={`/surah/${ctx.ayah.surahNumber}/memorize`} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-100 hover:bg-white/5" data-testid="mushaf-ctx-memorize"><Brain className="h-4 w-4 text-emerald-400" /> Memorize surah</Link>
            <Link to={`/surah/${ctx.ayah.surahNumber}`} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-100 hover:bg-white/5" data-testid="mushaf-ctx-open"><Search className="h-4 w-4 text-emerald-400" /> Open in list</Link>
          </motion.div>
        )}
        {tajweedRule && TAJWEED_RULES[tajweedRule] && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-5" onClick={() => setTajweedRule(null)} data-testid="mushaf-tajweed-dialog">
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#171717] p-6 text-left shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center gap-3"><span className="h-4 w-4 rounded-full" style={{backgroundColor: TAJWEED_RULES[tajweedRule].color}} /><h2 className="font-heading text-xl font-semibold text-white">{TAJWEED_RULES[tajweedRule].label}</h2></div>
              <p className="text-sm leading-6 text-slate-300">{TAJWEED_RULES[tajweedRule].desc}</p>
              <button onClick={() => setTajweedRule(null)} className="mt-5 rounded-full bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15" data-testid="mushaf-tajweed-close">Close</button>
            </div>
          </div>
        )}
      </AnimatePresence>

      <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
};

// inline colored tajweed letter
export default MushafReader;
