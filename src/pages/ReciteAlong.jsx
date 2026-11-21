import { ayahKey, practiceDetails } from "@/lib/practiceSession";
import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  X,
  Mic,
  Play,
  Loader2,
  SkipForward,
  User,
  Volume2,
  RotateCcw,
  PartyPopper,
  Hand,
  Zap,
  Moon,
  Sun,
  BookOpen,
  List,
  Users,
  Brain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/context/SettingsContext";
import { usePlayback } from "@/context/PlaybackContext";
import { getSurah, getPageAudio, getMultiAudio, submitRecitation, logPracticeActivity } from "@/lib/api";
import { AUTOMATED_ASSESSMENT_ENABLED, getVerifiedScore } from "@/lib/assessment";
import PracticeMushafPage from "@/components/PracticeMushafPage";
import PracticeScopePicker from "@/components/PracticeScopePicker";
import { getUserId } from "@/lib/user";
import { preloadAudio } from "@/lib/preload";
import { surahStartPage } from "@/lib/mushafPages";

let SLOT_ID = 0;
const newSlot = (type, reciterId) => ({ key: ++SLOT_ID, type, reciterId });

const ReciteAlong = () => {
  const { number } = useParams();
  const navigate = useNavigate();
  const { reciter, translation, reciters, theme, toggleTheme } = useSettings();
  const { stop: stopOtherPlayback } = usePlayback();

  const [step, setStep] = useState("setup"); // setup | loading | session
  const [participants, setParticipants] = useState(() => {
    try {
      const saved = localStorage.getItem("alif_circle_participants");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const hasYou = parsed.some((p) => p.type === "you");
          return hasYou ? parsed : [newSlot("you"), ...parsed];
        }
      }
    } catch {}
    return [
      newSlot("you"),
      newSlot("reciter", reciter),
    ];
  });

  const [recordMode, setRecordMode] = useState("handsfree"); // default handsfree
  const [passThreshold, setPassThreshold] = useState(0);

  const [loadError, setLoadError] = useState("");
  const [retryLoad, setRetryLoad] = useState(0);
  const [data, setData] = useState(null);
  const [sessionAyahs, setSessionAyahs] = useState([]);
  const [audioAyahs, setAudioAyahs] = useState([]);
  const [ayahIndex, setAyahIndex] = useState(0);
  const [phase, setPhase] = useState("idle"); // playing | your-turn | recording | done
  const [sessionResults, setSessionResults] = useState([]);
  const [practiceView, setPracticeView] = useState("page");
  const [practiceScope, setPracticeScope] = useState("surah");
  const [scopeStart, setScopeStart] = useState(1);
  const [scopeEnd, setScopeEnd] = useState(1);
  const [continueOnLoad, setContinueOnLoad] = useState(false);

  const audioRef = useRef(null);
  const mediaRef = useRef(null);
  const streamRef = useRef(null);
  const modeRef = useRef("manual");
  const vadCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const vadIntervalRef = useRef(null);
  const thresholdRef = useRef(60);
  const resultsRef = useRef([]);
  const generationRef = useRef(0);
  const requestRef = useRef(null);
  const recordingPendingRef = useRef(false);
  const transitionRef = useRef(false);
  const correctionRef = useRef(false);
  const completionLoggedRef = useRef(false);
  const sessionEventIdRef = useRef("");
  const [turnError, setTurnError] = useState("");
  const [correctionReciter, setCorrectionReciter] = useState(null);
  const [correctionSlot, setCorrectionSlot] = useState(-1);

  useEffect(() => {
    let active = true;
    setLoadError("");
    setData(null);
    setSessionAyahs([]);
    getSurah(number, reciter, translation).then((surah) => { if (active) setData(surah); }).catch(() => { if (active) setLoadError("Could not load this surah."); });
    return () => { active = false; };
  }, [number, reciter, translation, retryLoad]);

  useEffect(() => {
    thresholdRef.current = passThreshold;
  }, [passThreshold]);
  useEffect(() => {
    modeRef.current = recordMode;
  }, [recordMode]);

  const reciterName = (id) => reciters.find((r) => r.identifier === id)?.englishName || id;

  // ---- setup helpers ----
  const addSlot = () => {
    if (participants.length >= 5) return;
    setParticipants((p) => [...p, newSlot("reciter", reciter)]);
  };
  const removeSlot = (key) =>
    setParticipants((p) => (p.length > 1 ? p.filter((s) => s.key !== key) : p));
  const setSlotType = (key, type) =>
    setParticipants((p) =>
      p.map((s) => (s.key === key ? { ...s, type, reciterId: type === "reciter" ? reciter : undefined } : s))
    );
  const setSlotReciter = (key, reciterId) =>
    setParticipants((p) => p.map((s) => (s.key === key ? { ...s, reciterId } : s)));

  const selectPracticeAyahs = (source = [], start = scopeStart, end = scopeEnd) => {
    if (practiceScope === "page") return source.filter((ayah) => ayah.page === start);
    if (practiceScope === "range") {
      const from = Math.min(start, end);
      const to = Math.max(start, end);
      return source.filter((ayah) => ayah.numberInSurah >= from && ayah.numberInSurah <= to);
    }
    if (practiceScope === "five") {
      const index = Math.max(0, source.findIndex((ayah) => ayah.numberInSurah === start));
      return source.slice(index, index + 5);
    }
    return source;
  };

  const start = async (loadedSurah = null, startOverride = scopeStart, endOverride = scopeEnd) => {
    stopOtherPlayback();
    const generation = ++generationRef.current;
    setStep("loading");
    setTurnError("");
    try {
      // Always include the default reciter so a correction voice exists (even solo).
      const reciterIds = [
        ...new Set([reciter, ...participants.filter((s) => s.type === "reciter").map((s) => s.reciterId)]),
      ];
      const surah = loadedSurah || (data?.surah?.number === Number(number) ? data : await getSurah(number, reciter, translation));
      const chosenAyahs = practiceScope === "page"
        ? (await getPageAudio(startOverride, reciter, translation)).ayahs
        : selectPracticeAyahs(surah.ayahs || [], startOverride, endOverride).map((ayah) => ({...ayah, surahNumber: Number(number), surahName: surah.surah.englishName}));
      if (!chosenAyahs.length) throw new Error("Empty practice selection");
      const surahNumbers = [...new Set(chosenAyahs.map((ayah) => ayah.surahNumber))];
      const audioSets = await Promise.all(surahNumbers.map(async (id) => ({id, audio: await getMultiAudio(id, reciterIds)})));
      if (generation !== generationRef.current) return;
      const audioByAyah = new Map(audioSets.flatMap(({id, audio}) => (audio.ayahs || []).map((ayah, index) => [id + ":" + (ayah.numberInSurah ?? index + 1), ayah])));
      setData(surah);
      setSessionAyahs(chosenAyahs);
      setAudioAyahs(chosenAyahs.map((ayah) => audioByAyah.get(ayahKey(ayah)) || {}));
      completionLoggedRef.current = false;
      sessionEventIdRef.current =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `along-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setPhase("idle");
      setAyahIndex(0);
      resultsRef.current = [];
      setSessionResults([]);
      // Pre-warm mic when hands-free is chosen (during this user gesture).
      if (recordMode === "handsfree" && participants.some((s) => s.type === "you")) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (generation !== generationRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
          streamRef.current = stream;
        } catch {
          toast.info("Mic blocked — switching to manual (tap to record).");
          setRecordMode("manual");
          modeRef.current = "manual";
        }
      }
      transitionRef.current = false;
      correctionRef.current = false;
      setStep("session");
    } catch (e) {
      if (generation !== generationRef.current) return;
      toast.error("Could not start Recite Along. Try again.");
      setStep("setup");
    }
  };

  const sourceAyahs = data?.ayahs || [];
  const ayahs = sessionAyahs;
  const currentAyah = ayahs[ayahIndex];
  const currentParticipant = participants[ayahIndex % participants.length];

  // drive each turn
  useEffect(() => {
    if (step !== "session" || !currentAyah || !currentParticipant) return;
    transitionRef.current = false;
    setTurnError("");
    if (currentParticipant.type === "reciter") {
      setPhase("playing");
      const url = audioAyahs[ayahIndex]?.audios?.[currentParticipant.reciterId];
      const el = audioRef.current;
      if (el && url) {
        el.src = url;
        playAudio(url);
      } else { setTurnError("This recitation could not load. Retry or skip this turn."); }
    } else if (modeRef.current === "handsfree") {
      startRecording();
    } else {
      setPhase("your-turn");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ayahIndex]);

  useEffect(() => {
    if (step === "session" && phase === "your-turn" && recordMode === "handsfree") startRecording();
    // Mode changes apply to the current waiting turn as well as future turns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordMode]);

  // Preload upcoming reciter audio so turns start without delay.
  useEffect(() => {
    if (step !== "session") return;
    const urls = [];
    for (let k = 0; k <= 6; k++) {
      const idx = ayahIndex + k;
      const ids = new Set([reciter, ...participants.filter(p => p.type === "reciter").map(p => p.reciterId)]);
      for (const id of ids) {
        const u = audioAyahs[idx]?.audios?.[id];
        if (u) urls.push(u);
      }
    }
    preloadAudio(urls);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ayahIndex, step, audioAyahs]);

  const stopVad = () => {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
  };

  const cleanupStream = () => {
    stopVad();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (vadCtxRef.current) {
      vadCtxRef.current.close().catch(() => {});
      vadCtxRef.current = null;
      analyserRef.current = null;
    }
  };
  useEffect(() => () => {
    generationRef.current++;
    requestRef.current?.abort();
    if (mediaRef.current) {
      mediaRef.current.onstop = null;
      if (mediaRef.current.state !== "inactive") mediaRef.current.stop();
    }
    cleanupStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startVad = () => {
    try {
      if (!vadCtxRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        const ctx = new AC();
        const source = ctx.createMediaStreamSource(streamRef.current);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        vadCtxRef.current = ctx;
        analyserRef.current = analyser;
      }
      if (vadCtxRef.current.state === "suspended") vadCtxRef.current.resume();
      const analyser = analyserRef.current;
      const buf = new Uint8Array(analyser.fftSize);
      let hasSpoken = false;
      let silenceStart = null;
      const t0 = Date.now();
      stopVad();
      vadIntervalRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        const now = Date.now();
        if (rms > 0.025) {
          hasSpoken = true;
          silenceStart = null;
        } else if (hasSpoken) {
          if (silenceStart === null) silenceStart = now;
          else if (now - silenceStart > 1500) stopRecording();
        }
        if (now - t0 > 180000) {
          stopVad();
          toast.info("Long recording — tap Finish now when you are ready.");
        }
      }, 120);
    } catch {
      toast.info("Automatic stopping is unavailable. Tap Finish now after reciting.");
    }
  };

  const playAudio = (url) => {
    const generation = generationRef.current;
    const el = audioRef.current;
    setTurnError("");
    if (!el || !url) { setTurnError("Audio is unavailable. Retry or skip this turn."); return; }
    el.src = url;
    el.play().catch(() => {
      if (generation === generationRef.current && el.getAttribute("src") === url) setTurnError("Playback could not start. Tap Replay to try again.");
    });
  };

  const advance = () => {
    if (transitionRef.current) return;
    transitionRef.current = true;
    audioRef.current?.pause();
    correctionRef.current = false;
    setCorrectionReciter(null);
    if (ayahIndex < ayahs.length - 1) setAyahIndex((i) => i + 1);
    else { cleanupStream(); setPhase("done"); }
  };

  const replayReciter = () => {
    const id = correctionRef.current ? correctionReciter : currentParticipant.reciterId;
    playAudio(audioAyahs[ayahIndex]?.audios?.[id]);
  };

  const startRecording = async () => {
    if (recordingPendingRef.current || mediaRef.current?.state === "recording") return;
    recordingPendingRef.current = true;
    const generation = generationRef.current;
    try {
      if (!streamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (generation !== generationRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
      }
      const ayah = currentAyah;
      const recordedIndex = ayahIndex;
      const threshold = thresholdRef.current;
      const chunks = [];
      const mr = new MediaRecorder(streamRef.current);
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mr.onstop = () => {
        if (generation !== generationRef.current) return;
        const blob = new Blob(chunks, {type: mr.mimeType || chunks[0]?.type || "audio/webm"});
        scoreTurn(blob, ayah, recordedIndex, threshold, generation);
      };
      mediaRef.current = mr;
      mr.start();
      setPhase("recording");
      if (modeRef.current === "handsfree") startVad();
    } catch {
      if (generation !== generationRef.current) return;
      setRecordMode("manual");
      modeRef.current = "manual";
      setPhase("your-turn");
      toast.error("Microphone could not start. Check access and try again.");
    } finally { recordingPendingRef.current = false; }
  };

  const stopRecording = () => {
    const recorder = mediaRef.current;
    if (!recorder || recorder.state !== "recording") return;
    stopVad();
    setPhase("transition");
    recorder.stop();
  };

  const scoreTurn = async (blob, ayah, recordedIndex, threshold, generation) => {
    if (!AUTOMATED_ASSESSMENT_ENABLED) {
      if (generation !== generationRef.current) return;
      resultsRef.current.push({
        surah: ayah.surahNumber,
        ayah: ayah.numberInSurah,
        score: null,
        score_verified: false,
        passed: false,
      });
      setSessionResults([...resultsRef.current]);
      advance();
      return;
    }

    const controller = new AbortController();
    requestRef.current = controller;
    let score = null;
    try {
      const fd = new FormData();
      const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      fd.append("audio", blob, "recitation." + extension);
      fd.append("reference", ayah.arabic);
      fd.append("surah_name", ayah.surahName || data?.surah?.englishName || "");
      fd.append("surah_number", String(ayah.surahNumber || number || 0));
      fd.append("ayah_number", String(ayah.numberInSurah));
      fd.append("user_id", getUserId());
      const response = await submitRecitation(fd, {signal: controller.signal, timeout: 30000});
      score = getVerifiedScore(response);
    } catch { /* Unavailable scores are reported only in the final summary. */ }
    if (generation !== generationRef.current) return;
    requestRef.current = null;
    resultsRef.current.push({
      surah: ayah.surahNumber,
      ayah: ayah.numberInSurah,
      score,
      score_verified: score !== null,
      passed: score !== null && score >= threshold,
    });
    setSessionResults([...resultsRef.current]);
    if (score !== null && score < threshold) {
      let id = reciter;
      let slotIndex = -1;
      for (let offset = 1; offset <= participants.length; offset++) {
        const slot = participants[(recordedIndex + offset) % participants.length];
        if (slot.type === "reciter") { id = slot.reciterId; slotIndex = (recordedIndex + offset) % participants.length; break; }
      }
      correctionRef.current = true;
      setCorrectionReciter(id);
      setCorrectionSlot(slotIndex);
      setPhase("correction");
      playAudio(audioAyahs[recordedIndex]?.audios?.[id]);
    } else advance();
  };

  const restart = () => {
    generationRef.current++;
    requestRef.current?.abort();
    if (mediaRef.current) {
      mediaRef.current.onstop = null;
      if (mediaRef.current.state !== "inactive") mediaRef.current.stop();
    }
    audioRef.current?.pause();
    cleanupStream();
    resultsRef.current = [];
    completionLoggedRef.current = false;
    setSessionResults([]);
    setStep("setup");
    setAyahIndex(0);
    setPhase("idle");
  };

  const changePracticeScope = (next) => setPracticeScope(next);
  const changeScopeStart = (next) => setScopeStart(next);
  const changeScopeEnd = (next) => setScopeEnd(next);
  const scopeLabel = practiceScope === "surah" ? "next surah" : practiceScope === "page" ? "next page" : practiceScope === "five" ? "next five ayahs" : "next range";

  const continueNext = () => {
    if (practiceScope === "surah") {
      if (Number(number) >= 114) return;
      setContinueOnLoad(true);
      navigate(`/surah/${Number(number) + 1}/along`);
      return;
    }
    if (practiceScope === "page") {
      const nextPage = scopeStart < 604 ? scopeStart + 1 : null;
      if (nextPage) { setScopeStart(nextPage); start(data, nextPage); }
      return;
    }
    if (practiceScope === "range") {
      const size = Math.abs(scopeEnd - scopeStart) + 1;
      const nextStart = Math.max(scopeStart, scopeEnd) + 1;
      const lastAyah = sourceAyahs[sourceAyahs.length - 1]?.numberInSurah;
      if (nextStart <= lastAyah) {
        const nextEnd = Math.min(lastAyah, nextStart + size - 1);
        setScopeStart(nextStart);
        setScopeEnd(nextEnd);
        start(data, nextStart, nextEnd);
      }
      return;
    }
    const currentIndex = sourceAyahs.findIndex((ayah) => ayah.numberInSurah === scopeStart);
    const nextIndex = currentIndex + (practiceScope === "five" ? 5 : 1);
    if (nextIndex < sourceAyahs.length) {
      const nextStart = sourceAyahs[nextIndex].numberInSurah;
      setScopeStart(nextStart);
      start(data, nextStart);
    }
  };

  useEffect(() => {
    if (!continueOnLoad || !data) return;
    const nextStart = practiceScope === "page" ? data.ayahs?.[0]?.page : data.ayahs?.[0]?.numberInSurah || 1;
    setScopeStart(nextStart);
    setContinueOnLoad(false);
    start(data, nextStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continueOnLoad, data]);

  const verifiedSessionResults = sessionResults.filter((r) => getVerifiedScore(r) !== null);
  const passedCount = verifiedSessionResults.filter((r) => r.passed).length;
  const scoredCount = verifiedSessionResults.length;
  const unavailableCount = sessionResults.length - scoredCount;

  useEffect(() => {
    if (phase !== "done" || completionLoggedRef.current || !data?.surah) return;
    completionLoggedRef.current = true;
    if (typeof logPracticeActivity === "function") {
      logPracticeActivity({
        user_id: getUserId(),
        surah_number: Number(number),
        surah_name: data.surah.englishName,
        kind: "recite_along",
        client_event_id: sessionEventIdRef.current || undefined,
        ...practiceDetails(sessionAyahs, Number(number), practiceScope),
      }).catch(() => {});
    }
  }, [phase, data, number, sessionAyahs, practiceScope]);

  // ---------- RENDER ----------
  const curPage = data?.ayahs?.[0]?.page || surahStartPage(Number(number));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 glass border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-3.5 sm:px-8">
          <Link to={`/surah/${number}`} data-testid="along-back-btn">
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-xl sm:text-2xl font-semibold text-foreground">
              Recite Along{data?.surah ? ` · ${data.surah.englishName}` : ""}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {data?.surah?.englishNameTranslation || "Interactive recitation circle"}
            </p>
          </div>
          <Button variant="outline" size="icon" className="rounded-full" onClick={toggleTheme} aria-label="Toggle theme" data-testid="along-theme-toggle">
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>

        {/* Subtle segmented mode switcher directly below */}
        <div className="flex items-center justify-center border-t border-border/30 bg-background/50 px-3 py-1 sm:py-1.5">
          <nav className="inline-flex max-w-full items-center gap-0.5 sm:gap-1 rounded-xl bg-black/5 dark:bg-white/10 p-0.5 sm:p-1 text-xs" data-testid="along-mode-bar">
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
            <span className="flex items-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-3 py-1 text-[11px] sm:text-xs bg-background shadow-xs font-semibold text-primary transition-all">
              <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>Recite Along</span>
            </span>
            <Link
              to={`/surah/${number}/memorize`}
              className="flex items-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-3 py-1 text-[11px] sm:text-xs text-muted-foreground hover:text-foreground transition-all"
            >
              <Brain className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>Memorize</span>
            </Link>
          </nav>
        </div>
      </header>

      <audio ref={audioRef} onEnded={() => { if (phase === "playing" || phase === "correction") advance(); }} onError={() => setTurnError("Audio could not load. Tap Replay to retry.")} className="hidden" />

      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        {step === "setup" && (
          <div data-testid="along-setup">
            {loadError && <p role="alert">{loadError} <button onClick={() => setRetryLoad((n) => n + 1)}>Retry</button></p>}
            <p className="mb-1 font-heading text-3xl font-semibold text-foreground">Set your circle</p>
            <p className="mb-6 text-sm text-muted-foreground">
              Ayahs alternate in order between everyone below. Take a turn reciting yourself or configure pure reciter-to-reciter alternating listening.
            </p>

            <div className="mb-6">
              <PracticeScopePicker ayahs={sourceAyahs} value={practiceScope} onValueChange={changePracticeScope} start={scopeStart} onStartChange={changeScopeStart} end={scopeEnd} onEndChange={changeScopeEnd} testid="along" />
            </div>

            {/* Toggle You ON / OFF */}
            <div className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                  <Mic className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">Include Your Voice ("You")</p>
                  <p className="text-xs text-muted-foreground">Turn off for automated reciter-to-reciter alternating listening</p>
                </div>
              </div>
              <Switch
                checked={participants.some((s) => s.type === "you")}
                onCheckedChange={(checked) => {
                  if (checked) {
                    if (!participants.some((s) => s.type === "you")) {
                      setParticipants([newSlot("you"), ...participants]);
                    }
                  } else {
                    const withoutYou = participants.filter((s) => s.type !== "you");
                    setParticipants(withoutYou.length >= 2 ? withoutYou : [newSlot("reciter", reciter), newSlot("reciter", "ar.husary")]);
                  }
                }}
                data-testid="along-toggle-you"
              />
            </div>

            <div className="space-y-3">
              {participants.map((s, i) => (
                <div
                  key={s.key}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"
                  data-testid={`along-slot-${i}`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {i + 1}
                  </span>

                  <div className="flex rounded-full border border-border p-0.5">
                    <button
                      onClick={() => setSlotType(s.key, "you")}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        s.type === "you" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                      }`}
                      data-testid={`slot-you-${i}`}
                    >
                      You
                    </button>
                    <button
                      onClick={() => setSlotType(s.key, "reciter")}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        s.type === "reciter" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                      }`}
                      data-testid={`slot-reciter-${i}`}
                    >
                      Reciter
                    </button>
                  </div>

                  {s.type === "reciter" ? (
                    <Select value={s.reciterId} onValueChange={(v) => setSlotReciter(s.key, v)}>
                      <SelectTrigger className="flex-1" data-testid={`slot-reciter-select-${i}`}>
                        <SelectValue placeholder="Choose reciter" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {reciters.map((r) => (
                          <SelectItem key={r.identifier} value={r.identifier}>
                            {r.englishName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="flex flex-1 items-center gap-2 text-sm font-medium text-foreground">
                      <User className="h-4 w-4 text-primary" /> Your voice
                    </span>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full text-muted-foreground"
                    onClick={() => removeSlot(s.key)}
                    disabled={participants.length <= 1}
                    aria-label="Remove"
                    data-testid={`remove-slot-${i}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              className="mt-4 rounded-full"
              onClick={addSlot}
              disabled={participants.length >= 5}
              data-testid="add-slot-btn"
            >
              <Plus className="mr-2 h-4 w-4" /> Add participant
            </Button>

            {/* Recording mode */}
            <div className="mt-8 rounded-2xl border border-border bg-card p-5" data-testid="along-mode-block">
              <p className="mb-1 text-sm font-semibold text-foreground">Recording mode</p>
              <p className="mb-4 text-xs text-muted-foreground">
                How your turns are captured.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setRecordMode("manual")}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors ${
                    recordMode === "manual" ? "border-primary bg-primary/5" : "border-border"
                  }`}
                  data-testid="mode-manual-btn"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Hand className="h-4 w-4 text-primary" /> Manual
                  </span>
                  <span className="text-xs text-muted-foreground">Tap to record, tap to finish.</span>
                </button>
                <button
                  onClick={() => setRecordMode("handsfree")}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors ${
                    recordMode === "handsfree" ? "border-primary bg-primary/5" : "border-border"
                  }`}
                  data-testid="mode-handsfree-btn"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Zap className="h-4 w-4 text-primary" /> Hands-free
                  </span>
                  <span className="text-xs text-muted-foreground">Auto-stops when you pause.</span>
                </button>
              </div>
            </div>

            {/* Hands-free information */}
            <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5" data-testid="along-handsfree-info">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Automatic Hands-Free Recitation</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Verses automatically advance as soon as you pause reciting or the reciter completes. No pass mark or grading obstacles.
              </p>
            </div>

            <Button
              className="mt-6 w-full rounded-full sm:px-8 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md"
              onClick={() => {
                try {
                  localStorage.setItem("alif_circle_participants", JSON.stringify(participants));
                } catch {}
                const targetPage = practiceScope === "page" ? scopeStart : (data?.ayahs?.[0]?.page || surahStartPage(Number(number)) || 1);
                navigate(`/mushaf/${targetPage}?mode=along`);
              }}
              data-testid="start-along-btn"
            >
              <Play className="mr-2 h-4 w-4" /> Start Practice in Mushaf Mode
            </Button>
          </div>
        )}

        {step === "loading" && (
          <div className="flex flex-col items-center gap-3 py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Preparing your circle…</p>
          </div>
        )}

        {step === "session" && currentAyah && phase !== "done" && (
          <div data-testid="along-session">
            <div className="mb-6">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>{currentAyah.surahName || data?.surah?.englishName} · Ayah {currentAyah.numberInSurah}</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setRecordMode((m) => (m === "manual" ? "handsfree" : "manual"))}
                    className="rounded-full border border-border px-3 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
                    disabled={phase === "recording" || phase === "transition"}
                    data-testid="along-mode-toggle"
                  >
                    {recordMode === "manual" ? (
                      <span className="flex items-center gap-1"><Hand className="h-3 w-3" /> Manual</span>
                    ) : (
                      <span className="flex items-center gap-1"><Zap className="h-3 w-3" /> Hands-free</span>
                    )}
                  </button>
                  <span>
                    Ayah {ayahIndex + 1} / {ayahs.length}
                  </span>
                </div>
              </div>
              <Progress value={((ayahIndex + 1) / ayahs.length) * 100} className="h-1.5" />
            </div>

            {/* Turn indicator */}
            <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
              {participants.map((s, i) => {
                const active = i === (phase === "correction" ? correctionSlot : ayahIndex % participants.length);
                return (
                  <div
                    key={s.key}
                    className={`flex items-center gap-2 rounded-full border px-4 py-2 transition-colors ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground"
                    }`}
                    data-testid={`turn-chip-${i}`}
                  >
                    {s.type === "you" ? <User className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    <span className="max-w-[120px] truncate text-xs font-medium">
                      {s.type === "you" ? "You" : reciterName(s.reciterId)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mb-4 flex justify-center gap-2" data-testid="along-view-toggle">
              <Button size="sm" variant={practiceView === "page" ? "default" : "outline"} className="rounded-full" onClick={() => setPracticeView("page")} data-testid="along-view-page">Full page</Button>
              <Button size="sm" variant={practiceView === "focus" ? "default" : "outline"} className="rounded-full" onClick={() => setPracticeView("focus")} data-testid="along-view-focus">Focus</Button>
            </div>

            {practiceView === "page" ? (
              <PracticeMushafPage
                page={currentAyah.page || 1}
                reciter={reciter}
                translation={translation}
                activeSurah={currentAyah.surahNumber ?? Number(number)}
                activeAyah={currentAyah.numberInSurah}
              />
            ) : <AnimatePresence mode="wait">
              <motion.div
                key={ayahIndex}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.3 }}
                className="rounded-2xl border border-border bg-card px-5 py-12 sm:px-10"
              >
                <p className="font-arabic text-center text-4xl leading-[2] text-foreground sm:text-5xl" dir="rtl" style={{ direction: "rtl", unicodeBidi: "plaintext" }}>
                  {currentAyah.arabic}
                </p>
                {currentAyah.translation && (
                  <p className="mt-6 text-center text-sm text-muted-foreground">{currentAyah.translation}</p>
                )}
              </motion.div>
            </AnimatePresence>}

            {turnError && <p role="alert" className="mt-4 text-center text-sm text-red-600">{turnError}</p>}
            {phase === "transition" && <p className="mt-6 text-center text-sm text-muted-foreground" data-testid="along-transition">Preparing the next turn…</p>}
            {/* Controls per phase */}
            <div className="mt-8 flex flex-col items-center gap-4">
              {(currentParticipant.type === "reciter" || phase === "correction") && (
                <>
                  <p className="text-sm font-medium text-primary">
                    <Volume2 className="mr-1 inline h-4 w-4" />
                    {reciterName(phase === "correction" ? correctionReciter : currentParticipant.reciterId)} is reciting…
                  </p>
                  <div className="flex gap-3">
                    <Button variant="outline" className="rounded-full" onClick={replayReciter} data-testid="along-replay-btn">
                      <RotateCcw className="mr-2 h-4 w-4" /> Replay
                    </Button>
                    <Button className="rounded-full px-6" onClick={advance} data-testid="along-next-btn">
                      <SkipForward className="mr-2 h-4 w-4" /> Next
                    </Button>
                  </div>
                </>
              )}

              {currentParticipant.type === "you" && phase === "your-turn" && (
                <>
                  <p className="text-sm font-medium text-primary">Your turn — recite this ayah</p>
                  <Button className="h-14 rounded-full px-8 text-base" onClick={startRecording} data-testid="along-record-btn">
                    <Mic className="mr-2 h-5 w-5" /> Record
                  </Button>
                  <Button variant="ghost" className="rounded-full text-muted-foreground" onClick={advance} data-testid="along-skip-btn">
                    Skip my turn
                  </Button>
                </>
              )}

              {currentParticipant.type === "you" && phase === "recording" && (
                <>
                  <button
                    onClick={stopRecording}
                    className="animate-recordpulse flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    data-testid="along-stop-btn"
                    aria-label="Finish now"
                  >
                    <Mic className="h-6 w-6" />
                  </button>
                  <p className="text-sm font-medium text-primary">
                    {recordMode === "handsfree"
                      ? "Listening… recite now — I'll stop when you pause"
                      : "Recording… tap the mic to finish"}
                  </p>
                  <button
                    onClick={stopRecording}
                    className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                    data-testid="along-finish-now-btn"
                  >
                    Finish now
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {step === "session" && phase === "done" && (
          <div className="flex flex-col items-center gap-4 py-16 text-center" data-testid="along-done">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <PartyPopper className="h-8 w-8" />
            </span>
            <p className="font-heading text-3xl font-semibold text-foreground">Practice complete!</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              You finished your selected {practiceScope === "page" ? `page ${scopeStart}` : "ayahs"} together. May Allah accept it.
            </p>

            {unavailableCount > 0 && (
              <p data-testid="along-unavailable" className="text-sm text-muted-foreground">
                Automated assessment was unavailable for {unavailableCount} recording(s). These were not counted as failed recitations.
              </p>
            )}
            {scoredCount > 0 && (
              <div className="mt-2 w-full max-w-md rounded-2xl border border-border bg-card p-5 text-left" data-testid="along-summary">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">Your recitation results</p>
                  <span className="text-sm font-bold text-primary">
                    {passedCount}/{scoredCount} passed
                  </span>
                </div>
                <div className="space-y-2">
                  {verifiedSessionResults.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-xl border border-border px-3 py-2"
                        data-testid={`along-summary-row-${i}`}
                      >
                        <span className="text-sm text-foreground">{r.surah ? `${r.surah}:` : "Ayah "}{r.ayah}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{r.score}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              r.passed ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                            }`}
                          >
                            {r.passed ? "Pass" : "Retry"}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div className="mt-2 flex gap-3">
              <Button className="rounded-full px-6" onClick={restart} data-testid="along-restart-btn">
                <RotateCcw className="mr-2 h-4 w-4" /> Recite Again
              </Button>
              <Button variant="outline" className="rounded-full px-6" onClick={continueNext} data-testid="along-continue-next-btn">
                <SkipForward className="mr-2 h-4 w-4" /> {scopeLabel}
              </Button>
              <Link to={`/surah/${number}`}>
                <Button variant="outline" className="rounded-full px-6">
                  Back to Reader
                </Button>
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ReciteAlong;
