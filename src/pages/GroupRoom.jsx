import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  Users,
  Play,
  Mic,
  Square,
  Award,
  Volume2,
  Loader2,
  Crown,
  PartyPopper,
  Trophy,
  Check,
} from "lucide-react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useSettings } from "@/context/SettingsContext";
import { getRoom, joinRoom, startRoom, advanceRoom, getSurah, submitRecitation, logPracticeActivity } from "@/lib/api";
import {
  AUTOMATED_ASSESSMENT_ENABLED,
  ASSESSMENT_UNAVAILABLE_SUMMARY,
  isVerifiedAssessment,
  getVerifiedScore,
} from "@/lib/assessment";
import { ayahKey } from "@/lib/practiceSession";
import { getUserName, setUserName, getUserId } from "@/lib/user";

const makeEventId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `group-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const resolveGroupAyahIdentity = (ayahObj, roomObj) => {
  const resolvedSurah = Number(ayahObj?.surahNumber ?? roomObj?.surah_number);
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
    surahName: ayahObj?.surahName || roomObj?.surah_name || "",
    ayahNumber: resolvedAyah,
    key: ayahKey({ surahNumber: resolvedSurah, numberInSurah: resolvedAyah }, resolvedSurah),
  };
};

const GroupRoom = () => {
  const { code } = useParams();
  const { reciter, translation } = useSettings();
  const [deviceId, setDeviceId] = useState(() => localStorage.getItem(`qr_room_${code}`));
  const [room, setRoom] = useState(null);
  const [surahData, setSurahData] = useState(null);
  const [joinName, setJoinName] = useState(getUserName());
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [turnPhase, setTurnPhase] = useState("idle"); // idle | recording | scoring | reviewed
  const [myResult, setMyResult] = useState(null);
  const pollRef = useRef(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const mountedRef = useRef(true);
  const roomRef = useRef(null);
  const deviceIdRef = useRef(deviceId);
  const attemptGenRef = useRef(0);
  const attemptRef = useRef(null);
  roomRef.current = room;
  deviceIdRef.current = deviceId;

  useEffect(() => {
    if (!deviceId) return;
    let stopped = false;
    const tick = async () => {
      try {
        const r = await getRoom(code);
        if (!stopped) setRoom(r);
      } catch {
        /* transient */
      }
    };
    tick();
    pollRef.current = setInterval(tick, 1500);
    return () => {
      stopped = true;
      clearInterval(pollRef.current);
    };
  }, [code, deviceId]);

  const isFinished = room?.status === "finished" || room?.status === "done";

  useEffect(() => {
    if ((room?.status === "active" || isFinished) && !surahData) {
      getSurah(room.surah_number, reciter, translation).then(setSurahData).catch(() => {});
    }
  }, [room?.status, room?.surah_number]); // eslint-disable-line

  const host = () => room && room.host_device === deviceId;
  const participants = room?.participants || [];
  const n = participants.length;
  const turnOwner = n ? participants[room.turn_index % n] : null;
  const myTurn = turnOwner && turnOwner.device_id === deviceId;
  const totalAyahs = surahData?.ayahs?.length || room?.total_ayahs || 0;
  const displayedAyahNumber =
    totalAyahs > 0
      ? Math.min(Math.max(1, (room?.ayah_index ?? 0) + 1), totalAyahs)
      : (room?.ayah_index ?? 0) + 1;
  const isFinalAyah = totalAyahs > 0 && (room?.ayah_index ?? 0) + 1 >= totalAyahs;
  const currentAyah = surahData?.ayahs?.[room?.ayah_index];
  const isOutOfBounds = Boolean(
    room?.status === "active" &&
      ((totalAyahs > 0 && (room?.ayah_index ?? 0) >= totalAyahs) || (surahData && !currentAyah))
  );
  const myName = () => participants.find((p) => p.device_id === deviceId)?.name || "";

  const stopStreamTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const cleanupRecording = () => {
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

  const isAttemptTurnStillValid = (attempt) => {
    const currentRoom = roomRef.current;
    const currentDevice = deviceIdRef.current;
    if (!attempt || !currentRoom || currentRoom.status !== "active") return false;
    if (currentRoom.code !== attempt.roomCode) return false;
    if (currentRoom.ayah_index !== attempt.ayahIndex) return false;
    if (currentRoom.turn_index !== attempt.turnIndex) return false;
    const pts = currentRoom.participants || [];
    const owner = pts.length ? pts[currentRoom.turn_index % pts.length] : null;
    return Boolean(owner && owner.device_id === currentDevice && currentDevice === attempt.deviceId);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupRecording();
    };
  }, []);

  useEffect(() => {
    cleanupRecording();
    setTurnPhase("idle");
    setMyResult(null);
  }, [room?.ayah_index, room?.turn_index, room?.status, myTurn]);

  const doJoin = async () => {
    if (!joinName.trim()) return toast.error("Enter your name.");
    setBusy(true);
    setUserName(joinName.trim());
    try {
      const r = await joinRoom(code, { name: joinName.trim() });
      localStorage.setItem(`qr_room_${code}`, r.device_id);
      setDeviceId(r.device_id);
      setRoom(r);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not join.");
    } finally {
      setBusy(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const start = async () => {
    setBusy(true);
    try {
      setRoom(await startRoom(code, deviceId));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not start.");
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    setBusy(true);
    try {
      setRoom(await advanceRoom(code, deviceId, {}));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Not your turn.");
    } finally {
      setBusy(false);
    }
  };

  const startRec = async () => {
    if (!myTurn || room?.status !== "active" || turnPhase !== "idle" || !currentAyah || isOutOfBounds) return;
    const gen = ++attemptGenRef.current;
    const attempt = {
      eventId: makeEventId(),
      roomCode: room.code,
      deviceId,
      turnIndex: room.turn_index,
      ayahIndex: room.ayah_index,
      identity: resolveGroupAyahIdentity(currentAyah, room),
      completed: false,
      stopping: false,
    };
    attemptRef.current = attempt;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current || gen !== attemptGenRef.current || !isAttemptTurnStillValid(attempt)) {
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
          submitScore(blob, gen, attempt);
        };
      } else {
        mr.ondataavailable = null;
        mr.onstop = () => {
          chunksRef.current = [];
          stopStreamTracks();
          submitScore(null, gen, attempt);
        };
      }
      mediaRef.current = mr;
      mr.start();
      setTurnPhase("recording");
    } catch {
      if (gen === attemptGenRef.current) {
        attemptRef.current = null;
        stopStreamTracks();
      }
      toast.error("Microphone access denied.");
    }
  };

  const stopRec = () => {
    if (turnPhase !== "recording") return;
    const mr = mediaRef.current;
    if (!mr || mr.state === "inactive" || attemptRef.current?.stopping) return;
    attemptRef.current.stopping = true;
    setTurnPhase("scoring");
    mr.stop();
  };

  const submitScore = async (blob, gen, attempt) => {
    if (!attempt || attempt.completed || gen !== attemptGenRef.current) return;
    attempt.completed = true;
    mediaRef.current = null;
    chunksRef.current = [];
    stopStreamTracks();

    if (!isAttemptTurnStillValid(attempt)) {
      if (mountedRef.current) {
        setTurnPhase("idle");
        setMyResult(null);
      }
      return;
    }

    if (!AUTOMATED_ASSESSMENT_ENABLED) {
      let summary;
      if (!attempt.identity) {
        summary =
          "Turn practice finished, but progress could not be logged because verse details were unavailable. Audio was not uploaded or stored, and automated scoring is currently unavailable.";
      } else {
        try {
          const res = await logPracticeActivity({
            user_id: getUserId(),
            kind: "group_recitation",
            room_code: attempt.roomCode,
            device_id: attempt.deviceId,
            ayah_index: attempt.ayahIndex,
            turn_index: attempt.turnIndex,
            surah_number: attempt.identity.surahNumber,
            surah_name: attempt.identity.surahName,
            ayah_number: attempt.identity.ayahNumber,
            ayah_keys: [attempt.identity.key],
            client_event_id: attempt.eventId,
          });
          if (!mountedRef.current || gen !== attemptGenRef.current || !isAttemptTurnStillValid(attempt)) return;
          if (res?.duplicate === true) {
            summary =
              "Turn practice was already recorded for this turn. Audio was not uploaded or stored, and automated scoring is currently unavailable.";
          } else if (typeof res?.xp_earned === "number" && res.xp_earned > 0) {
            summary = `Turn practice saved (+${res.xp_earned} XP). Audio was not uploaded or stored, and automated scoring is currently unavailable.`;
          } else {
            summary =
              "Turn practice saved. Audio was not uploaded or stored, and automated scoring is currently unavailable.";
          }
        } catch (err) {
          if (!mountedRef.current || gen !== attemptGenRef.current) return;
          const status = err?.response?.status;
          if (status === 400 || status === 403 || status === 404 || status === 409) {
            const rejectedMessage =
              status === 403
                ? "Practice credit could not be saved because this turn no longer belongs to you."
                : status === 404
                  ? "Practice credit could not be saved because this group room is no longer available."
                  : status === 409
                    ? "Practice credit could not be saved because this turn or session is no longer current."
                    : "Practice credit could not be saved because the turn details were invalid.";
            toast.error(rejectedMessage);
            setMyResult(null);
            setTurnPhase("idle");
            getRoom(code)
              .then((latestRoom) => {
                if (mountedRef.current) setRoom(latestRoom);
              })
              .catch(() => {});
            return;
          }
          if (!isAttemptTurnStillValid(attempt)) {
            setMyResult(null);
            setTurnPhase("idle");
            return;
          }
          summary =
            "Turn practice finished, but progress could not be saved right now. Audio was not uploaded or stored, and automated scoring is currently unavailable.";
        }
      }
      if (!mountedRef.current || gen !== attemptGenRef.current || !isAttemptTurnStillValid(attempt)) return;
      setMyResult({
        available: false,
        score_verified: false,
        score: null,
        verdict: null,
        summary,
      });
      setTurnPhase("reviewed");
      return;
    }

    try {
      const fd = new FormData();
      fd.append("audio", blob, "recitation.webm");
      fd.append("reference", currentAyah?.arabic || "");
      fd.append("surah_name", room?.surah_name || "");
      fd.append("surah_number", String(room?.surah_number || 0));
      fd.append("ayah_number", String((room?.ayah_index || 0) + 1));
      fd.append("user_id", getUserId());
      const res = await submitRecitation(fd);
      if (!mountedRef.current || gen !== attemptGenRef.current || !isAttemptTurnStillValid(attempt)) return;
      setMyResult(res);
      setTurnPhase("reviewed");
    } catch {
      if (!mountedRef.current || gen !== attemptGenRef.current) return;
      toast.error("Automated assessment is unavailable. You can still pass your turn.");
      setTurnPhase("idle");
    }
  };

  // ---- JOIN FALLBACK ----
  if (!deviceId) {
    return (
      <div>
        <Header title="Group Room" subtitle="Join the circle" />
        <main className="mx-auto max-w-md px-5 py-16 sm:px-8">
          <p className="font-heading text-3xl font-semibold text-foreground">Join room {code}</p>
          <p className="mt-2 text-sm text-muted-foreground">Enter your name to take a seat in this circle.</p>
          <Input
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            placeholder="Your name"
            className="mt-6"
            data-testid="room-join-name-input"
          />
          <Button className="mt-4 w-full rounded-full" onClick={doJoin} disabled={busy} data-testid="room-join-btn">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
            Join
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="pb-16">
      <header className="sticky top-0 z-40 glass border-b border-border bg-background/70">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <Link to="/group" data-testid="room-back-btn">
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <p className="font-heading text-2xl font-semibold text-foreground">{room?.surah_name || "Group Room"}</p>
          <button
            onClick={copyCode}
            className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-bold tracking-widest text-foreground"
            data-testid="room-code-chip"
          >
            {code} {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-8 sm:px-8">
        {!room && (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {/* LOBBY */}
        {room?.status === "lobby" && (
          <div data-testid="room-lobby">
            <div className="mb-6 rounded-2xl border border-border bg-accent/30 p-5 text-center">
              <p className="text-sm text-muted-foreground">Share this code to invite up to 5 reciters</p>
              <p className="mt-1 font-heading text-5xl font-bold tracking-[0.3em] text-primary">{code}</p>
            </div>

            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              In the circle ({participants.length})
            </p>
            <div className="space-y-3">
              {participants.map((pt, i) => (
                <div key={pt.device_id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4" data-testid={`lobby-participant-${i}`}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {pt.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 font-medium text-foreground">{pt.name}</span>
                  {pt.device_id === room.host_device && (
                    <span className="flex items-center gap-1 text-xs font-medium text-primary">
                      <Crown className="h-3.5 w-3.5" /> Host
                    </span>
                  )}
                  {pt.device_id === deviceId && <span className="text-xs text-muted-foreground">You</span>}
                </div>
              ))}
            </div>

            {host() ? (
              <Button className="mt-6 w-full rounded-full" onClick={start} disabled={busy} data-testid="room-start-btn">
                <Play className="mr-2 h-4 w-4" /> Start Reciting
              </Button>
            ) : (
              <p className="mt-6 text-center text-sm text-muted-foreground">Waiting for the host to start…</p>
            )}
          </div>
        )}

        {/* ACTIVE */}
        {room?.status === "active" && (
          <div data-testid="room-session">
            <div className="mb-6">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>{room.surah_name}</span>
                <span>
                  Ayah {displayedAyahNumber}
                  {totalAyahs > 0 ? ` of ${totalAyahs}` : ""}
                </span>
              </div>
              <Progress
                value={totalAyahs > 0 ? Math.min(100, (displayedAyahNumber / totalAyahs) * 100) : 0}
                className="h-1.5"
              />
            </div>

            <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
              {participants.map((pt) => {
                const active = turnOwner && pt.device_id === turnOwner.device_id;
                return (
                  <div
                    key={pt.device_id}
                    className={`flex items-center gap-2 rounded-full border px-4 py-2 transition-colors ${
                      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"
                    }`}
                    data-testid={`room-turn-${pt.name}`}
                  >
                    {active ? <Volume2 className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                    <span className="max-w-[110px] truncate text-xs font-medium">
                      {pt.name}
                      {pt.device_id === deviceId ? " (you)" : ""}
                    </span>
                  </div>
                );
              })}
            </div>

            {(() => {
              const lastTurnScore = getVerifiedScore(room.last_turn);
              if (!room.last_turn || lastTurnScore === null) return null;
              return (
                <div className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-border bg-accent/40 px-4 py-2 text-sm" data-testid="room-last-turn">
                  <Award className="h-4 w-4 text-primary" />
                  <span className="text-foreground">
                    <b>{room.last_turn.name}</b> scored <b>{lastTurnScore}</b>
                    {room.last_turn.verdict ? ` · ${room.last_turn.verdict}` : ""} on ayah {room.last_turn.ayah}
                  </span>
                </div>
              );
            })()}

            {!surahData ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
            ) : currentAyah && !isOutOfBounds ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key={room.ayah_index}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.3 }}
                  className="rounded-2xl border border-border bg-card px-5 py-12 sm:px-10"
                >
                  <p className="font-arabic text-center text-4xl leading-[2] text-foreground sm:text-5xl" dir="rtl">
                    {currentAyah.arabic}
                  </p>
                  {currentAyah.translation && (
                    <p className="mt-6 text-center text-sm text-muted-foreground">{currentAyah.translation}</p>
                  )}
                </motion.div>
              </AnimatePresence>
            ) : null}

            {!isOutOfBounds && (
            <div className="mt-8 flex flex-col items-center gap-4">
              {myTurn ? (
                <>
                  {turnPhase === "idle" && (
                    <>
                      <div className="flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-primary">
                        <Mic className="h-4 w-4" />
                        <span className="text-sm font-semibold">Your turn — recite aloud</span>
                      </div>
                      <div className="flex flex-wrap justify-center gap-3">
                        <Button className="rounded-full px-6" onClick={() => advance()} disabled={busy} data-testid="room-done-btn">
                          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          {isFinalAyah ? "Finish surah" : "Pass turn"}
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-full px-6"
                          onClick={startRec}
                          disabled={!currentAyah}
                          data-testid="room-record-btn"
                        >
                          <Mic className="mr-2 h-4 w-4" /> Practice aloud (mic)
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {ASSESSMENT_UNAVAILABLE_SUMMARY}
                      </p>
                    </>
                  )}
                  {turnPhase === "recording" && (
                    <>
                      <button
                        onClick={stopRec}
                        className="animate-recordpulse flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground"
                        data-testid="room-stop-btn"
                        aria-label="Stop"
                      >
                        <Square className="h-6 w-6" fill="currentColor" />
                      </button>
                      <p className="text-sm font-medium text-primary">Listening… tap to finish</p>
                    </>
                  )}
                  {turnPhase === "scoring" && (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-7 w-7 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Saving turn practice…</p>
                    </div>
                  )}
                  {turnPhase === "reviewed" && (() => {
                    const verified = isVerifiedAssessment(myResult);
                    const verifiedScore = getVerifiedScore(myResult);
                    return (
                      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-center" data-testid="room-my-review">
                        {verified && verifiedScore !== null ? (
                          <>
                            <p className="text-4xl font-bold text-foreground">{verifiedScore}</p>
                            {myResult?.verdict && (
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">{myResult.verdict}</p>
                            )}
                          </>
                        ) : (
                          <p className="text-sm font-semibold text-foreground">Automated scoring unavailable</p>
                        )}
                        <p className="mt-2 text-sm text-muted-foreground">
                          {myResult?.summary || ASSESSMENT_UNAVAILABLE_SUMMARY}
                        </p>
                        <Button className="mt-4 w-full rounded-full" onClick={() => advance()} disabled={busy} data-testid="room-pass-btn">
                          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          {isFinalAyah ? "Finish surah" : "Pass turn"}
                        </Button>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground" data-testid="room-waiting">
                  <Volume2 className="h-4 w-4 text-primary" />
                  Listening to {turnOwner?.name}…
                </p>
              )}
            </div>
            )}
          </div>
        )}

        {/* DONE / FINISHED */}
        {isFinished && (
          <div className="py-14 text-center" data-testid="room-done">
            <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <PartyPopper className="h-8 w-8" />
            </span>
            <p className="font-heading text-3xl font-semibold text-foreground">Surah complete!</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Your circle finished reciting {room.surah_name} together. May Allah accept it.
            </p>

            {(() => {
              const agg = {};
              (room.results || []).forEach((r) => {
                const verifiedScore = getVerifiedScore(r);
                if (verifiedScore === null) return;
                const k = r.name;
                if (!agg[k]) agg[k] = { name: r.name, total: 0, count: 0, best: 0 };
                agg[k].total += verifiedScore;
                agg[k].count += 1;
                agg[k].best = Math.max(agg[k].best, verifiedScore);
              });
              const board = Object.values(agg)
                .map((a) => ({ ...a, avg: Math.round(a.total / a.count) }))
                .sort((a, b) => b.avg - a.avg);
              if (board.length === 0) {
                return (
                  <p className="mt-8 text-sm text-muted-foreground">Automated scoring was not active for this session.</p>
                );
              }
              const medals = ["#F5C518", "#B8B8B8", "#CD7F32"];
              return (
                <div className="mx-auto mt-8 max-w-md text-left" data-testid="room-recap">
                  <p className="mb-3 flex items-center gap-2 font-heading text-2xl font-semibold text-foreground">
                    <Trophy className="h-5 w-5 text-primary" /> Recap
                  </p>
                  <div className="space-y-2">
                    {board.map((b, i) => (
                      <div
                        key={b.name}
                        className={`flex items-center gap-3 rounded-2xl border p-4 ${
                          i === 0 ? "border-primary/50 bg-primary/5" : "border-border bg-card"
                        }`}
                        data-testid={`recap-row-${i}`}
                      >
                        <span
                          className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold"
                          style={
                            i < 3
                              ? { background: medals[i], color: "#1C1917" }
                              : { background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }
                          }
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-foreground">{b.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {b.count} {b.count === 1 ? "ayah" : "ayahs"} · best {b.best}%
                          </p>
                        </div>
                        <span className="text-2xl font-bold text-primary">{b.avg}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <Link to="/group">
              <Button className="mt-8 rounded-full px-6">New Room</Button>
            </Link>
          </div>
        )}
      </main>
    </div>
  );
};

export default GroupRoom;
