import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, Square, Loader2, RotateCcw, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { submitRecitation, logPracticeActivity } from "@/lib/api";
import {
  AUTOMATED_ASSESSMENT_ENABLED,
  ASSESSMENT_UNAVAILABLE_SUMMARY,
  isVerifiedAssessment,
  getVerifiedScore,
} from "@/lib/assessment";
import { ayahKey } from "@/lib/practiceSession";
import { getUserId } from "@/lib/user";

const makeEventId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `recite-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const resolveAyahIdentity = (ayahObj, fallbackSurahNumber, fallbackSurahName) => {
  const resolvedSurah = Number(ayahObj?.surahNumber ?? fallbackSurahNumber);
  const resolvedAyah = Number(ayahObj?.numberInSurah);
  if (
    !Number.isInteger(resolvedSurah) ||
    resolvedSurah < 1 ||
    resolvedSurah > 114 ||
    !Number.isInteger(resolvedAyah) ||
    resolvedAyah < 1
  ) {
    return null;
  }
  return {
    surahNumber: resolvedSurah,
    surahName: ayahObj?.surahName || fallbackSurahName || "",
    ayahNumber: resolvedAyah,
    key: ayahKey({ surahNumber: resolvedSurah, numberInSurah: resolvedAyah }, resolvedSurah),
  };
};

const STATUS_COLORS = {
  correct: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  minor: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  wrong: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  missing: "bg-muted text-muted-foreground border-border line-through",
};

const RULE_COLORS = {
  Madd: "#537FFF",
  Qalqalah: "#DD0008",
  Ikhfa: "#9400A8",
  Idgham: "#169777",
  Ghunnah: "#FF7E1E",
};

const ScoreRing = ({ score }) => {
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color = score >= 80 ? "#10B981" : score >= 55 ? "#FF7E1E" : "#DD0008";
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" className="stroke-muted" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="8"
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-foreground">{score}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">score</span>
      </div>
    </div>
  );
};

const ReciteDialog = ({ open, onOpenChange, ayah, surahName, surahNumber }) => {
  const [phase, setPhase] = useState("idle"); // idle | recording | submitting | result
  const [result, setResult] = useState(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const mountedRef = useRef(true);
  const attemptGenRef = useRef(0);
  const attemptRef = useRef(null);

  const stopStreamTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const cleanup = () => {
    attemptGenRef.current += 1;
    attemptRef.current = null;
    if (mediaRef.current) {
      mediaRef.current.ondataavailable = null;
      mediaRef.current.onstop = null;
      if (mediaRef.current.state !== "inactive") {
        try {
          mediaRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      mediaRef.current = null;
    }
    chunksRef.current = [];
    stopStreamTracks();
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (!open) {
      cleanup();
      setPhase("idle");
      setResult(null);
    }
  }, [open]);

  const startRecording = async () => {
    if (phase !== "idle") return;
    const gen = ++attemptGenRef.current;
    const attempt = {
      eventId: makeEventId(),
      identity: resolveAyahIdentity(ayah, surahNumber, surahName),
      completed: false,
      stopping: false,
    };
    attemptRef.current = attempt;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current || gen !== attemptGenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      if (AUTOMATED_ASSESSMENT_ENABLED) {
        mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
        mr.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          chunksRef.current = [];
          stopStreamTracks();
          handleSubmit(blob, gen, attempt);
        };
      } else {
        mr.ondataavailable = null;
        mr.onstop = () => {
          chunksRef.current = [];
          stopStreamTracks();
          handleSubmit(null, gen, attempt);
        };
      }
      mediaRef.current = mr;
      mr.start();
      setPhase("recording");
    } catch (e) {
      if (gen === attemptGenRef.current) {
        attemptRef.current = null;
        stopStreamTracks();
      }
      toast.error("Microphone access denied. Please allow mic permissions.");
    }
  };

  const stopRecording = () => {
    if (phase !== "recording") return;
    const mr = mediaRef.current;
    if (!mr || mr.state === "inactive" || attemptRef.current?.stopping) return;
    attemptRef.current.stopping = true;
    setPhase("submitting");
    mr.stop();
  };

  const handleSubmit = async (blob, gen, attempt) => {
    if (!attempt || attempt.completed || gen !== attemptGenRef.current) return;
    attempt.completed = true;
    mediaRef.current = null;
    chunksRef.current = [];
    stopStreamTracks();

    if (!AUTOMATED_ASSESSMENT_ENABLED) {
      let summary;
      if (!attempt.identity) {
        summary =
          "Practice finished, but progress could not be logged because verse details were unavailable. Audio was not uploaded or stored, and automated pronunciation and Tajweed grading is currently unavailable.";
      } else {
        try {
          const res = await logPracticeActivity({
            user_id: getUserId(),
            kind: "recite_practice",
            surah_number: attempt.identity.surahNumber,
            surah_name: attempt.identity.surahName,
            ayah_number: attempt.identity.ayahNumber,
            ayah_keys: [attempt.identity.key],
            client_event_id: attempt.eventId,
          });
          if (!mountedRef.current || gen !== attemptGenRef.current) return;
          if (res?.duplicate === true) {
            summary =
              "Practice was already recorded for this attempt. Audio was not uploaded or stored, and automated pronunciation and Tajweed grading is currently unavailable.";
          } else if (typeof res?.xp_earned === "number" && res.xp_earned > 0) {
            summary = `Practice saved (+${res.xp_earned} XP). Audio was not uploaded or stored, and automated pronunciation and Tajweed grading is currently unavailable.`;
          } else {
            summary =
              "Practice saved. Audio was not uploaded or stored, and automated pronunciation and Tajweed grading is currently unavailable.";
          }
        } catch {
          if (!mountedRef.current || gen !== attemptGenRef.current) return;
          summary =
            "Practice finished, but progress could not be saved right now. Audio was not uploaded or stored, and automated pronunciation and Tajweed grading is currently unavailable.";
        }
      }
      if (!mountedRef.current || gen !== attemptGenRef.current) return;
      setResult({
        available: false,
        score_verified: false,
        score: null,
        verdict: null,
        transcription: "",
        word_feedback: [],
        tajweed_notes: [],
        summary,
      });
      setPhase("result");
      return;
    }

    try {
      const fd = new FormData();
      fd.append("audio", blob, "recitation.webm");
      fd.append("reference", ayah.arabic);
      fd.append("surah_name", surahName || "");
      fd.append("surah_number", String(surahNumber || 0));
      fd.append("ayah_number", String(ayah.numberInSurah));
      fd.append("user_id", getUserId());
      const data = await submitRecitation(fd);
      if (!mountedRef.current || gen !== attemptGenRef.current) return;
      setResult(data);
      setPhase("result");
    } catch (e) {
      if (!mountedRef.current || gen !== attemptGenRef.current) return;
      const msg = e?.response?.data?.detail || "Automated assessment is currently unavailable.";
      toast.error(typeof msg === "string" ? msg : "Automated assessment is currently unavailable.");
      setPhase("idle");
    }
  };

  const reset = () => {
    setResult(null);
    setPhase("idle");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" data-testid="recite-dialog">
        <DialogHeader className="text-left">
          <DialogTitle className="font-heading text-2xl">
            Recite Ayah {ayah.numberInSurah}
          </DialogTitle>
          <DialogDescription>
            Practice reciting this ayah aloud. Automated pronunciation &amp; Tajweed grading is currently unavailable.
          </DialogDescription>
        </DialogHeader>

        <p
          className="font-arabic my-4 rounded-xl border border-border bg-accent/30 p-5 text-center text-3xl leading-loose text-foreground"
          dir="rtl"
        >
          {ayah.arabic}
        </p>

        {phase === "idle" && (
          <Button
            className="h-14 w-full rounded-full text-base"
            onClick={startRecording}
            data-testid="start-recording-btn"
          >
            <Mic className="mr-2 h-5 w-5" /> Start Reciting
          </Button>
        )}

        {phase === "recording" && (
          <div className="flex flex-col items-center gap-4 py-2">
            <button
              onClick={stopRecording}
              className="animate-recordpulse flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground"
              data-testid="stop-recording-btn"
              aria-label="Stop recording"
            >
              <Square className="h-6 w-6" fill="currentColor" />
            </button>
            <p className="text-sm font-medium text-primary">Listening… tap to finish</p>
          </div>
        )}

        {phase === "submitting" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Saving practice…</p>
          </div>
        )}

        {phase === "result" && result && (() => {
          const verified = isVerifiedAssessment(result);
          const verifiedScore = getVerifiedScore(result);

          if (!verified || verifiedScore === null) {
            return (
              <div className="space-y-4" data-testid="feedback-unavailable">
                <div className="rounded-2xl border border-border bg-card p-5 text-center">
                  <p className="text-sm font-semibold text-foreground">
                    Automated assessment unavailable
                  </p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {result.summary || ASSESSMENT_UNAVAILABLE_SUMMARY}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full rounded-full"
                  onClick={reset}
                  data-testid="retry-recite-btn"
                >
                  <RotateCcw className="mr-2 h-4 w-4" /> Recite Again
                </Button>
              </div>
            );
          }

          return (
            <div className="space-y-5" data-testid="feedback-result">
              <div className="flex items-center gap-5 rounded-2xl border border-border bg-card p-5">
                <ScoreRing score={verifiedScore} />
                <div className="min-w-0">
                  {result.verdict && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                      <Sparkles className="h-3.5 w-3.5" /> {result.verdict}
                    </span>
                  )}
                  <p className="mt-2 text-sm text-foreground">{result.summary}</p>
                </div>
              </div>

              {result.word_feedback?.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Word breakdown
                  </p>
                  <div className="flex flex-wrap gap-2" dir="rtl">
                    {result.word_feedback.map((w, i) => (
                      <span
                        key={i}
                        className={`font-arabic rounded-lg border px-3 py-1 text-xl ${
                          STATUS_COLORS[w.status] || STATUS_COLORS.minor
                        }`}
                      >
                        {w.word}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {result.tajweed_notes?.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Tajweed notes
                  </p>
                  <div className="space-y-2">
                    {result.tajweed_notes.map((n, i) => (
                      <div key={i} className="flex gap-3 rounded-xl border border-border bg-card p-3">
                        <span
                          className="mt-1 h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: RULE_COLORS[n.rule] || "#94A3B8" }}
                        />
                        <div>
                          <p className="text-sm font-semibold text-foreground">{n.rule}</p>
                          <p className="text-sm text-muted-foreground">{n.note}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.transcription && (
                <p className="rounded-xl bg-muted/50 p-3 text-right font-arabic text-lg" dir="rtl">
                  <span className="mb-1 block text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    We heard
                  </span>
                  {result.transcription}
                </p>
              )}

              <Button variant="outline" className="w-full rounded-full" onClick={reset} data-testid="retry-recite-btn">
                <RotateCcw className="mr-2 h-4 w-4" /> Recite Again
              </Button>
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
};

export default ReciteDialog;
