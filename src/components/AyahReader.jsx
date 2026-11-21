import React, { useState } from "react";
import { motion } from "framer-motion";
import { Play, Pause, Mic, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReciteDialog from "@/components/ReciteDialog";
import TajweedText from "@/components/TajweedText";

const AyahReader = ({ ayah, index, surahName, surahNumber, arabicSize, isActive, isPlaying, onPlay, tajweedSegments, showTajweed, onRuleClick }) => {
  const [reciteOpen, setReciteOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4 }}
      className={`rounded-2xl border px-5 py-10 transition-colors duration-300 sm:px-8 ${
        isActive ? "border-primary/50 bg-accent/40" : "border-border bg-card"
      }`}
      data-testid={`ayah-row-${ayah.numberInSurah}`}
    >
      <div className="mb-6 flex items-center justify-between">
        <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-primary/10 px-3 text-sm font-semibold text-primary">
          {surahName ? `${ayah.numberInSurah}` : ayah.numberInSurah}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant={isActive && isPlaying ? "default" : "outline"}
            size="icon"
            className="rounded-full"
            onClick={() => onPlay(index)}
            aria-label="Play ayah"
            data-testid={`play-ayah-${ayah.numberInSurah}`}
            disabled={!ayah.audio}
          >
            {isActive && isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            onClick={() => setReciteOpen(true)}
            aria-label="Recite this ayah"
            data-testid={`recite-ayah-${ayah.numberInSurah}`}
          >
            <Mic className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showTajweed && tajweedSegments ? (
        <TajweedText segments={tajweedSegments} arabicSize={arabicSize} onRuleClick={onRuleClick} />
      ) : (
        <p
          className="font-arabic text-right leading-[2] text-foreground"
          style={{ fontSize: `${arabicSize}px`, direction: "rtl", unicodeBidi: "plaintext", textAlign: "right" }}
          dir="rtl"
          data-testid={`ayah-arabic-${ayah.numberInSurah}`}
        >
          {ayah.arabic}
        </p>
      )}

      {ayah.translation && (
        <p className="mt-6 max-w-3xl text-left text-base leading-relaxed text-muted-foreground">
          {ayah.translation}
        </p>
      )}

      <ReciteDialog
        open={reciteOpen}
        onOpenChange={setReciteOpen}
        ayah={ayah}
        surahName={surahName}
        surahNumber={surahNumber}
      />
    </motion.div>
  );
};

export default AyahReader;
