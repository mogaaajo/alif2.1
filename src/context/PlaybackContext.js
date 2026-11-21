import React, { createContext, useContext, useMemo, useState } from "react";

const PlaybackContext = createContext(null);

export const PlaybackProvider = ({ children }) => {
  const [queue, setQueue] = useState([]); // [{ surahNumber, surahName, numberInSurah, arabic, audio }]
  const [index, setIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [scopeLabel, setScopeLabel] = useState("");

  const current = index >= 0 && index < queue.length ? queue[index] : null;

  const playQueue = (items, start = 0, label = "") => {
    if (!items || !items.length) return;
    setQueue(items);
    setScopeLabel(label);
    setIndex(Math.min(Math.max(0, start), items.length - 1));
    setIsPlaying(true);
  };

  const stop = () => setIsPlaying(false);
  const toggle = () => setIsPlaying((p) => !p);
  const next = () => setIndex((i) => (i < queue.length - 1 ? i + 1 : i));
  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const jumpTo = (i) => {
    setIndex(i);
    setIsPlaying(true);
  };
  const clear = () => {
    setIsPlaying(false);
    setQueue([]);
    setIndex(-1);
    setScopeLabel("");
  };

  const value = useMemo(
    () => ({
      queue,
      index,
      isPlaying,
      current,
      scopeLabel,
      setIsPlaying,
      setIndex,
      playQueue,
      stop,
      toggle,
      next,
      prev,
      jumpTo,
      clear,
    }),
    [queue, index, isPlaying, current, scopeLabel]
  );

  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
};

export const usePlayback = () => useContext(PlaybackContext);
