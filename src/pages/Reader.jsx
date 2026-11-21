import { playbackStart } from "@/lib/practiceSession";
import React, { useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Play, Pause, Settings, Palette, Users, Brain, BookOpen, Repeat, ChevronDown, Loader2, LocateFixed, Menu, Search, X, Home, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/context/SettingsContext";
import { usePlayback } from "@/context/PlaybackContext";
import { getSurah, getSurahs, getTajweed, getJuzAudio } from "@/lib/api";
import { appendAyahWithBasmala } from "@/lib/basmala";
import { TAJWEED_RULES } from "@/lib/tajweed";
import { surahStartPage } from "@/lib/mushafPages";
import AyahReader from "@/components/AyahReader";
import MushafView from "@/components/MushafView";
import SettingsDrawer from "@/components/SettingsDrawer";
import ReaderHeader from "@/components/ReaderHeader";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const SCOPES = [
  { id: "single", label: "This surah only" },
  { id: "nextN", label: "Next N surahs" },
  { id: "range", label: "Range of surahs" },
  { id: "juz", label: "Full Juz" },
];

const Reader = () => {
  const { number } = useParams();
  const navigate = useNavigate();
  const {
    theme,
    toggleTheme,
    reciter,
    setReciter,
    reciters,
    translation,
    arabicSize,
    readingMode,
    setReadingMode,
    playScope,
    setPlayScope,
    playNextN,
    setPlayNextN,
    repeatEach,
    setRepeatEach,
    tajweedOn,
    setTajweedOn,
  } = useSettings();
  const { current, isPlaying, playQueue, toggle } = usePlayback();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retryLoad, setRetryLoad] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusMenuOpen, setFocusMenuOpen] = useState(false);
  const [surahPickerOpen, setSurahPickerOpen] = useState(false);
  const [surahQuery, setSurahQuery] = useState("");
  const [showTajweed, setShowTajweed] = useState(false);
  const [tajweedMap, setTajweedMap] = useState(null);
  const [activeRule, setActiveRule] = useState(null);
  const [building, setBuilding] = useState(false);
  const [surahList, setSurahList] = useState([]);
  const [rangeStart, setRangeStart] = useState(Number(number));
  const [rangeEnd, setRangeEnd] = useState(Math.min(114, Number(number) + 2));
  const basmalaCacheRef = useRef({});

  const surah = data?.surah;
  const ayahs = data?.ayahs || [];
  const surahNum = Number(number);
  const juzOfSurah = ayahs[0]?.juz || 1;

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

  useEffect(() => {
    let active = true;
    setLoadError(""); setData(null);
    setLoading(true);
    setTajweedMap(null);
    setShowTajweed(false);
    setRangeStart(Number(number));
    setRangeEnd(Math.min(114, Number(number) + 2));
    getSurah(number, reciter, translation)
      .then((result) => { if (active) setData(result); })
      .catch(() => { if (active) setLoadError("Could not load this surah."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [number, reciter, translation, retryLoad]);

  useEffect(() => {
    getSurahs().then(setSurahList).catch(() => {});
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("alif_last_surah", String(number));
      if (ayahs[0]?.page) localStorage.setItem("alif_last_page", String(ayahs[0].page));
    } catch {}
  }, [number, ayahs]);

  useEffect(() => {
    if (tajweedOn) {
      getTajweed(number)
        .then((res) => {
          const map = {};
          res.ayahs.forEach((a) => (map[a.numberInSurah] = a.segments));
          setTajweedMap(map);
          setShowTajweed(true);
        })
        .catch(() => setShowTajweed(false));
    } else {
      setShowTajweed(false);
    }
  }, [tajweedOn, number]);

  const toggleTajweed = async (checked) => {
    setTajweedOn(checked);
  };

  const normalizedSurahQuery = (surahQuery || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const filteredSurahs = surahList.filter((item) => {
    const haystack = `${item.number} ${item.englishName} ${item.englishNameTranslation || ""}`.toLowerCase().replace(/[^a-z0-9]/g, "");
    return !normalizedSurahQuery || haystack.includes(normalizedSurahQuery);
  });

  const currentIndex =
    current && current.surahNumber === surahNum
      ? ayahs.findIndex((a) => a.numberInSurah === current.numberInSurah)
      : -1;

  const buildQueue = async () => {
    const items = [];
    const basmalaAudio = await getBasmalaUrl();
    const push = (num, name, ays) => {
      ays.forEach((a) => appendAyahWithBasmala(items, {
        ayah: a,
        surahNumber: num,
        surahName: name,
        basmalaAudio,
      }));
    };

    if (playScope === "single") {
      push(surahNum, surah.englishName, ayahs);
      return { items, label: surah.englishName };
    }
    if (playScope === "nextN") {
      const end = Math.min(114, surahNum + Math.max(1, playNextN) - 1);
      push(surahNum, surah.englishName, ayahs);
      const nums = [];
      for (let n = surahNum + 1; n <= end; n++) nums.push(n);
      const results = await Promise.all(nums.map((n) => getSurah(n, reciter, translation)));
      results.forEach((d, i) => push(nums[i], d.surah.englishName, d.ayahs));
      return { items, label: `Next ${playNextN} surahs` };
    }
    if (playScope === "range") {
      const s = Math.min(rangeStart, rangeEnd);
      const e = Math.max(rangeStart, rangeEnd);
      const nums = [];
      for (let n = s; n <= e; n++) nums.push(n);
      const results = await Promise.all(
        nums.map((n) => (n === surahNum ? Promise.resolve(null) : getSurah(n, reciter, translation)))
      );
      results.forEach((d, i) => {
        const n = nums[i];
        if (n === surahNum) push(n, surah.englishName, ayahs);
        else push(n, d.surah.englishName, d.ayahs);
      });
      return { items, label: `Surahs ${s}–${e}` };
    }
    // juz — flat list of ayahs with audio
    const jd = await getJuzAudio(juzOfSurah, reciter, translation);
    jd.ayahs.forEach((a) => push(a.surahNumber, a.surahName, [a]));
    return { items, label: `Juz ${juzOfSurah}` };
  };

  const startPlayback = async (startNum) => {
    if (!ayahs.length) return;
    setBuilding(true);
    try {
      const { items, label } = await buildQueue();
      let startIndex = 0;
      if (startNum) {
        startIndex = playbackStart(items, surahNum, startNum);
      }
      playQueue(items, startIndex, label);
    } finally {
      setBuilding(false);
    }
  };

  const playAyah = (index) => {
    const num = ayahs[index].numberInSurah;
    if (current && current.surahNumber === surahNum && current.numberInSurah === num) toggle();
    else startPlayback(num);
  };

  const onPlaySurah = () => {
    if (current && current.surahNumber === surahNum) toggle();
    else startPlayback();
  };

  const surahPlayingHere = current && current.surahNumber === surahNum;

  const scrollToCurrent = () => {
    if (currentIndex < 0) return;
    const num = ayahs[currentIndex]?.numberInSurah;
    const sel = readingMode === "mushaf" ? `[data-testid="mushaf-ayah-${num}"]` : `[data-testid="ayah-row-${num}"]`;
    const el = document.querySelector(sel);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // auto-follow: scroll the reciting ayah into view when it changes / after a page-follow
  useEffect(() => {
    if (currentIndex < 0 || loading) return;
    const t = setTimeout(scrollToCurrent, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, loading, readingMode]);

  return (
    <div className="pb-28">
      {surahPlayingHere && currentIndex >= 0 && (
        <button
          onClick={scrollToCurrent}
          className="fixed bottom-24 right-5 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105"
          data-testid="jump-to-current-btn"
        >
          <LocateFixed className="h-4 w-4" /> Now reciting
        </button>
      )}
      <ReaderHeader
        currentMode="focus"
        page={ayahs[0]?.page || surahStartPage(surahNum)}
        surahNumber={surahNum}
        surahName={surah ? surah.englishName : ""}
        juz={juzOfSurah}
        onPrevPage={() => {
          const p = Math.max(1, surahNum - 1);
          navigate(`/surah/${p}`);
        }}
        onNextPage={() => {
          const n = Math.min(114, surahNum + 1);
          navigate(`/surah/${n}`);
        }}
        onOpenSearch={() => setSurahPickerOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
        visible={true}
      />

      <main className="mx-auto max-w-3xl px-4 pt-24 pb-12 sm:pt-28 sm:px-8">
        {surah && readingMode !== "mushaf" && ![1, 9].includes(surahNum) && (
          <p className="font-arabic mb-8 text-center text-3xl leading-loose text-foreground" dir="rtl">
            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
          </p>
        )}

        {!loading && ayahs.length > 0 && (
          <div className="sticky top-[86px] z-30 -mx-4 mb-6 border-y border-border bg-background/95 px-4 py-3 backdrop-blur sm:top-[92px] sm:-mx-8 sm:px-8">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-2">
              {/* Play + scope */}
              <div className="flex items-center overflow-hidden rounded-full border border-primary bg-primary text-primary-foreground">
                <button
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-70"
                  onClick={onPlaySurah}
                  disabled={building}
                  data-testid="play-surah-btn"
                >
                  {building ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : surahPlayingHere && isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Play
                </button>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className="flex items-center gap-1 border-l border-primary-foreground/30 px-3 py-2.5 text-xs font-medium hover:bg-primary/90"
                      data-testid="play-scope-btn"
                    >
                      {SCOPES.find((s) => s.id === playScope)?.label || "Scope"}
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="bottom" align="end" className="w-72" data-testid="play-scope-panel">
                    <p className="mb-3 text-sm font-semibold text-foreground">Continuous play</p>
                    <div className="space-y-2">
                      {SCOPES.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setPlayScope(s.id)}
                          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                            playScope === s.id ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground"
                          }`}
                          data-testid={`scope-${s.id}`}
                        >
                          {s.label}
                          {s.id === "juz" && <span className="text-xs text-muted-foreground">Juz {juzOfSurah}</span>}
                        </button>
                      ))}
                    </div>

                    {playScope === "nextN" && (
                      <div className="mt-4 flex items-center justify-between">
                        <Label className="text-sm">Surahs to play</Label>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => setPlayNextN(Math.max(1, playNextN - 1))} data-testid="nextn-minus">-</Button>
                          <span className="w-6 text-center text-sm font-semibold" data-testid="nextn-value">{playNextN}</span>
                          <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => setPlayNextN(Math.min(20, playNextN + 1))} data-testid="nextn-plus">+</Button>
                        </div>
                      </div>
                    )}

                    {playScope === "range" && (
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">From</Label>
                          <Select value={String(rangeStart)} onValueChange={(v) => setRangeStart(Number(v))}>
                            <SelectTrigger className="mt-1 h-9" data-testid="range-start-select"><SelectValue /></SelectTrigger>
                            <SelectContent className="max-h-64">
                              {surahList.map((s) => (
                                <SelectItem key={s.number} value={String(s.number)}>{s.number}. {s.englishName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">To</Label>
                          <Select value={String(rangeEnd)} onValueChange={(v) => setRangeEnd(Number(v))}>
                            <SelectTrigger className="mt-1 h-9" data-testid="range-end-select"><SelectValue /></SelectTrigger>
                            <SelectContent className="max-h-64">
                              {surahList.map((s) => (
                                <SelectItem key={s.number} value={String(s.number)}>{s.number}. {s.englishName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                      <Label className="flex items-center gap-2 text-sm"><Repeat className="h-4 w-4 text-primary" /> Repeat each ayah</Label>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => setRepeatEach(Math.max(1, repeatEach - 1))} data-testid="repeat-minus">-</Button>
                        <span className="w-6 text-center text-sm font-semibold" data-testid="repeat-value">{repeatEach}×</span>
                        <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => setRepeatEach(Math.min(10, repeatEach + 1))} data-testid="repeat-plus">+</Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <Select value={reciter} onValueChange={setReciter}>
                <SelectTrigger className="h-10 min-w-[160px] rounded-full" data-testid="focus-reciter-select"><Volume2 className="mr-1 h-4 w-4 shrink-0 text-primary" /><SelectValue placeholder="Choose reciter" /></SelectTrigger>
                <SelectContent className="max-h-72">{reciters.map((r) => <SelectItem key={r.identifier} value={r.identifier}>{r.englishName}</SelectItem>)}</SelectContent>
              </Select>

            </div>
          </div>
        )}

        {loadError ? <div role="alert" className="p-6 text-center">{loadError}<button className="ml-3 underline" onClick={() => setRetryLoad((n) => n + 1)}>Retry</button></div> : loading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl border border-border bg-muted/40" />
            ))}
          </div>
        ) : readingMode === "mushaf" ? (
          <MushafView
            ayahs={ayahs}
            surah={surah}
            surahNumber={surahNum}
            arabicSize={arabicSize}
            currentIndex={currentIndex}
            onPlay={playAyah}
          />
        ) : (
          <div className="space-y-5" data-testid="ayah-list">
            {ayahs.map((a, i) => (
              <AyahReader
                key={a.numberInSurah}
                ayah={a}
                index={i}
                surahName={surah?.englishName}
                arabicSize={arabicSize}
                isActive={currentIndex === i}
                isPlaying={isPlaying}
                onPlay={playAyah}
                showTajweed={showTajweed}
                tajweedSegments={tajweedMap ? tajweedMap[a.numberInSurah] : null}
                surahNumber={surahNum}
                onRuleClick={(rule) => setActiveRule(rule)}
              />
            ))}
          </div>
        )}
      </main>

      {surahPickerOpen && (
        <div className="fixed inset-0 z-[70] bg-black/45 p-4 backdrop-blur-sm" onClick={() => setSurahPickerOpen(false)} data-testid="focus-surah-picker-sheet">
          <section className="mx-auto max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border bg-card p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" />
              <Input autoFocus value={surahQuery} onChange={(event) => setSurahQuery(event.target.value)} placeholder="Search a surah or number…" data-testid="focus-surah-search-input" />
              <Button variant="ghost" size="icon" className="shrink-0 rounded-full" onClick={() => setSurahPickerOpen(false)} aria-label="Close surah picker"><X className="h-5 w-5" /></Button>
            </div>
            <div className="space-y-1">
              {filteredSurahs.map((item) => (
                <Link key={item.number} to={`/surah/${item.number}`} onClick={() => { setSurahPickerOpen(false); setSurahQuery(""); }} className="flex items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-muted" data-testid={`focus-surah-${item.number}`}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{item.number}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.englishName}</span><span className="block text-[11px] text-muted-foreground">{item.englishNameTranslation} · {item.numberOfAyahs} ayahs</span></span>
                  <span className="font-arabic text-xl text-foreground" dir="rtl">{item.name}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}

      <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} />

      <Dialog open={!!activeRule} onOpenChange={(o) => !o && setActiveRule(null)}>
        <DialogContent className="max-w-sm" data-testid="tajweed-rule-dialog">
          {activeRule && TAJWEED_RULES[activeRule] && (
            <DialogHeader className="text-left">
              <span
                className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-primary-foreground"
                style={{ backgroundColor: TAJWEED_RULES[activeRule].color }}
              >
                <span className="font-arabic text-lg">ت</span>
              </span>
              <DialogTitle className="font-heading text-2xl" style={{ color: TAJWEED_RULES[activeRule].color }}>
                {TAJWEED_RULES[activeRule].label}
              </DialogTitle>
              <DialogDescription className="text-base leading-relaxed text-foreground">
                {TAJWEED_RULES[activeRule].desc}
              </DialogDescription>
            </DialogHeader>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Reader;
