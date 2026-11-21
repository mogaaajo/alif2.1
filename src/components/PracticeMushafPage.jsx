import { ayahKey } from "@/lib/practiceSession";
import { BASMALA_TEXT, needsBasmalaBefore } from "@/lib/basmala";
import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import { getPageAudio } from "@/lib/api";

const toArabicNum = (n) => String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);
const dotsFor = (text = "") => "·".repeat(Math.max(4, text.trim().split(/\s+/).filter(Boolean).length * 2));

export default function PracticeMushafPage({
  page,
  reciter,
  translation,
  activeSurah,
  activeAyah,
  concealSurah = false,
  practiceKeys,
  revealedAyahs = new Set(),
}) {
  const [shownPage, setShownPage] = useState(page || 1);
  const [data, setData] = useState(null);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (page) setShownPage(page); }, [page]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setData(null);
    if (typeof getPageAudio !== "function") { setLoading(false); return undefined; }
    getPageAudio(shownPage, reciter, translation)
      .then((result) => { if (alive) setData(result); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [shownPage, reciter, translation, retry]);

  const ayahs = useMemo(() => data?.ayahs || [], [data]);
  const title = useMemo(() => {
    const names = [...new Set(ayahs.map((ayah) => ayah.surahName).filter(Boolean))];
    return names.join(" · ");
  }, [ayahs]);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card" data-testid="practice-mushaf-page">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 text-xs text-muted-foreground" dir="ltr">
        <button onClick={() => setShownPage((current) => Math.max(1, current - 1))} disabled={shownPage <= 1} className="rounded-full p-1 hover:bg-muted disabled:opacity-30" aria-label="Previous mushaf page" data-testid="practice-page-prev"><ChevronLeft className="h-4 w-4" /></button>
        <span className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /> Full mushaf page {shownPage}{title ? ` · ${title}` : ""}</span>
        <button onClick={() => setShownPage((current) => Math.min(604, current + 1))} disabled={shownPage >= 604} className="rounded-full p-1 hover:bg-muted disabled:opacity-30" aria-label="Next mushaf page" data-testid="practice-page-next"><ChevronRight className="h-4 w-4" /></button>
      </div>
      {loading ? <div className="h-72 animate-pulse bg-muted/30" data-testid="practice-page-loading" /> : ayahs.length ? (
        <div className="px-5 py-8 sm:px-10">
          <p className="font-arabic text-right text-foreground" dir="rtl" style={{ fontSize: "clamp(25px, 5vw, 38px)", lineHeight: 2.45, direction: "rtl", unicodeBidi: "plaintext", textAlign: "right" }} data-testid="practice-page-text">
            {ayahs.map((ayah) => {
              const isActive = ayah.surahNumber === activeSurah && ayah.numberInSurah === activeAyah;
              const key = ayahKey(ayah);
              const inPractice = practiceKeys ? practiceKeys.has(key) : ayah.surahNumber === activeSurah;
              const concealed = concealSurah && inPractice && !revealedAyahs.has(key);
              return <React.Fragment key={`${ayah.surahNumber}:${ayah.numberInSurah}`}>
                {ayah.numberInSurah === 1 && <span className="block text-center text-lg text-muted-foreground">﴾ {ayah.surahNameArabic || ayah.surahName} ﴿</span>}
                {needsBasmalaBefore(ayah.surahNumber, ayah.numberInSurah) && <span className="block text-center" style={{ textAlignLast: "center" }}>{BASMALA_TEXT}</span>}
                <span className={`rounded-md transition-colors ${isActive ? "bg-primary/20 ring-1 ring-primary/40" : ""} ${concealed ? "select-none tracking-widest text-muted-foreground/40" : concealed === false && inPractice && revealedAyahs.has(key) ? "text-emerald-600 dark:text-emerald-400" : ""}`} data-testid={`practice-ayah-${ayah.surahNumber}-${ayah.numberInSurah}`}>
                  {concealed ? dotsFor(ayah.arabic) : ayah.arabic}
                </span>
                <span className="mx-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-primary/40 align-middle font-sans text-[10px] text-primary">{toArabicNum(ayah.numberInSurah)}</span>{" "}
              </React.Fragment>;
            })}
          </p>
        </div>
      ) : <div className="p-8 text-center text-sm text-muted-foreground" data-testid="practice-page-unavailable">This mushaf page could not load. <button className="underline" onClick={() => setRetry((n) => n + 1)}>Retry</button></div>}
    </section>
  );
}
