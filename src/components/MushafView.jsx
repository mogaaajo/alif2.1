import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const toArabicNum = (n) => String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);

const MushafView = ({ ayahs, surah, surahNumber, arabicSize, currentIndex, onPlay }) => {
  const touchX = useRef(null);
  const navigate = useNavigate();
  const [selected, setSelected] = useState(-1);

  const onTouchStart = (e) => {
    touchX.current = e.changedTouches[0].clientX;
  };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 80) return;
    // RTL mushaf: swipe right → next surah, swipe left → previous surah
    if (dx > 0 && surahNumber < 114) navigate(`/surah/${surahNumber + 1}`);
    else if (dx < 0 && surahNumber > 1) navigate(`/surah/${surahNumber - 1}`);
  };

  // two-tap: first tap selects the ayah, second tap on it starts playback
  const handleTap = (i) => {
    if (selected === i) {
      setSelected(-1);
      onPlay(i);
    } else {
      setSelected(i);
    }
  };

  return (
    <div data-testid="mushaf-view" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Surah ornamental header */}
      <div className="relative mb-8 overflow-hidden rounded-xl border-2 border-primary/40 bg-accent/25 px-6 py-3 text-center">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-primary/40">۞</span>
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-primary/40">۞</span>
        <p className="font-arabic text-2xl text-primary" dir="rtl">
          {surah?.name || surah?.englishName}
        </p>
      </div>

      {![1, 9].includes(Number(surahNumber)) && (
        <p className="font-arabic mb-8 text-center text-3xl leading-loose text-foreground" dir="rtl">
          بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
        </p>
      )}

      <p
        className="font-arabic text-right text-foreground"
        dir="rtl"
        style={{ fontSize: `${arabicSize}px`, lineHeight: 2.3, direction: "rtl", unicodeBidi: "plaintext", textAlign: "justify", textAlignLast: "center", textJustify: "inter-word", wordSpacing: "normal", letterSpacing: "normal" }}
        data-testid="mushaf-text"
      >
        {ayahs.map((a, i) => (
          <React.Fragment key={a.numberInSurah}>
            <span
              onClick={() => handleTap(i)}
              data-testid={`mushaf-ayah-${a.numberInSurah}`}
              className={`cursor-pointer rounded-md [box-decoration-break:clone] [-webkit-box-decoration-break:clone] transition-colors duration-300 ${
                currentIndex === i
                  ? "bg-accent/70 text-foreground"
                  : selected === i
                  ? "bg-primary/15 text-foreground ring-1 ring-primary/40"
                  : "hover:bg-accent/30"
              }`}
            >
              {a.arabic}
            </span>
            {selected === i && currentIndex !== i && (
              <button
                onClick={() => handleTap(i)}
                className="mx-1 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 align-middle font-sans text-[11px] font-medium text-primary-foreground"
                data-testid={`mushaf-play-${a.numberInSurah}`}
              >
                ▶ Play
              </button>
            )}{" "}
            <span
              className="mx-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-primary/40 bg-card align-middle font-sans text-xs font-semibold text-primary"
              data-testid={`mushaf-marker-${a.numberInSurah}`}
            >
              {toArabicNum(a.numberInSurah)}
            </span>{" "}
          </React.Fragment>
        ))}
      </p>
    </div>
  );
};

export default MushafView;
