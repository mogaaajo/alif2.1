import React, { useEffect, useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, Search, SlidersHorizontal, BookOpen, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import { getSurahs } from "@/lib/api";
import { surahStartPage } from "@/lib/mushafPages";

const Home = () => {
  const [surahs, setSurahs] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [atBottom, setAtBottom] = useState(false);
  const [lastPage, setLastPage] = useState(() => Number(localStorage.getItem("alif_last_page") || 0));
  const [lastSurahNum, setLastSurahNum] = useState(() => Number(localStorage.getItem("alif_last_surah") || 0));
  const scrolledRef = useRef(false);

  useEffect(() => {
    getSurahs()
      .then((data) => {
        setSurahs(data);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const trackPosition = () => setAtBottom(window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 120);
    trackPosition(); window.addEventListener("scroll", trackPosition, { passive: true });
    return () => window.removeEventListener("scroll", trackPosition);
  }, []);

  const lastSurah = useMemo(() => {
    if (!surahs.length) return null;
    if (lastSurahNum) return surahs.find((s) => s.number === lastSurahNum) || null;
    return null;
  }, [surahs, lastSurahNum]);

  // Smoothly scroll to active surah card on initial return
  useEffect(() => {
    if (!loading && surahs.length && lastSurahNum && !scrolledRef.current && window.scrollY < 50) {
      scrolledRef.current = true;
      const el = document.querySelector(`[data-testid="surah-card-${lastSurahNum}"]`);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 200);
      }
    }
  }, [loading, surahs, lastSurahNum]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !q ? surahs : surahs.filter((s) => s.englishName.toLowerCase().includes(q) || s.englishNameTranslation.toLowerCase().includes(q) || String(s.number) === q);
  }, [surahs, query]);

  const jump = () => window.scrollTo({ top: atBottom ? 0 : document.documentElement.scrollHeight, behavior: "smooth" });

  return (
    <div className="pb-24">
      <Header title="Alif Quran" subtitle="Choose a surah to begin" />
      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-semibold text-foreground sm:text-4xl">Browse the Qur'an</h1>
            <p className="mt-1 text-sm text-muted-foreground">Read, listen, memorize, or recite from any surah.</p>
          </div>
          <Link to="/explore" data-testid="home-tools-link">
            <Button variant="outline" className="shrink-0 rounded-full">
              <SlidersHorizontal className="mr-2 h-4 w-4" />Tools
            </Button>
          </Link>
        </div>

        {/* Continue Reading / Resume Card */}
        {lastSurah && (
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5 shadow-xs" data-testid="resume-banner">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground font-semibold shadow-xs">
                <BookOpen className="h-5 w-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">Resume Reading</span>
                  {lastPage > 0 && <span className="text-xs text-muted-foreground">• Page {lastPage}</span>}
                </div>
                <p className="font-heading text-lg font-semibold text-foreground">
                  {lastSurah.number}. {lastSurah.englishName}
                  <span className="font-arabic text-base font-normal text-muted-foreground ml-2" dir="rtl">
                    {lastSurah.name.replace("سُورَةُ ", "")}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link to={`/mushaf/${lastPage || surahStartPage(lastSurah.number)}`}>
                <Button size="sm" className="rounded-full px-4" data-testid="resume-mushaf-btn">
                  Mushaf Page {lastPage || surahStartPage(lastSurah.number)}
                </Button>
              </Link>
              <Link to={`/surah/${lastSurah.number}`}>
                <Button size="sm" variant="outline" className="rounded-full px-4" data-testid="resume-focus-btn">
                  Focus Mode
                </Button>
              </Link>
            </div>
          </div>
        )}

        <div className="relative mb-6">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a surah or number" className="h-11 pl-9" data-testid="surah-search-input" />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl border border-border bg-muted/50" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="surah-grid">
            {filtered.map((s) => {
              const isLastRead = s.number === lastSurahNum;
              return (
                <Link
                  key={s.number}
                  to={`/mushaf/${surahStartPage(s.number)}`}
                  data-testid={`surah-card-${s.number}`}
                  className={`group flex items-center gap-3 rounded-2xl border p-3.5 transition-all hover:border-primary/40 hover:bg-accent/35 ${
                    isLastRead
                      ? "border-primary/40 bg-primary/5 shadow-xs"
                      : "border-border bg-card"
                  }`}
                >
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center">
                    <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full text-primary/25">
                      <path fill="currentColor" d="M20 1l4.9 3.3 5.9-.3 1.9 5.6 4.8 3.4-2 5.6 2 5.6-4.8 3.4-1.9 5.6-5.9-.3L20 39l-4.9-3.3-5.9.3-1.9-5.6L2.5 27l2-5.6-2-5.6 4.8-3.4 1.9-5.6 5.9.3z" />
                    </svg>
                    <span className="relative text-sm font-bold text-primary">{s.number}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-foreground">
                      {s.englishName}
                      {isLastRead && <span className="ml-1.5 text-[10px] text-primary font-normal">• last read</span>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{s.englishNameTranslation} · {s.numberOfAyahs} ayahs</span>
                  </span>
                  <span className="font-arabic text-xl text-foreground/80" dir="rtl">{s.name.replace("سُورَةُ ", "")}</span>
                </Link>
              );
            })}
          </div>
        )}
      </main>
      <button
        type="button"
        onClick={jump}
        className="fixed bottom-24 right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg sm:bottom-6"
        data-testid="home-scroll-toggle"
        aria-label={atBottom ? "Back to top" : "Jump to end"}
      >
        {atBottom ? <ArrowUp className="h-5 w-5" /> : <ArrowDown className="h-5 w-5" />}
      </button>
    </div>
  );
};

export default Home;
