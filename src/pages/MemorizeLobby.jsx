import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Search, Brain } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getSurahs } from "@/lib/api";

const MemorizeLobby = () => {
  const [surahs, setSurahs] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSurahs()
      .then(setSurahs)
      .finally(() => setLoading(false));
  }, []);

  const norm = (s = "") => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(.)\1+/g, "$1");
  const filtered = useMemo(() => {
    const q = norm(query);
    if (!q) return surahs;
    return surahs.filter(
      (s) =>
        norm(s.englishName).includes(q) ||
        norm(s.englishNameTranslation).includes(q) ||
        String(s.number) === query.trim()
    );
  }, [surahs, query]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 glass border-b border-border bg-background/70">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4 sm:px-8">
          <Link to="/" data-testid="memorize-lobby-back-btn">
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <p className="font-heading text-2xl font-semibold text-foreground">Memorize</p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-4 py-1.5 text-xs font-medium text-muted-foreground">
              <Brain className="h-3.5 w-3.5 text-primary" /> Reveal-as-you-recite
            </span>
            <h1 className="mt-4 font-heading text-4xl font-bold tracking-tight text-foreground">
              Recite from memory. Watch it appear.
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Each ayah starts hidden as dots. As you recite aloud, the words fill in letter by letter.
              Pick a surah to begin.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search surah..."
              className="pl-9"
              data-testid="memorize-surah-search"
            />
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-muted/50" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="memorize-surah-grid">
            {filtered.map((s, i) => (
              <motion.div
                key={s.number}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: Math.min(i * 0.02, 0.4) }}
              >
                <Link
                  to={`/surah/${s.number}/memorize`}
                  data-testid={`memorize-card-${s.number}`}
                  className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                    {s.number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{s.englishName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {s.englishNameTranslation} · {s.numberOfAyahs} ayahs
                    </p>
                  </div>
                  <span className="font-arabic text-2xl text-foreground/80" dir="rtl">
                    {s.name.replace("سُورَةُ ", "")}
                  </span>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default MemorizeLobby;
