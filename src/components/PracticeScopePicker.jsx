import React, { useMemo } from "react";
import { Layers, ListFilter } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const scopeInfo = {
  surah: "The whole surah",
  page: "One Mushaf page",
  range: "Choose any continuous range, such as ayahs 1–4 or 8–78",
  five: "Five ayahs from a chosen start",
};

const PracticeScopePicker = ({ ayahs = [], value, onValueChange, start, onStartChange, end, onEndChange, testid = "practice" }) => {
  const pages = useMemo(() => [...new Set(ayahs.map((ayah) => ayah.page).filter(Boolean))], [ayahs]);
  const firstAyah = ayahs[0]?.numberInSurah || 1;
  const lastAyah = ayahs[ayahs.length - 1]?.numberInSurah || firstAyah;
  const selectedEnd = Math.max(start || firstAyah, end || firstAyah);
  const chooseScope = (next) => {
    onValueChange(next);
    if (next === "page") {
      onStartChange(pages[0] || firstAyah);
      return;
    }
    onStartChange(firstAyah);
    if (next === "range") onEndChange(Math.min(lastAyah, firstAyah + 3));
  };
  const changeRangeStart = (next) => {
    const nextStart = Number(next);
    onStartChange(nextStart);
    if (nextStart > selectedEnd) onEndChange(nextStart);
  };

  return <div className="rounded-2xl border border-border bg-card p-4" data-testid={`${testid}-scope-picker`}>
    <div className="mb-3 flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /><Label className="text-sm font-semibold">Practice scope</Label></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <Select value={value} onValueChange={chooseScope}>
        <SelectTrigger data-testid={`${testid}-scope-select`}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="surah">Whole surah</SelectItem>
          <SelectItem value="page">Mushaf page</SelectItem>
          <SelectItem value="range">Custom ayah range</SelectItem>
          <SelectItem value="five">Five ayahs</SelectItem>
        </SelectContent>
      </Select>
      {value !== "surah" && value !== "range" && <Select value={String(start)} onValueChange={(next) => onStartChange(Number(next))}>
        <SelectTrigger data-testid={`${testid}-scope-start`}><SelectValue /></SelectTrigger>
        <SelectContent className="max-h-64">
          {value === "page" ? pages.map((page) => <SelectItem key={page} value={String(page)}>Page {page}</SelectItem>) : ayahs.map((ayah) => <SelectItem key={ayah.numberInSurah} value={String(ayah.numberInSurah)}>Start at ayah {ayah.numberInSurah}</SelectItem>)}
        </SelectContent>
      </Select>}
    </div>
    {value === "range" && <div className="mt-3 grid grid-cols-2 gap-3">
      <div>
        <Label className="mb-1 block text-xs text-muted-foreground">From ayah</Label>
        <Select value={String(start || firstAyah)} onValueChange={changeRangeStart}>
          <SelectTrigger data-testid={`${testid}-range-start`}><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-64">{ayahs.map((ayah) => <SelectItem key={ayah.numberInSurah} value={String(ayah.numberInSurah)}>Ayah {ayah.numberInSurah}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label className="mb-1 block text-xs text-muted-foreground">To ayah</Label>
        <Select value={String(selectedEnd)} onValueChange={(next) => onEndChange(Number(next))}>
          <SelectTrigger data-testid={`${testid}-range-end`}><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-64">{ayahs.filter((ayah) => ayah.numberInSurah >= (start || firstAyah)).map((ayah) => <SelectItem key={ayah.numberInSurah} value={String(ayah.numberInSurah)}>Ayah {ayah.numberInSurah}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>}
    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><ListFilter className="h-3.5 w-3.5" />{scopeInfo[value]}</p>
  </div>;
};

export default PracticeScopePicker;
