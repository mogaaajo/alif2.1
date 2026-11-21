import React, { createContext, useContext, useLayoutEffect, useEffect, useState } from "react";
import { getReciters, getTranslations } from "../lib/api";

const SettingsContext = createContext(null);

const load = (k, def) => {
  try {
    const v = localStorage.getItem(k);
    // Older previews saved the theme as a raw string. Keep it when moving between Home and a reader route.
    if (k === "qr_theme" && (v === "light" || v === "dark")) return v;
    return v === null ? def : JSON.parse(v);
  } catch {
    return def;
  }
};

export const SettingsProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => load("qr_theme", "light"));
  const [reciter, setReciter] = useState(() => load("qr_reciter", "ar.alafasy"));
  const [translation, setTranslation] = useState(() => load("qr_translation", "en.sahih"));
  const [arabicSize, setArabicSize] = useState(() => load("qr_arabic_size", 40));
  const [readingMode, setReadingMode] = useState(() => load("qr_reading_mode", "list"));
  const [playScope, setPlayScope] = useState(() => load("qr_play_scope", "single"));
  const [playNextN, setPlayNextN] = useState(() => load("qr_play_next_n", 3));
  const [repeatEach, setRepeatEach] = useState(() => load("qr_repeat_each", 1));
  const [tajweedOn, setTajweedOn] = useState(() => load("qr_tajweed_on", false));
  const [reciters, setReciters] = useState([]);
  const [translations, setTranslations] = useState([]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    root.dataset.theme = theme;
    localStorage.setItem("qr_theme", JSON.stringify(theme));
  }, [theme]);

  useEffect(() => localStorage.setItem("qr_reciter", JSON.stringify(reciter)), [reciter]);
  useEffect(() => localStorage.setItem("qr_translation", JSON.stringify(translation)), [translation]);
  useEffect(() => localStorage.setItem("qr_arabic_size", JSON.stringify(arabicSize)), [arabicSize]);
  useEffect(() => localStorage.setItem("qr_reading_mode", JSON.stringify(readingMode)), [readingMode]);
  useEffect(() => localStorage.setItem("qr_play_scope", JSON.stringify(playScope)), [playScope]);
  useEffect(() => localStorage.setItem("qr_play_next_n", JSON.stringify(playNextN)), [playNextN]);
  useEffect(() => localStorage.setItem("qr_repeat_each", JSON.stringify(repeatEach)), [repeatEach]);
  useEffect(() => localStorage.setItem("qr_tajweed_on", JSON.stringify(tajweedOn)), [tajweedOn]);

  useEffect(() => {
    getReciters().then(setReciters).catch(() => {});
    getTranslations().then(setTranslations).catch(() => {});
  }, []);

  const toggleTheme = () => setThemeState((t) => (t === "dark" ? "light" : "dark"));

  return (
    <SettingsContext.Provider
      value={{
        theme,
        setTheme: setThemeState,
        toggleTheme,
        reciter,
        setReciter,
        translation,
        setTranslation,
        arabicSize,
        setArabicSize,
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
        reciters,
        translations,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
