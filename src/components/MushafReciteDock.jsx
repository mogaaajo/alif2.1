import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Mic,
  MicOff,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  CheckCircle2,
  RotateCcw,
  X,
  Users,
  Plus,
  Trash2,
  ChevronDown,
  Sparkles,
  Zap,
  User,
  Headphones,
  ArrowRightLeft,
} from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import { getPageAudio } from "@/lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export default function MushafReciteDock({
  ayahs = [],
  page = 1,
  surahNumber = 1,
  activeAyahIndex = 0,
  onSelectAyahIndex,
  onClose,
  night = false,
}) {
  const { reciter, setReciter, reciters, translation } = useSettings();
  const [index, setIndex] = useState(activeAyahIndex || 0);

  // Recite mode: "listen" (Solo Listen Only: alternating reciters) vs "practice" (Interactive: user voice + reciter)
  const [mode, setMode] = useState(() => {
    try {
      return localStorage.getItem("alif_recite_mode") || "listen";
    } catch {
      return "listen";
    }
  });

  // Dual reciters
  const [reciter1, setReciter1] = useState(reciter || "ar.alafasy");
  const [reciter2, setReciter2] = useState(() => {
    try {
      const saved = localStorage.getItem("alif_reciter_2");
      if (saved && saved !== reciter) return saved;
    } catch {}
    return "ar.husary";
  });

  // Popover menus for quick reciter pickers
  const [reciter1Open, setReciter1Open] = useState(false);
  const [reciter2Open, setReciter2Open] = useState(false);

  // Audio playback state - initializes in an IDLE / PAUSED state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [audioError, setAudioError] = useState("");

  // Speech recording state for Practice mode
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");

  // Hands-free toggle for Practice mode
  const [handsFree, setHandsFree] = useState(true);

  // Advanced Circle Modal & Participants
  const [circleDialogOpen, setCircleDialogOpen] = useState(false);
  const [includeUserInCircle, setIncludeUserInCircle] = useState(true);
  const [circleParticipants, setCircleParticipants] = useState(() => {
    try {
      const saved = localStorage.getItem("alif_circle_participants");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [
      { id: "you", type: "you" },
      { id: "reciter-1", type: "reciter", reciterId: reciter || "ar.alafasy" },
      { id: "reciter-2", type: "reciter", reciterId: "ar.husary" },
    ];
  });

  const [turnIndex, setTurnIndex] = useState(0);

  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const autoAdvanceTimerRef = useRef(null);
  const hasSpokenRef = useRef(false);
  const reciterAudioCacheRef = useRef(new Map());

  // Keep reciter1 in sync with global settings
  useEffect(() => {
    if (reciter && reciter !== reciter1) {
      setReciter1(reciter);
    }
  }, [reciter]);

  // Persist mode & reciter 2
  useEffect(() => {
    try {
      localStorage.setItem("alif_recite_mode", mode);
    } catch {}
  }, [mode]);

  useEffect(() => {
    try {
      localStorage.setItem("alif_reciter_2", reciter2);
    } catch {}
  }, [reciter2]);

  // Sync index from parent
  useEffect(() => {
    if (activeAyahIndex >= 0 && activeAyahIndex < ayahs.length) {
      setIndex(activeAyahIndex);
    }
  }, [activeAyahIndex, ayahs.length]);

  const currentAyah = ayahs[index] || null;

  // Cleanup media
  const cleanupMedia = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsRecording(false);
    setIsPlaying(false);
    hasSpokenRef.current = false;
  };

  useEffect(() => {
    cleanupMedia();
    setIsSessionActive(false);
    setTranscript("");
    setAudioError("");
  }, [page]);

  useEffect(() => {
    return () => {
      cleanupMedia();
      setIsSessionActive(false);
    };
  }, []);

  useEffect(() => {
    if (onSelectAyahIndex) {
      onSelectAyahIndex(index);
    }
  }, [index, onSelectAyahIndex]);

  // Pre-fetch reciter 2 audio for the current page
  useEffect(() => {
    if (!reciter2 || !page) return;
    const cacheKey = `${page}_${reciter2}`;
    if (!reciterAudioCacheRef.current.has(cacheKey)) {
      getPageAudio(page, reciter2, translation)
        .then((pageData) => {
          reciterAudioCacheRef.current.set(cacheKey, pageData?.ayahs || []);
        })
        .catch(() => {});
    }
  }, [page, reciter2, translation]);

  // Determine current active participant / active reciter
  const activeReciterId = useMemo(() => {
    if (mode === "listen") {
      // Verse-by-verse alternating in Listen Only mode
      return index % 2 === 0 ? reciter1 : reciter2;
    }
    // In practice mode, follow circle
    const active = circleParticipants[turnIndex % circleParticipants.length];
    if (active?.type === "reciter") return active.reciterId || reciter1;
    return null; // "you"
  }, [mode, index, reciter1, reciter2, circleParticipants, turnIndex]);

  const activeParticipant = useMemo(() => {
    if (mode === "listen") {
      return {
        type: "reciter",
        reciterId: activeReciterId,
        slotNumber: (index % 2) + 1,
      };
    }
    return circleParticipants[turnIndex % circleParticipants.length] || { type: "you" };
  }, [mode, activeReciterId, index, circleParticipants, turnIndex]);

  // Handle advancing to next verse
  const advanceToNext = (targetIndex) => {
    const nextIdx = typeof targetIndex === "number" ? targetIndex : index + 1;
    if (nextIdx < ayahs.length) {
      setIndex(nextIdx);
      setTurnIndex((t) => t + 1);
    } else {
      // Reached end of page
      setIsPlaying(false);
      setIsSessionActive(false);
    }
  };

  // Play reciter audio for an ayah
  const playAyahAudio = async (reciterId, ayahIdx = index) => {
    cleanupMedia();
    const targetAyah = ayahs[ayahIdx];
    if (!targetAyah) return;

    let audioUrl = null;
    if (reciterId === reciter1 && targetAyah.audio) {
      audioUrl = targetAyah.audio;
    } else {
      const cacheKey = `${page}_${reciterId}`;
      let cachedList = reciterAudioCacheRef.current.get(cacheKey);
      if (!cachedList) {
        try {
          const fetched = await getPageAudio(page, reciterId, translation);
          cachedList = fetched?.ayahs || [];
          reciterAudioCacheRef.current.set(cacheKey, cachedList);
        } catch {
          setIsSessionActive(false);
          setAudioError("Could not load reciter audio.");
          return;
        }
      }
      audioUrl = cachedList[ayahIdx]?.audio || null;
    }

    if (!audioUrl) {
      setIsSessionActive(false);
      setAudioError("Audio unavailable for this verse.");
      return;
    }

    setAudioError("");
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
    } else {
      audioRef.current.src = audioUrl;
    }

    audioRef.current.onended = () => {
      setIsPlaying(false);
      // Automatically advance to the next verse if session is active
      if (ayahIdx < ayahs.length - 1) {
        autoAdvanceTimerRef.current = setTimeout(() => {
          advanceToNext(ayahIdx + 1);
        }, 600);
      } else {
        setIsSessionActive(false);
      }
    };

    audioRef.current.onerror = () => {
      setIsPlaying(false);
      setIsSessionActive(false);
      setAudioError("Audio playback error.");
    };

    audioRef.current
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => {
        setIsPlaying(false);
        setAudioError("Tap Play to start audio.");
      });
  };

  // Speech recognition for practice mode
  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.");
      return;
    }

    cleanupMedia();

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "ar-SA";
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsRecording(true);
        setTranscript("");
        hasSpokenRef.current = false;
      };

      recognition.onresult = (event) => {
        let currentTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        if (currentTranscript.trim()) {
          hasSpokenRef.current = true;
          setTranscript(currentTranscript);

          if (handsFree) {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = setTimeout(() => {
              stopRecordingAndAutoAdvance();
            }, 1300);
          }
        }
      };

      recognition.onspeechend = () => {
        if (handsFree && hasSpokenRef.current) {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            stopRecordingAndAutoAdvance();
          }, 800);
        }
      };

      recognition.onerror = () => setIsRecording(false);
      recognition.onend = () => setIsRecording(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsRecording(false);
    }
  };

  const stopRecordingAndAutoAdvance = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsRecording(false);

    if (handsFree && index < ayahs.length - 1) {
      autoAdvanceTimerRef.current = setTimeout(() => {
        advanceToNext();
      }, 700);
    }
  };

  const stopRecording = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsRecording(false);
  };

  // Automatic progression triggers when active verse or turn updates, BUT ONLY if session is active
  useEffect(() => {
    if (!currentAyah || !isSessionActive) return;

    if (mode === "listen") {
      // In Listen Only mode: automatically play the active alternating reciter
      playAyahAudio(activeReciterId, index);
    } else {
      // In Practice mode: check if it's reciter turn or user turn
      if (activeParticipant.type === "reciter") {
        playAyahAudio(activeParticipant.reciterId, index);
      } else if (activeParticipant.type === "you" && handsFree) {
        const timer = setTimeout(() => {
          startRecording();
        }, 400);
        return () => clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, mode, turnIndex, isSessionActive]);

  const togglePlayback = () => {
    if (isSessionActive || isPlaying || isRecording) {
      setIsSessionActive(false);
      cleanupMedia();
    } else {
      setIsSessionActive(true);
      if (mode === "listen") {
        playAyahAudio(activeReciterId, index);
      } else {
        if (activeParticipant.type === "reciter") {
          playAyahAudio(activeParticipant.reciterId, index);
        } else {
          startRecording();
        }
      }
    }
  };

  const nextAyah = () => {
    if (index < ayahs.length - 1) {
      cleanupMedia();
      setIndex((i) => i + 1);
      setTurnIndex((t) => t + 1);
    }
  };

  const prevAyah = () => {
    if (index > 0) {
      cleanupMedia();
      setIndex((i) => i - 1);
      setTurnIndex((t) => Math.max(0, t - 1));
    }
  };

  // Helper names
  const reciter1Obj = reciters.find((r) => r.identifier === reciter1);
  const reciter2Obj = reciters.find((r) => r.identifier === reciter2);
  const r1Name = reciter1Obj?.englishName?.split(" ")?.[0] || "Reciter 1";
  const r2Name = reciter2Obj?.englishName?.split(" ")?.[0] || "Reciter 2";

  // Circle participant helpers
  const toggleUserInCircle = (include) => {
    setIncludeUserInCircle(include);
    if (include) {
      const withoutYou = circleParticipants.filter((p) => p.type !== "you");
      const updated = [{ id: "you", type: "you" }, ...withoutYou];
      setCircleParticipants(updated);
      try {
        localStorage.setItem("alif_circle_participants", JSON.stringify(updated));
      } catch {}
    } else {
      const withoutYou = circleParticipants.filter((p) => p.type !== "you");
      const fallback = withoutYou.length ? withoutYou : [{ id: "reciter-1", type: "reciter", reciterId: reciter1 }];
      setCircleParticipants(fallback);
      try {
        localStorage.setItem("alif_circle_participants", JSON.stringify(fallback));
      } catch {}
    }
  };

  const addCircleSlot = () => {
    if (circleParticipants.length >= 4) return;
    const newId = `reciter-${Date.now()}`;
    const updated = [...circleParticipants, { id: newId, type: "reciter", reciterId: reciter2 }];
    setCircleParticipants(updated);
    try {
      localStorage.setItem("alif_circle_participants", JSON.stringify(updated));
    } catch {}
  };

  const removeCircleSlot = (id) => {
    if (circleParticipants.length <= 1) return;
    const updated = circleParticipants.filter((p) => p.id !== id);
    setCircleParticipants(updated);
    try {
      localStorage.setItem("alif_circle_participants", JSON.stringify(updated));
    } catch {}
  };

  const updateCircleReciter = (id, newReciterId) => {
    const updated = circleParticipants.map((p) =>
      p.id === id ? { ...p, reciterId: newReciterId } : p
    );
    setCircleParticipants(updated);
    try {
      localStorage.setItem("alif_circle_participants", JSON.stringify(updated));
    } catch {}
  };

  const barStyle = night
    ? "border-white/10 bg-[#161a16]/95 text-slate-100"
    : "border-[#d8cfbb] bg-[#fffdf6]/95 text-[#252d25]";

  const cardBg = night ? "bg-white/5 border-white/10" : "bg-black/5 border-[#d8cfbb]/50";

  return (
    <>
      <div
        dir="ltr"
        onClick={(e) => e.stopPropagation()}
        className={`fixed inset-x-0 bottom-0 z-50 flex flex-col gap-2 border-t px-3 py-2 backdrop-blur-2xl transition-all duration-200 sm:px-6 sm:py-3 shadow-2xl ${barStyle}`}
        data-testid="mushaf-recite-dock"
      >
        {/* Top row: Ayah status, active mode & turn badge */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              {currentAyah?.numberInSurah || index + 1}
            </span>
            <span className="truncate text-xs sm:text-sm font-semibold">
              {currentAyah?.surahName || "Surah"} · Ayah {currentAyah?.numberInSurah}
            </span>

            {/* Active turn indicator badge */}
            {mode === "listen" ? (
              <span
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${
                  isSessionActive && isPlaying
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                    : "bg-muted text-muted-foreground border border-border"
                }`}
                data-testid="active-turn-pill"
              >
                <Volume2 className={`h-3 w-3 ${isSessionActive && isPlaying ? "text-emerald-500 animate-pulse" : "opacity-60"}`} />
                <span>
                  {activeReciterId === reciter1 ? r1Name : r2Name} {isSessionActive && isPlaying ? "reciting" : "(Ready)"}
                </span>
                <span className="text-[10px] opacity-70">
                  ({activeReciterId === reciter1 ? "Reciter 1" : "Reciter 2"})
                </span>
              </span>
            ) : (
              <span
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${
                  activeParticipant.type === "you"
                    ? isRecording
                      ? "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 animate-pulse"
                      : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                    : isSessionActive && isPlaying
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                    : "bg-muted text-muted-foreground border border-border"
                }`}
                data-testid="active-turn-pill"
              >
                {activeParticipant.type === "you" ? (
                  <>
                    <Mic className={`h-3 w-3 ${isRecording ? "text-red-500 animate-pulse" : "text-emerald-500"}`} />
                    <span>{isRecording ? "Listening to you..." : isSessionActive ? "Your turn" : "Your turn (Ready)"}</span>
                  </>
                ) : (
                  <>
                    <Volume2 className={`h-3 w-3 ${isSessionActive && isPlaying ? "text-amber-500 animate-pulse" : "opacity-60"}`} />
                    <span>
                      {reciters.find((r) => r.identifier === activeParticipant.reciterId)?.englishName?.split(" ")?.[0] ||
                        "Partner"}{" "}
                      {isSessionActive && isPlaying ? "reciting" : "(Ready)"}
                    </span>
                  </>
                )}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Mode Switcher: Listen Only vs Practice */}
            <div className="flex items-center rounded-full border border-border/80 bg-muted/40 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  cleanupMedia();
                  setIsSessionActive(false);
                  setMode("listen");
                }}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  mode === "listen"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="mode-listen-btn"
                title="Solo Listen Only: Reciter 1 and Reciter 2 alternate verse-by-verse automatically without mic"
              >
                <Headphones className="h-3 w-3" />
                <span>Listen Only</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  cleanupMedia();
                  setIsSessionActive(false);
                  setMode("practice");
                }}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  mode === "practice"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="mode-practice-btn"
                title="Practice: Take turns reciting alongside the reciters"
              >
                <Mic className="h-3 w-3" />
                <span>Practice</span>
              </button>
            </div>

            {/* Advanced Circle Config Trigger */}
            <button
              type="button"
              onClick={() => setCircleDialogOpen(true)}
              className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded-md border border-border/50 hover:bg-muted/50"
              title="Configure recitation circle & participants"
              data-testid="advanced-circle-btn"
            >
              <Users className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Advanced circle</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-muted-foreground hover:text-foreground"
              aria-label="Exit recite along mode"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Status preview / transcript if speaking */}
        {transcript ? (
          <div className={`rounded-xl border px-3 py-1 text-right font-arabic text-sm ${cardBg}`} dir="rtl">
            <span className="text-emerald-500 dark:text-emerald-400">{transcript}</span>
          </div>
        ) : audioError ? (
          <p className="text-xs text-red-500 text-center">{audioError}</p>
        ) : null}

        {/* Main Control Row: Dual Reciter Pickers & Playback Controls */}
        <div className="flex items-center justify-between gap-2">
          {/* Left: Previous / Next Ayah */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={prevAyah}
              disabled={index <= 0}
              className="rounded-full p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Previous Ayah"
              data-testid="recite-dock-prev"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={nextAyah}
              disabled={index >= ayahs.length - 1}
              className="rounded-full p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Next Ayah"
              data-testid="recite-dock-next"
            >
              <SkipForward className="h-4 w-4" />
            </button>
          </div>

          {/* Center: Side-by-Side Dual Reciter Pickers & Playback Button */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-center">
            {/* Reciter 1 Selector Pill */}
            <Popover open={reciter1Open} onOpenChange={setReciter1Open}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors shrink-0 ${
                    activeReciterId === reciter1
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold ring-1 ring-emerald-500/30"
                      : "border-border hover:bg-muted text-foreground"
                  }`}
                  title="Reciter 1 (Primary)"
                  data-testid="reciter-1-pill"
                >
                  <User className="h-3 w-3 text-emerald-500" />
                  <span className="max-w-[85px] sm:max-w-[110px] truncate">
                    1: {r1Name}
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="w-64 p-1.5 max-h-72 overflow-y-auto" data-testid="reciter-1-menu">
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/50 mb-1">
                  Choose Reciter 1
                </div>
                {reciters.map((r) => (
                  <button
                    key={r.identifier}
                    onClick={() => {
                      setReciter1(r.identifier);
                      setReciter(r.identifier);
                      setReciter1Open(false);
                    }}
                    className={`flex w-full items-center justify-between px-2.5 py-1.5 rounded-md text-xs text-left transition-colors ${
                      reciter1 === r.identifier
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold"
                        : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <span className="truncate">{r.englishName}</span>
                    {reciter1 === r.identifier && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 ml-1 text-emerald-500" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            <ArrowRightLeft className="h-3 w-3 text-muted-foreground opacity-60 hidden xs:block" />

            {/* Reciter 2 Selector Pill */}
            <Popover open={reciter2Open} onOpenChange={setReciter2Open}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors shrink-0 ${
                    activeReciterId === reciter2
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold ring-1 ring-emerald-500/30"
                      : "border-border hover:bg-muted text-foreground"
                  }`}
                  title="Reciter 2 (Alternating Companion)"
                  data-testid="reciter-2-pill"
                >
                  <User className="h-3 w-3 text-amber-500" />
                  <span className="max-w-[85px] sm:max-w-[110px] truncate">
                    2: {r2Name}
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="w-64 p-1.5 max-h-72 overflow-y-auto" data-testid="reciter-2-menu">
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/50 mb-1">
                  Choose Reciter 2
                </div>
                {reciters.map((r) => (
                  <button
                    key={r.identifier}
                    onClick={() => {
                      setReciter2(r.identifier);
                      setReciter2Open(false);
                    }}
                    className={`flex w-full items-center justify-between px-2.5 py-1.5 rounded-md text-xs text-left transition-colors ${
                      reciter2 === r.identifier
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold"
                        : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <span className="truncate">{r.englishName}</span>
                    {reciter2 === r.identifier && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 ml-1 text-emerald-500" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Main Action Play / Recite Button */}
            {mode === "listen" ? (
              <button
                type="button"
                onClick={togglePlayback}
                className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold shadow transition-all ${
                  isSessionActive && isPlaying
                    ? "bg-amber-600 hover:bg-amber-700 text-white"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white"
                }`}
                data-testid="recite-dock-listen-toggle"
                title={isSessionActive && isPlaying ? "Pause recitation" : "Start recitation circle"}
              >
                {isSessionActive && isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                <span>{isSessionActive && isPlaying ? "Pause" : "Listen"}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={togglePlayback}
                className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-all shadow ${
                  isRecording
                    ? "bg-red-500 text-white animate-pulse"
                    : isSessionActive && isPlaying
                    ? "bg-amber-600 hover:bg-amber-700 text-white"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white"
                }`}
                data-testid="recite-dock-practice-toggle"
                title={
                  isRecording
                    ? "Stop recording"
                    : isSessionActive && isPlaying
                    ? "Pause audio"
                    : activeParticipant.type === "you"
                    ? "Start reciting"
                    : "Play circle"
                }
              >
                {isRecording ? (
                  <MicOff className="h-3.5 w-3.5" />
                ) : isSessionActive && isPlaying ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : activeParticipant.type === "you" ? (
                  <Mic className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                <span>
                  {isRecording
                    ? "Listening..."
                    : isSessionActive && isPlaying
                    ? "Pause"
                    : activeParticipant.type === "you"
                    ? "Recite Now"
                    : "Play Circle"}
                </span>
              </button>
            )}
          </div>

          {/* Right: Reset / Replay */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                cleanupMedia();
                if (mode === "listen") {
                  setIsSessionActive(true);
                  playAyahAudio(activeReciterId, index);
                } else {
                  setTranscript("");
                  if (activeParticipant.type === "reciter") {
                    setIsSessionActive(true);
                    playAyahAudio(activeParticipant.reciterId, index);
                  }
                }
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1"
              title={mode === "listen" ? "Replay active verse" : "Clear transcript"}
            >
              title={mode === "listen" ? "Replay active verse" : "Clear transcript"}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{mode === "listen" ? "Replay" : "Clear"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Advanced Recitation Circle Configuration Modal */}
      <Dialog open={circleDialogOpen} onOpenChange={setCircleDialogOpen}>
        <DialogContent className="max-w-md" data-testid="advanced-circle-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-heading">
              <Users className="h-5 w-5 text-emerald-500" />
              Advanced Recitation Circle
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Configure your circle participants. Choose whether to recite or let reciters alternate automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Toggle "You" ON/OFF */}
            <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                  <Mic className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">Include Your Voice ("You")</p>
                  <p className="text-[11px] text-muted-foreground">
                    Turn off for pure reciter-to-reciter alternating listening
                  </p>
                </div>
              </div>
              <Switch
                checked={includeUserInCircle}
                onCheckedChange={toggleUserInCircle}
                data-testid="toggle-user-voice-switch"
              />
            </div>

            {/* Participants list */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Turn Order
              </label>
              {circleParticipants.map((p, idx) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-2.5"
                  data-testid={`circle-slot-${idx}`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {idx + 1}
                  </span>

                  {p.type === "you" ? (
                    <div className="flex flex-1 items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                        <Mic className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">You (Your Voice)</p>
                        <p className="text-[11px] text-muted-foreground">Hands-free speech detection</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-1 items-center gap-2 min-w-0">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
                        <Volume2 className="h-3.5 w-3.5" />
                      </span>
                      <Select
                        value={p.reciterId || reciter1}
                        onValueChange={(val) => updateCircleReciter(p.id, val)}
                      >
                        <SelectTrigger className="h-8 flex-1 text-xs">
                          <SelectValue placeholder="Choose reciter" />
                        </SelectTrigger>
                        <SelectContent className="max-h-56">
                          {reciters.map((r) => (
                            <SelectItem key={r.identifier} value={r.identifier}>
                              {r.englishName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {circleParticipants.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (p.type === "you") {
                          toggleUserInCircle(false);
                        } else {
                          removeCircleSlot(p.id);
                        }
                      }}
                      className="rounded-full p-1 text-muted-foreground hover:text-red-500 transition-colors"
                      title="Remove participant"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {circleParticipants.length < 4 && (
              <button
                type="button"
                onClick={addCircleSlot}
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline px-1 py-1"
                data-testid="add-circle-participant-btn"
              >
                <Plus className="h-3.5 w-3.5" /> Add Another Reciter
              </button>
            )}

            {/* Alternating explanation */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span>Verse-by-Verse Alternating</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Verses automatically advance across the page as each participant completes. No pass mark or grading required.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => {
                setCircleDialogOpen(false);
                if (!includeUserInCircle) {
                  setMode("listen");
                }
                setIsSessionActive(true);
                if (mode === "listen" || !includeUserInCircle) {
                  playAyahAudio(activeReciterId, index);
                } else {
                  if (activeParticipant.type === "reciter") {
                    playAyahAudio(activeParticipant.reciterId, index);
                  } else {
                    startRecording();
                  }
                }
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-emerald-700 transition-colors"
              data-testid="start-circle-mushaf-btn"
            >
              <Play className="h-4 w-4" /> Start in Mushaf Mode
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
