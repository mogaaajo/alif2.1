import { ayahKey, practiceDetails } from "@/lib/practiceSession";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Mic, MicOff, Eye, EyeOff, Volume2, PartyPopper, RotateCcw, Sparkles, AlertTriangle, Moon, Sun, BookOpen, List, Users, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useSettings } from "@/context/SettingsContext";
import { getSurah, getPageAudio, logPracticeActivity } from "@/lib/api";
import { getUserId } from "@/lib/user";
import PracticeMushafPage from "@/components/PracticeMushafPage";
import PracticeScopePicker from "@/components/PracticeScopePicker";
import { normalizeAr, initialPosition, createRecognitionSession } from "@/lib/recitationTracker.mjs";
import { surahStartPage } from "@/lib/mushafPages";

const toArabicNum = (n) => String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);
const letterCount = (w = "") => normalizeAr(w).replace(/\s/g, "").length || w.length;
const EMPTY_AYAHS = [];

const MemorizeReveal = () => {
  const { number } = useParams();
  const { reciter, translation, arabicSize, theme, toggleTheme } = useSettings();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageAyahs, setPageAyahs] = useState([]);
  const [pageLoading, setPageLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [retryLoad, setRetryLoad] = useState(0);
  const [retryPage, setRetryPage] = useState(0);
  const assistedRef = useRef(false);
  const [revealed, setRevealed] = useState(0); // words revealed across the whole surah
  const [cursor, setCursor] = useState(0);
  const [recognitionStatus, setRecognitionStatus] = useState("idle");
  const [recognitionError, setRecognitionError] = useState("");
  const receivedSpeechRef = useRef(false);
  const positionRef = useRef(initialPosition());
  const retryRef = useRef(null);
  const failuresRef = useRef(0);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [micLevel, setMicLevel] = useState(0);
  const [noSound, setNoSound] = useState(false);
  const [heard, setHeard] = useState(""); // transcript token not yet aligned
  const [hintLen, setHintLen] = useState(0); // letters of current word revealed as a hint
  const [practiceView, setPracticeView] = useState("page");
  const [practiceScope, setPracticeScope] = useState("surah");
  const [scopeStart, setScopeStart] = useState(1);
  const [scopeEnd, setScopeEnd] = useState(1);

  const recRef = useRef(null);
  const listeningRef = useRef(false);
  const genRef = useRef(0);
  const audioRef = useRef(null);
  const wordsRef = useRef([]);
  const revealedRef = useRef(0);
  const lastProgressRef = useRef(Date.now());
  const streamRef = useRef(null);
  const acRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const completionLoggedRef = useRef(false);

  const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    if (!SR) setSpeechSupported(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    stopListening();
    audioRef.current?.pause();
    setData(null);
    setLoadError("");
    completionLoggedRef.current = false;
    assistedRef.current = false;
    setLoading(true);
    positionRef.current = initialPosition();
    setCursor(0);
    setRevealed(0);
    setPracticeScope("surah");
    setScopeStart(1);
    setScopeEnd(1);
    getSurah(number, reciter, translation)
      .then((result) => { if (active) setData(result); })
      .catch(() => { if (active) setLoadError("Could not load this surah."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Reset only when the requested content changes, not on recognition updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [number, reciter, translation, retryLoad]);

  useEffect(() => {
    if (practiceScope !== "page") return;
    let active = true;
    setPageAyahs([]); setPageLoading(true); setLoadError("");
    getPageAudio(scopeStart, reciter, translation).then((result) => { if (active) setPageAyahs(result.ayahs); })
      .catch(() => { if (active) setLoadError("Could not load this practice page."); })
      .finally(() => { if (active) setPageLoading(false); });
    return () => { active = false; };
  }, [practiceScope, scopeStart, reciter, translation, retryPage]);

  const sourceAyahs = data?.ayahs || EMPTY_AYAHS;
  const ayahs = useMemo(() => {
    if (practiceScope === "page") return pageAyahs;
    if (practiceScope === "range") {
      const start = Math.min(scopeStart, scopeEnd);
      const end = Math.max(scopeStart, scopeEnd);
      return sourceAyahs.filter((ayah) => ayah.numberInSurah >= start && ayah.numberInSurah <= end);
    }
    if (practiceScope === "five") {
      const startIndex = Math.max(0, sourceAyahs.findIndex((ayah) => ayah.numberInSurah === scopeStart));
      return sourceAyahs.slice(startIndex, startIndex + 5);
    }
    return sourceAyahs;
  }, [sourceAyahs, pageAyahs, practiceScope, scopeStart, scopeEnd]);

  // flat list of words across the whole surah
  const allWords = useMemo(() => {
    const list = [];
    ayahs.forEach((a, ai) => {
      const ws = (a.arabic || "").trim().split(/\s+/).filter(Boolean);
      ws.forEach((w, wi) => list.push({ gi: list.length, text: w, ai, wi, ayahNumber: a.numberInSurah, ayahKey: ayahKey(a, number), isLast: wi === ws.length - 1 }));
    });
    return list;
  }, [ayahs, number]);

  useEffect(() => {
    wordsRef.current = allWords;
  }, [allWords]);
  useEffect(() => {
    revealedRef.current = revealed;
  }, [revealed]);

  const done = allWords.length > 0 && revealed >= allWords.length;
  const surah = data?.surah;
  const currentWord = allWords[Math.min(revealed, Math.max(0, allWords.length - 1))];
  const activeAyah = ayahs[currentWord?.ai ?? 0];
  const revealedAyahs = useMemo(() => {
    const complete = new Set();
    allWords.forEach((word) => {
      if (word.isLast && word.gi < revealed) complete.add(word.ayahKey);
    });
    return complete;
  }, [allWords, revealed]);

  const bumpProgress = () => {
    lastProgressRef.current = Date.now();
    setHintLen(0);
    setHeard("");
  };

  // ---- mic level meter (separate stream) + stuck-hint driver ----
  const startMeter = async () => {
    const generation = genRef.current;
    try {
      if (!streamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (generation !== genRef.current || !listeningRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!acRef.current) {
        acRef.current = new AC();
        const src = acRef.current.createMediaStreamSource(streamRef.current);
        const an = acRef.current.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        analyserRef.current = an;
      }
      if (acRef.current.state === "suspended") acRef.current.resume();
      const buf = new Uint8Array(analyserRef.current.fftSize);
      let silenceSince = Date.now();
      let lastHint = Date.now();
      const tick = () => {
        if (!listeningRef.current || generation !== genRef.current) return;
        analyserRef.current.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / buf.length);
        setMicLevel(rms);
        const now = Date.now();
        if (rms > 0.02) silenceSince = now;
        setNoSound(now - silenceSince > 3000);
        // stuck-hint: speaking but no progress → reveal current word letters one at a time
        const cur = wordsRef.current[positionRef.current.cursor]?.text;
        if (receivedSpeechRef.current && cur && positionRef.current.cursor >= positionRef.current.revealed && rms > 0.02 && now - lastProgressRef.current > 2200 && now - lastHint > 800) {
          lastHint = now;
          assistedRef.current = true;
          setHintLen((h) => Math.min(cur.length, h + 1));
        }
        rafRef.current = setTimeout(tick, 150);
      };
      rafRef.current = setTimeout(tick, 150);
    } catch {
      /* meter unavailable */
    }
  };

  const stopMeter = () => {
    if (rafRef.current) { clearTimeout(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (acRef.current) { acRef.current.close().catch(() => {}); acRef.current = null; analyserRef.current = null; }
    setMicLevel(0);
    setNoSound(false);
  };

  // ---- speech recognition (generation-guarded, self-recovering) ----
  const stopListening = () => {
    listeningRef.current = false;
    setListening(false);
    setRecognitionStatus("idle");
    setHintLen(0);
    clearTimeout(retryRef.current);
    genRef.current++;
    if (recRef.current) {
      try { recRef.current.onend = null; recRef.current.onresult = null; recRef.current.abort(); } catch {}
      recRef.current = null;
    }
    stopMeter();
  };

  const spawnRecognition = () => {
    if (!SR) { setSpeechSupported(false); return; }
    const myGen = genRef.current;
    const consume = createRecognitionSession(wordsRef.current, positionRef.current);
    let endedForSilence = false;
    let rec;
    try { rec = new SR(); } catch { stopListening(); setSpeechSupported(false); return; }
    rec.lang = "ar-SA";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onstart = () => {
      if (myGen === genRef.current) setRecognitionStatus("listening");
    };
    rec.onresult = (e) => {
      if (myGen !== genRef.current || !listeningRef.current) return;
      failuresRef.current = 0;
      receivedSpeechRef.current = true;
      setRecognitionError("");
      setRecognitionStatus("listening");
      const { committed, preview } = consume(e.results);
      if (committed.cursor !== positionRef.current.cursor) bumpProgress();
      positionRef.current = committed;
      revealedRef.current = committed.revealed;
      setRevealed(committed.revealed);
      setCursor(preview.cursor);
      setHeard(preview.heard);
    };
    rec.onerror = (ev) => {
      if (myGen !== genRef.current) return;
      if (ev.error === "no-speech") {
        endedForSilence = true;
        return;
      }
      if (ev.error === "network") {
        stopListening();
        setRecognitionError("Speech service connection failed (network). If you are using an in-app browser, copy this page's address into Google Chrome and allow the microphone there. If Chrome also fails, check your internet connection and try again.");
        return;
      }
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed" || ev.error === "audio-capture") {
        stopListening();
        setRecognitionError(ev.error === "audio-capture"
          ? "The microphone could not be opened. Check your microphone connection and selected input, then try again."
          : "Microphone or speech-service access was denied. Allow microphone access in your browser, then try again.");
        return;
      }
      stopListening();
      setRecognitionError(`Speech recognition stopped (${ev.error || "unknown error"}). Try again or use the manual reveal buttons.`);
    };
    rec.onend = () => {
      if (myGen !== genRef.current || !listeningRef.current) return;
      rec.onresult = null;
      rec.onstart = null;
      rec.onerror = null;
      rec.onend = null;
      if (!endedForSilence) failuresRef.current++;
      if (failuresRef.current > 5) {
        stopListening();
        setRecognitionError("Speech recognition repeatedly ended without results. Try this page in Google Chrome outside the in-app browser, then tap the mic to reconnect.");
        return;
      }
      setRecognitionStatus("reconnecting");
      retryRef.current = setTimeout(() => { if (myGen === genRef.current && listeningRef.current) spawnRecognition(); }, endedForSilence ? 1000 : Math.min(2000, 250 * failuresRef.current));
    };
    recRef.current = rec;
    try { rec.start(); } catch { rec.onend(); }
  };

  const startListening = () => {
    audioRef.current?.pause();
    if (!SR) { setSpeechSupported(false); return; }
    genRef.current++;
    failuresRef.current = 0;
    receivedSpeechRef.current = false;
    setRecognitionError("");
    setRecognitionStatus("connecting");
    listeningRef.current = true;
    setListening(true);
    bumpProgress();
    spawnRecognition();
    startMeter();
  };

  const toggleListening = () => (listening ? stopListening() : startListening());

  useEffect(() => () => stopListening(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // auto-scroll the current word into view
  useEffect(() => {
    if (loading) return;
    const el = document.querySelector(`[data-testid="reveal-current"]`) || document.querySelector(`[data-testid="reveal-word-${revealed - 1}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [revealed, loading]);

  useEffect(() => {
    if (done) stopListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  useEffect(() => {
    if (!done || completionLoggedRef.current || !surah) return;
    completionLoggedRef.current = true;
    if (typeof logPracticeActivity === "function") logPracticeActivity({ user_id: getUserId(), surah_number: Number(number), surah_name: surah.englishName, kind: assistedRef.current ? "assisted_practice" : "memorize", ...practiceDetails(ayahs, Number(number), practiceScope, assistedRef.current) }).catch(() => {});
  }, [done, number, surah, ayahs, practiceScope]);

  const listen = () => {
    stopListening();
    assistedRef.current = true;
    // play the current ayah audio as a reminder
    const w = allWords[Math.min(revealed, allWords.length - 1)];
    const ay = ayahs[w?.ai ?? 0];
    const el = audioRef.current;
    if (el && ay?.audio) { el.src = ay.audio; el.currentTime = 0; el.play().catch(() => {}); }
  };

  const setManualPosition = (value) => {
    if (value > positionRef.current.revealed) assistedRef.current = true;
    if (value === 0) { assistedRef.current = false; completionLoggedRef.current = false; }
    const resume = listeningRef.current;
    stopListening();
    positionRef.current = initialPosition(value);
    revealedRef.current = value;
    setRevealed(value);
    setCursor(value);
    bumpProgress();
    if (resume && value < allWords.length) startListening();
  };
  const restart = () => { stopListening(); setManualPosition(0); };

  const changeScope = (next) => {
    stopListening();
    setPracticeScope(next);
    setPracticeView(next === "page" ? "page" : "focus");
    setManualPosition(0);
  };
  const changeScopeStart = (next) => { stopListening(); setScopeStart(next); setManualPosition(0); };
  const changeScopeEnd = (next) => { stopListening(); setScopeEnd(next); setManualPosition(0); };

  const curPage = data?.ayahs?.[0]?.page || surahStartPage(Number(number));

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-40 glass border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-3.5 sm:px-8">
          <Link to={`/surah/${number}`} data-testid="memorize-back-btn">
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-xl sm:text-2xl font-semibold text-foreground">
              Memorize {surah ? `· ${surah.englishName}` : ""}
            </p>
            <p className="text-xs text-muted-foreground truncate">Recite and watch the page fill in</p>
          </div>
          <Button variant="outline" size="icon" className="rounded-full" onClick={toggleTheme} aria-label="Toggle theme" data-testid="memorize-theme-toggle">
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>

        {/* Subtle segmented mode switcher directly below */}
        <div className="flex items-center justify-center border-t border-border/30 bg-background/50 px-3 py-1 sm:py-1.5">
          <nav className="inline-flex max-w-full items-center gap-0.5 sm:gap-1 rounded-xl bg-black/5 dark:bg-white/10 p-0.5 sm:p-1 text-xs" data-testid="memorize-mode-bar">
            <Link
              to={`/mushaf/${curPage}`}
              className="flex items-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-3 py-1 text-[11px] sm:text-xs text-muted-foreground hover:text-foreground transition-all"
            >
              <BookOpen className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>Mushaf</span>
            </Link>
            <Link
              to={`/surah/${number}`}
              className="flex items-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-3 py-1 text-[11px] sm:text-xs text-muted-foreground hover:text-foreground transition-all"
            >
              <List className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>Focus</span>
            </Link>
            <Link
              to={`/mushaf/${curPage}?mode=along`}
              className="flex items-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-3 py-1 text-[11px] sm:text-xs text-muted-foreground hover:text-foreground transition-all"
            >
              <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>Recite Along</span>
            </Link>
            <span className="flex items-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-3 py-1 text-[11px] sm:text-xs bg-background shadow-xs font-semibold text-primary transition-all">
              <Brain className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>Memorize</span>
            </span>
          </nav>
        </div>
      </header>

      <audio ref={audioRef} className="hidden" />

      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        {loadError ? <div role="alert">{loadError}<button className="ml-3 underline" onClick={() => practiceScope === "page" ? setRetryPage((n) => n + 1) : setRetryLoad((n) => n + 1)}>Retry</button></div> : loading || (practiceScope === "page" && pageLoading) ? (
          <div className="h-64 animate-pulse rounded-2xl border border-border bg-muted/40" />
        ) : done ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center" data-testid="memorize-done">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <PartyPopper className="h-8 w-8" />
            </span>
            <p className="font-heading text-3xl font-semibold text-foreground">{assistedRef.current ? "Assisted practice complete" : "Recitation practice complete"}</p>
            <p className="max-w-sm text-sm text-muted-foreground">You completed your {practiceScope === "surah" ? "surah" : "selected"} practice in {surah?.englishName}. Keep it in your heart.</p>
            <div className="mt-2 flex gap-3">
              <Button className="rounded-full px-6" onClick={restart} data-testid="memorize-restart-btn">
                <RotateCcw className="mr-2 h-4 w-4" /> Start Over
              </Button>
              <Link to={`/surah/${number}`}>
                <Button variant="outline" className="rounded-full px-6">Back to Reader</Button>
              </Link>
            </div>
          </div>
        ) : (
          <div data-testid="memorize-session">
            <div className="mb-5">
              <PracticeScopePicker ayahs={sourceAyahs} value={practiceScope} onValueChange={changeScope} start={scopeStart} onStartChange={changeScopeStart} end={scopeEnd} onEndChange={changeScopeEnd} testid="memorize" />
            </div>
            <div className="mb-6">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>{surah?.englishName}</span>
                <span>{revealed} / {allWords.length} words</span>
              </div>
              <Progress value={allWords.length ? (revealed / allWords.length) * 100 : 0} className="h-1.5" />
            </div>

            <div className="mb-4 flex justify-center gap-2" data-testid="memorize-view-toggle">
              <Button size="sm" variant={practiceView === "page" ? "default" : "outline"} className="rounded-full" onClick={() => setPracticeView("page")} data-testid="memorize-view-page">Full page</Button>
              <Button size="sm" variant={practiceView === "focus" ? "default" : "outline"} className="rounded-full" onClick={() => setPracticeView("focus")} data-testid="memorize-view-focus">Focus</Button>
            </div>

            {practiceView === "page" ? (
              <PracticeMushafPage
                page={activeAyah?.page || ayahs[0]?.page || 1}
                reciter={reciter}
                translation={translation}
                activeSurah={activeAyah?.surahNumber ?? Number(number)}
                practiceKeys={new Set(ayahs.map((ayah) => ayahKey(ayah, number)))}
                activeAyah={activeAyah?.numberInSurah}
                concealSurah
                revealedAyahs={revealedAyahs}
              />
            ) : (
            <div className="rounded-2xl border border-border bg-card px-5 py-10 sm:px-10" data-testid="reveal-card">
              {surah && ![1, 9].includes(Number(number)) && (
                <p className="font-arabic mb-6 text-center text-2xl leading-loose text-foreground/80" dir="rtl">
                  بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                </p>
              )}
              <p className="font-arabic text-right text-foreground" dir="rtl" style={{ fontSize: `${arabicSize}px`, lineHeight: 2.4, direction: "rtl", unicodeBidi: "plaintext", textAlign: "right" }} data-testid="reveal-text">
                {allWords.map((w) => {
                  const gi = w.gi;
                  const isCurrent = gi === revealed;
                  const isTracked = listening && gi === Math.max(0, cursor - 1);
                  const isShown = gi < revealed;
                  return (
                    <React.Fragment key={gi}>
                      {isShown ? (
                        <motion.span initial={{ opacity: 0, filter: "blur(6px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} transition={{ duration: 0.3 }} className={`text-emerald-600 dark:text-emerald-400 ${isTracked ? "rounded bg-primary/20" : ""}`} data-testid={`reveal-word-${gi}`}>
                          {w.text}
                        </motion.span>
                      ) : isCurrent ? (
                        <span data-testid="reveal-current">
                          {hintLen > 0 && (
                            <>
                              <span className="text-amber-600 dark:text-amber-400">{w.text.slice(0, hintLen)}</span>
                              {hintLen < w.text.length && <span className="text-red-600 dark:text-red-400">{w.text.slice(hintLen, hintLen + 1)}</span>}
                            </>
                          )}
                          <span className="select-none tracking-widest text-muted-foreground/40">
                            {"\u00B7".repeat(Math.max(2, letterCount(w.text) - hintLen))}
                          </span>
                        </span>
                      ) : (
                        <span className="select-none tracking-widest text-muted-foreground/30" data-testid={`reveal-placeholder-${gi}`}>
                          {"\u00B7".repeat(Math.max(2, letterCount(w.text)))}
                        </span>
                      )}
                      {w.isLast && (
                        <span className="mx-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-primary/40 bg-card align-middle font-sans text-[11px] font-semibold text-primary">
                          {toArabicNum(w.ayahNumber)}
                        </span>
                      )}{" "}
                    </React.Fragment>
                  );
                })}
              </p>
            </div>
            )}

            {/* Recite controls */}
            <div className="mt-8 flex flex-col items-center gap-4">
              {recognitionError && (
                <p role="alert" className="max-w-lg rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200" data-testid="recognition-error">
                  {recognitionError}
                </p>
              )}
              {speechSupported ? (
                <>
                  <button
                    onClick={toggleListening}
                    className={`flex h-16 w-16 items-center justify-center rounded-full text-primary-foreground transition-colors ${listening ? "bg-primary" : "bg-primary/90 hover:bg-primary"}`}
                    data-testid="memorize-mic-btn"
                    aria-label={listening ? "Stop reciting" : "Start reciting"}
                  >
                    {listening ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
                  </button>

                  {listening && (
                    <div className="flex w-full max-w-xs flex-col items-center gap-2" data-testid="mic-meter">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-[width] duration-100" style={{ width: `${Math.min(100, Math.round(micLevel * 600))}%` }} />
                      </div>
                      {noSound ? (
                        <p className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400" data-testid="mic-no-sound">
                          <AlertTriangle className="h-3.5 w-3.5" /> I can't hear you — speak louder or check your mic
                        </p>
                      ) : (
                        <p className="text-xs text-primary">{recognitionStatus === "reconnecting" ? "Reconnecting… your progress is saved" : recognitionStatus === "connecting" ? "Connecting to speech recognition…" : "Listening… recite and the words turn green"}</p>
                      )}
                      {heard && (
                        <p className="text-xs text-muted-foreground" data-testid="mic-heard">
                          Not matched yet: <span className="font-arabic" dir="rtl">{heard}</span>
                        </p>
                      )}
                    </div>
                  )}
                  {!listening && <p className="text-sm font-medium text-primary">Tap the mic, then recite</p>}
                </>
              ) : (
                <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground" data-testid="memorize-no-speech">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> Live voice reveal needs Chrome mic access — use manual reveal below.
                </div>
              )}

              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => { setManualPosition(Math.min(allWords.length, revealed + 1)); }} disabled={revealed >= allWords.length} data-testid="reveal-word-btn">
                  <Eye className="mr-2 h-4 w-4" /> Reveal word
                </Button>
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => setManualPosition(allWords.length)} disabled={revealed >= allWords.length} data-testid="reveal-ayah-btn">
                  <Eye className="mr-2 h-4 w-4" /> Reveal all
                </Button>
                <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground" onClick={() => { setManualPosition(0); }} disabled={revealed === 0} data-testid="reveal-hide-btn">
                  <EyeOff className="mr-2 h-4 w-4" /> Reset
                </Button>
                <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground" onClick={listen} data-testid="memorize-listen-btn">
                  <Volume2 className="mr-2 h-4 w-4" /> Listen
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default MemorizeReveal;
