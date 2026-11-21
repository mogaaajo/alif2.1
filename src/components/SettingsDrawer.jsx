import React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BookOpen, List, Repeat, PlayCircle, Palette, Moon, Sun } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

const SCOPES = [
  { id: "single", label: "This surah only" },
  { id: "nextN", label: "Next N surahs" },
  { id: "range", label: "Range of surahs" },
  { id: "juz", label: "Full Juz" },
];

const SettingsDrawer = ({ open, onOpenChange }) => {
  const {
    theme,
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
  } = useSettings();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-md overflow-y-auto"
        data-testid="settings-drawer"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="font-heading text-3xl">Recitation Settings</SheetTitle>
          <SheetDescription>Mix & match your reciter, translation and reading size.</SheetDescription>
        </SheetHeader>

        <div className="mt-8 space-y-8">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Appearance</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => theme !== "light" && toggleTheme()}
                className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors ${
                  theme === "light" ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"
                }`}
                data-testid="settings-theme-light"
              >
                <Sun className="h-4 w-4" /> Light
              </button>
              <button
                type="button"
                onClick={() => theme !== "dark" && toggleTheme()}
                className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors ${
                  theme === "dark" ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"
                }`}
                data-testid="settings-theme-dark"
              >
                <Moon className="h-4 w-4" /> Dark
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Tajweed guidance</Label>
            <button
              type="button"
              onClick={() => setTajweedOn(!tajweedOn)}
              className={`flex w-full items-center justify-between rounded-xl border p-3.5 text-left transition-colors ${
                tajweedOn ? "border-primary bg-primary/5" : "border-border"
              }`}
              data-testid="settings-tajweed-toggle"
            >
              <span className="flex items-center gap-2.5 text-sm font-medium text-foreground">
                <Palette className="h-4 w-4 text-primary" />
                <span>Tajweed rule color highlights</span>
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tajweedOn ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {tajweedOn ? "ON" : "OFF"}
              </span>
            </button>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Reading style</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setReadingMode("list")}
                className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors ${
                  readingMode === "list" ? "border-primary bg-primary/5" : "border-border"
                }`}
                data-testid="reading-style-list"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <List className="h-4 w-4 text-primary" /> List
                </span>
                <span className="text-xs text-muted-foreground">Ayah cards with translation.</span>
              </button>
              <button
                onClick={() => setReadingMode("mushaf")}
                className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors ${
                  readingMode === "mushaf" ? "border-primary bg-primary/5" : "border-border"
                }`}
                data-testid="reading-style-mushaf"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <BookOpen className="h-4 w-4 text-primary" /> Mushaf
                </span>
                <span className="text-xs text-muted-foreground">Flowing page, swipe between surahs.</span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Reciter (Qāri)</Label>
            <Select value={reciter} onValueChange={setReciter}>
              <SelectTrigger data-testid="reciter-select">
                <SelectValue placeholder="Choose a reciter" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {reciters.map((r) => (
                  <SelectItem key={r.identifier} value={r.identifier}>
                    {r.englishName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Translation</Label>
            <Select value={translation} onValueChange={setTranslation}>
              <SelectTrigger data-testid="translation-select">
                <SelectValue placeholder="Choose a translation" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {translations.map((t) => (
                  <SelectItem key={t.identifier} value={t.identifier}>
                    {t.englishName} · {t.language.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Arabic font size</Label>
              <span className="text-sm text-muted-foreground">{arabicSize}px</span>
            </div>
            <Slider
              min={24}
              max={72}
              step={2}
              value={[arabicSize]}
              onValueChange={(v) => setArabicSize(v[0])}
              data-testid="arabic-size-slider"
            />
            <p
              className="font-arabic text-right leading-loose text-foreground"
              style={{ fontSize: `${arabicSize}px` }}
              dir="rtl"
            >
              بِسْمِ ٱللَّهِ
            </p>
          </div>

          <div className="space-y-3">
            <Label className="flex items-center gap-2 text-sm font-semibold">
              <PlayCircle className="h-4 w-4 text-primary" /> Continuous play
            </Label>
            <p className="text-xs text-muted-foreground">Default scope when you press Play on a surah.</p>
            <div className="grid grid-cols-2 gap-2">
              {SCOPES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setPlayScope(s.id)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                    playScope === s.id ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground"
                  }`}
                  data-testid={`settings-scope-${s.id}`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {playScope === "nextN" && (
              <div className="flex items-center justify-between pt-1">
                <Label className="text-sm">Number of surahs</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => setPlayNextN(Math.max(1, playNextN - 1))} data-testid="settings-nextn-minus">-</Button>
                  <span className="w-6 text-center text-sm font-semibold" data-testid="settings-nextn-value">{playNextN}</span>
                  <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => setPlayNextN(Math.min(20, playNextN + 1))} data-testid="settings-nextn-plus">+</Button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border pt-3">
              <Label className="flex items-center gap-2 text-sm"><Repeat className="h-4 w-4 text-primary" /> Repeat each ayah</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => setRepeatEach(Math.max(1, repeatEach - 1))} data-testid="settings-repeat-minus">-</Button>
                <span className="w-6 text-center text-sm font-semibold" data-testid="settings-repeat-value">{repeatEach}×</span>
                <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => setRepeatEach(Math.min(10, repeatEach + 1))} data-testid="settings-repeat-plus">+</Button>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default SettingsDrawer;
