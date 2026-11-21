import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Play, Pause, SkipBack, SkipForward, SlidersHorizontal, Gauge, Waves, Radio, X as XIcon, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { API } from "@/lib/api";
import { preloadAudio } from "@/lib/preload";
import { Input } from "@/components/ui/input";
import { Bookmark } from "lucide-react";
import { usePlayback } from "@/context/PlaybackContext";
import { useSettings } from "@/context/SettingsContext";

const proxied = (url) => `${API}/audio-proxy?url=${encodeURIComponent(url)}`;

const PRESETS = [
  { name: "Clean", speed: 1, echo: 0, reverb: 0 },
  { name: "Masjid", speed: 1, echo: 0.15, reverb: 0.78 },
  { name: "Cassette", speed: 0.95, echo: 0.28, reverb: 0.12 },
  { name: "Slow Study", speed: 0.7, echo: 0, reverb: 0.25 },
];

const makeImpulseResponse = (ctx, duration = 2.4, decay = 2.6) => {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * duration);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
};

const StickyAudioPlayer = () => {
  const { queue, index, current, isPlaying, setIsPlaying, next, prev, clear, scopeLabel } = usePlayback();
  const { repeatEach } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();

  const audioRef = useRef(null);
  const ctxRef = useRef(null);
  const nodesRef = useRef(null);
  const repeatCountRef = useRef(0);
  const playbackVersionRef = useRef(0);
  const loadedItemRef = useRef(null);
  const [playbackError, setPlaybackError] = useState("");
  const [effects, setEffects] = useState({ speed: 1, echo: 0, reverb: 0 });
  const [customPresets, setCustomPresets] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("qr_custom_presets") || "[]");
    } catch {
      return [];
    }
  });
  const [presetName, setPresetName] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);

  const persistPresets = (list) => {
    setCustomPresets(list);
    localStorage.setItem("qr_custom_presets", JSON.stringify(list));
  };
  const saveCurrentPreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const list = [...customPresets.filter((p) => p.name !== name), { name, ...effects }];
    persistPresets(list);
    setPresetName("");
    setSavingPreset(false);
  };
  const deletePreset = (name) => persistPresets(customPresets.filter((p) => p.name !== name));

  const ensureGraph = () => {
    if (ctxRef.current || !audioRef.current) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      const source = ctx.createMediaElementSource(audioRef.current);
      const dry = ctx.createGain();
      dry.gain.value = 1;
      const delay = ctx.createDelay(2.0);
      delay.delayTime.value = 0.3;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.35;
      const echoGain = ctx.createGain();
      echoGain.gain.value = 0;
      const convolver = ctx.createConvolver();
      convolver.buffer = makeImpulseResponse(ctx);
      const reverbGain = ctx.createGain();
      reverbGain.gain.value = 0;

      source.connect(dry).connect(ctx.destination);
      source.connect(delay);
      delay.connect(feedback).connect(delay);
      delay.connect(echoGain).connect(ctx.destination);
      source.connect(convolver);
      convolver.connect(reverbGain).connect(ctx.destination);

      ctxRef.current = ctx;
      nodesRef.current = { echoGain, reverbGain };
    } catch (e) {
      /* MediaElementSource can only be created once; ignore */
    }
  };

  // load + play current item
  useEffect(() => {
    const el = audioRef.current;
    const version = ++playbackVersionRef.current;
    let active = true;
    const cleanup = () => { active = false; };
    if (!el) return cleanup;
    if (!current) {
      el.pause();
      el.removeAttribute("src");
      loadedItemRef.current = null;
      setPlaybackError("");
      return cleanup;
    }
    if (!current.audio) {
      el.pause();
      setIsPlaying(false);
      setPlaybackError("This ayah has no audio. Choose another reciter or skip to the next ayah.");
      return cleanup;
    }
    const src = proxied(current.audio);
    if (el.getAttribute("src") !== src) el.src = src;
    else if (loadedItemRef.current !== current) el.currentTime = 0;
    loadedItemRef.current = current;
    el.playbackRate = effects.speed;
    if (isPlaying) {
      setPlaybackError("");
      // Leave ordinary playback on the native media element. Mobile browsers can
      // continue that in the background; Web Audio is only needed for effects.
      if (effects.echo > 0 || effects.reverb > 0) {
        ensureGraph();
        if (ctxRef.current && ctxRef.current.state === "suspended") ctxRef.current.resume().catch(() => {});
      }
      el.play().catch((error) => {
        if (!active || version !== playbackVersionRef.current) return;
        setIsPlaying(false);
        setPlaybackError(error.name === "NotAllowedError"
          ? "Playback needs a tap. Press Play to continue from this ayah."
          : "Audio could not start. Press Play to retry or skip to the next ayah.");
      });
    } else {
      el.pause();
    }
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, isPlaying, effects]);

  // reset repeat counter whenever the item changes
  useEffect(() => {
    repeatCountRef.current = 0;
  }, [index, queue]);

  useEffect(() => () => {
    playbackVersionRef.current++;
    ctxRef.current?.close().catch(() => {});
  }, []);

  // apply effects live
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = effects.speed;
    const n = nodesRef.current;
    if (n) {
      n.echoGain.gain.value = effects.echo;
      n.reverbGain.gain.value = effects.reverb;
    }
  }, [effects]);

  // preload upcoming items
  useEffect(() => {
    if (index < 0) return;
    const urls = queue
      .slice(index + 1, index + 7)
      .map((it) => (it.audio ? proxied(it.audio) : null))
      .filter(Boolean);
    preloadAudio(urls);
  }, [index, queue]);

  // page follows the currently-playing surah (fires only when the track's surah changes)
  const lastFollowedRef = useRef(null);
  const pathnameRef = useRef(location.pathname);
  useEffect(() => {
    pathnameRef.current = location.pathname;
  });
  useEffect(() => {
    if (!current) return;
    if (lastFollowedRef.current === current.surahNumber) return;
    const m = pathnameRef.current.match(/^\/surah\/(\d+)$/);
    if (m) {
      lastFollowedRef.current = current.surahNumber;
      if (Number(m[1]) !== current.surahNumber) navigate(`/surah/${current.surahNumber}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const onEnded = () => {
    const reps = Math.max(1, repeatEach || 1);
    if (repeatCountRef.current < reps - 1) {
      repeatCountRef.current += 1;
      const el = audioRef.current;
      if (el) {
        el.currentTime = 0;
        const version = playbackVersionRef.current;
        el.play().catch(() => {
          if (version !== playbackVersionRef.current) return;
          setIsPlaying(false);
          setPlaybackError("Audio could not repeat. Press Play to retry.");
        });
      }
      return;
    }
    repeatCountRef.current = 0;
    if (index < queue.length - 1) next();
    else setIsPlaying(false);
  };

  const set = (k, v) => setEffects((e) => ({ ...e, [k]: v }));
  const hideBar = location.pathname.startsWith("/mushaf"); // Mushaf has its own controls

  // A real media session lets mobile browsers keep this as active audio after
  // the screen is locked or the browser is sent to the background.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaSession) return;
    const session = navigator.mediaSession;
    try {
      if (!current) {
        session.metadata = null;
        session.playbackState = "none";
        return;
      }
      if (typeof MediaMetadata !== "undefined") {
        session.metadata = new MediaMetadata({
          title: current.isBasmala ? "Bismillah" : `Ayah ${current.numberInSurah}`,
          artist: current.surahName,
          album: scopeLabel || "Alif Quran",
        });
      }
      session.playbackState = isPlaying ? "playing" : "paused";
    } catch {
      // Media Session is optional; the native audio element still plays.
    }
  }, [current, isPlaying, scopeLabel]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaSession) return undefined;
    const session = navigator.mediaSession;
    const seek = (seconds) => {
      const el = audioRef.current;
      if (el) el.currentTime = Math.max(0, Math.min(el.duration || Infinity, el.currentTime + seconds));
    };
    const handlers = {
      play: () => setIsPlaying(true), pause: () => setIsPlaying(false), stop: clear,
      nexttrack: next, previoustrack: prev,
      seekbackward: (details) => seek(-(details.seekOffset || 10)),
      seekforward: (details) => seek(details.seekOffset || 10),
    };
    Object.entries(handlers).forEach(([action, handler]) => {
      try { session.setActionHandler(action, handler); } catch {}
    });
    return () => Object.keys(handlers).forEach((action) => {
      try { session.setActionHandler(action, null); } catch {}
    });
  }, [clear, next, prev, setIsPlaying]);

  return (
    <>
      <audio ref={audioRef} playsInline preload="auto" onEnded={onEnded} onError={() => {
        if (!current) return;
        setIsPlaying(false);
        setPlaybackError("Audio could not load. Press Play to retry or choose another reciter.");
      }} className="sr-only" />
      {current && playbackError && <div role="alert" data-testid="playback-error" className="fixed inset-x-4 bottom-24 z-[60] rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{playbackError}</div>}
      {current && !hideBar && (
      <div
        className="fixed inset-x-0 bottom-0 z-40 glass border-t border-border bg-background/70"
        data-testid="sticky-audio-player"
      >
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3 sm:px-8">
        <button
          type="button"
          onClick={() => navigate(`/surah/${current.surahNumber}`)}
          className="min-w-0 flex-1 text-left"
          data-testid="player-return-to-ayah"
          aria-label={`Return to ${current.surahName}, ${current.isBasmala ? "Bismillah" : `ayah ${current.numberInSurah}`}`}
        >
          <p className="truncate text-sm font-semibold text-foreground" data-testid="player-track-title">
            {current.surahName} · {current.isBasmala ? "Bismillah" : `Ayah ${current.numberInSurah}`}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {scopeLabel ? `${scopeLabel} · ` : ""}
            {queue.length > 1 ? `${index + 1}/${queue.length}` : "Now playing"}
            {(repeatEach || 1) > 1 ? ` · repeat ${repeatEach}×` : ""}
            {effects.speed !== 1 || effects.echo > 0 || effects.reverb > 0
              ? ` · ${effects.speed}× ${effects.echo > 0 ? "echo " : ""}${effects.reverb > 0 ? "reverb" : ""}`.trimEnd()
              : ""}
          </p>
        </button>

        <div className="flex items-center gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                aria-label="Audio effects"
                data-testid="effects-btn"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" className="w-72" data-testid="effects-panel">
              <p className="mb-4 font-heading text-lg font-semibold">Listening effects</p>
              <div className="mb-5 flex flex-wrap gap-2" data-testid="effect-presets">
                {PRESETS.map((preset) => {
                  const active =
                    effects.speed === preset.speed &&
                    effects.echo === preset.echo &&
                    effects.reverb === preset.reverb;
                  return (
                    <button
                      key={preset.name}
                      onClick={() =>
                        setEffects({ speed: preset.speed, echo: preset.echo, reverb: preset.reverb })
                      }
                      data-testid={`preset-${preset.name.toLowerCase().replace(/\s/g, "-")}`}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>

              {customPresets.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2" data-testid="custom-presets">
                  {customPresets.map((p) => {
                    const active =
                      effects.speed === p.speed && effects.echo === p.echo && effects.reverb === p.reverb;
                    return (
                      <span
                        key={p.name}
                        className={`flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-medium ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-muted-foreground"
                        }`}
                      >
                        <button
                          onClick={() => setEffects({ speed: p.speed, echo: p.echo, reverb: p.reverb })}
                          data-testid={`custom-preset-${p.name}`}
                        >
                          {p.name}
                        </button>
                        <button onClick={() => deletePreset(p.name)} aria-label="Delete preset" className="opacity-60 hover:opacity-100">
                          <XIcon className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {savingPreset ? (
                <div className="mb-4 flex gap-2">
                  <Input
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveCurrentPreset()}
                    placeholder="Preset name"
                    className="h-9"
                    data-testid="preset-name-input"
                  />
                  <Button size="sm" className="rounded-full" onClick={saveCurrentPreset} data-testid="save-preset-confirm">
                    Save
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => setSavingPreset(true)}
                  className="mb-4 flex items-center gap-1.5 text-xs font-medium text-primary"
                  data-testid="save-preset-btn"
                >
                  <Bookmark className="h-3.5 w-3.5" /> Save current mix
                </button>
              )}

              <div className="space-y-5">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <Label className="flex items-center gap-2 font-medium">
                      <Gauge className="h-4 w-4 text-primary" /> Speed
                    </Label>
                    <span className="text-muted-foreground">{effects.speed.toFixed(2)}×</span>
                  </div>
                  <Slider min={0.5} max={1.5} step={0.05} value={[effects.speed]} onValueChange={(v) => set("speed", v[0])} data-testid="speed-slider" />
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <Label className="flex items-center gap-2 font-medium">
                      <Waves className="h-4 w-4 text-primary" /> Echo
                    </Label>
                    <span className="text-muted-foreground">{Math.round(effects.echo * 100)}%</span>
                  </div>
                  <Slider min={0} max={0.8} step={0.05} value={[effects.echo]} onValueChange={(v) => set("echo", v[0])} data-testid="echo-slider" />
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <Label className="flex items-center gap-2 font-medium">
                      <Radio className="h-4 w-4 text-primary" /> Reverb
                    </Label>
                    <span className="text-muted-foreground">{Math.round(effects.reverb * 100)}%</span>
                  </div>
                  <Slider min={0} max={0.9} step={0.05} value={[effects.reverb]} onValueChange={(v) => set("reverb", v[0])} data-testid="reverb-slider" />
                </div>
                <Button variant="outline" size="sm" className="w-full rounded-full" onClick={() => setEffects({ speed: 1, echo: 0, reverb: 0 })} data-testid="reset-effects-btn">
                  Reset
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <Button variant="ghost" size="icon" className="rounded-full" onClick={prev} disabled={index <= 0} data-testid="player-prev-btn" aria-label="Previous ayah">
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            className="h-11 w-11 rounded-full"
            onClick={() => setIsPlaying((p) => !p)}
            data-testid="player-play-btn"
            aria-label="Play or pause"
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full" onClick={next} disabled={index >= queue.length - 1} data-testid="player-next-btn" aria-label="Next ayah">
            <SkipForward className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="rounded-full" onClick={clear} data-testid="player-stop-btn" aria-label="Stop playback">
            <Square className="h-3.5 w-3.5 fill-current" />
          </Button>
        </div>
      </div>
    </div>
      )}
    </>
  );
};

export default StickyAudioPlayer;
