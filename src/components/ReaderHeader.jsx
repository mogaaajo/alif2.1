import React from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Search,
  Moon,
  Sun,
  Type,
  BookOpen,
  List,
  Users,
  Brain,
} from "lucide-react";
import { surahStartPage } from "@/lib/mushafPages";

const MODES = [
  { id: "mushaf", label: "Mushaf", icon: BookOpen },
  { id: "focus", label: "Focus", icon: List },
  { id: "along", label: "Recite Along", icon: Users },
  { id: "memorize", label: "Memorize", icon: Brain },
];

export default function ReaderHeader({
  currentMode = "mushaf",
  page = 1,
  surahNumber = 1,
  surahName = "",
  juz,
  onPrevPage,
  onNextPage,
  onOpenSearch,
  onOpenSettings,
  onModeChange,
  theme = "light",
  onToggleTheme,
  visible = true,
  night = false,
}) {
  const navigate = useNavigate();

  const handleBackToHome = (e) => {
    e.stopPropagation();
    try {
      localStorage.setItem("alif_last_page", String(page || 1));
      localStorage.setItem("alif_last_surah", String(surahNumber || 1));
    } catch {}
    navigate("/");
  };

  const handleModeChange = (e, modeId) => {
    e.stopPropagation();
    if (modeId === currentMode) return;
    if (onModeChange) {
      onModeChange(modeId);
      return;
    }
    try {
      localStorage.setItem("alif_last_page", String(page || 1));
      localStorage.setItem("alif_last_surah", String(surahNumber || 1));
    } catch {}

    const targetSurah = surahNumber || 1;
    const targetPage = page || surahStartPage(targetSurah);

    if (modeId === "mushaf") {
      navigate(`/mushaf/${targetPage}`);
    } else if (modeId === "focus") {
      navigate(`/surah/${targetSurah}`);
    } else if (modeId === "along") {
      navigate(`/mushaf/${targetPage}?mode=along`);
    } else if (modeId === "memorize") {
      navigate(`/surah/${targetSurah}/memorize`);
    }
  };

  const barStyle = night
    ? "border-white/10 bg-[#161916]/95 text-slate-100"
    : "border-[#d8cfbb] bg-[#fffdf6]/95 text-[#252d25]";

  const pillStyle = night
    ? "border-white/10 bg-white/5 hover:bg-white/10 text-slate-100"
    : "border-[#d8cfbb] bg-[#f9f5e9] hover:bg-[#f1ebe0] text-[#252d25]";

  const mutedText = night ? "text-slate-400" : "text-[#596559]";
  const tabBg = night ? "bg-white/10 text-white" : "bg-black/5 text-foreground";
  const activeTabStyle = night
    ? "bg-[#202720] text-emerald-400 shadow-xs font-semibold"
    : "bg-white text-emerald-700 shadow-xs font-semibold";

  return (
    <header
      dir="ltr"
      onClick={(e) => e.stopPropagation()}
      className={`fixed inset-x-0 top-0 z-50 flex flex-col border-b backdrop-blur-2xl transition-all duration-200 ease-out ${barStyle} ${
        visible
          ? "translate-y-0 opacity-100 pointer-events-auto"
          : "-translate-y-full opacity-0 pointer-events-none"
      }`}
      data-testid="mushaf-topbar"
    >
      {/* Top Navigation Row */}
      <div className="flex h-14 w-full items-center justify-between gap-1.5 px-3 sm:px-6">
        {/* Left: Back to Surahs Browse */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleBackToHome}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${pillStyle}`}
            data-testid="reader-back-home"
            aria-label="Back to Surahs index"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="font-medium">Surahs</span>
          </button>
        </div>

        {/* Center: Interactive Pill with RTL-aligned chevrons */}
        <div
          className={`flex min-w-0 max-w-[340px] flex-1 items-center justify-between rounded-full border px-2 py-1 sm:px-3 sm:py-1.5 shadow-xs ${pillStyle}`}
          data-testid="mushaf-info-pill-container"
        >
          {/* Left Arrow: Advances forward in Quran (page + 1), mirroring Left Swipe */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNextPage && onNextPage();
            }}
            role="button"
            aria-label="Next page (forward in Quran)"
            className={`rounded-full p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${mutedText}`}
            data-testid="mushaf-next-page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* Center Info: Click to Search / Jump */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSearch && onOpenSearch();
            }}
            className="min-w-0 flex-1 px-1 text-center"
            data-testid="mushaf-info-pill"
            aria-label="Tap to search or jump to surah"
          >
            <span className="block truncate text-xs sm:text-sm font-semibold tracking-tight">
              {surahName || "Al-Qur'an"}
            </span>
            <span className={`block text-[10px] sm:text-[11px] ${mutedText}`}>
              Page {page}
              {juz ? ` · Juz ${juz}` : ""}
            </span>
          </button>

          {/* Right Arrow: Navigates backward in Quran (page - 1), mirroring Right Swipe */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPrevPage && onPrevPage();
            }}
            role="button"
            aria-label="Previous page (back toward Al-Faatiha)"
            className={`rounded-full p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${mutedText}`}
            data-testid="mushaf-prev-page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Right: Quick actions */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Search button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSearch && onOpenSearch();
            }}
            className={`rounded-full p-2 transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${mutedText}`}
            data-testid="mushaf-search-btn"
            aria-label="Search surah or page"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Theme toggle */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleTheme && onToggleTheme();
            }}
            className={`rounded-full p-2 transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${mutedText}`}
            data-testid="mushaf-theme-toggle"
            aria-label="Toggle theme"
          >
            {theme === "dark" || night ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Unified Settings Drawer Trigger */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSettings && onOpenSettings();
            }}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition-colors sm:px-3 ${pillStyle}`}
            data-testid="reader-settings-btn"
            aria-label="Settings"
          >
            <Type className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Aa</span>
          </button>
        </div>
      </div>

      {/* Segmented Mode Switcher directly below top row */}
      <div className="flex items-center justify-center border-t border-border/30 px-3 py-1 sm:py-1.5">
        <nav
          className={`inline-flex max-w-full items-center gap-0.5 sm:gap-1 rounded-xl p-0.5 sm:p-1 text-xs ${tabBg}`}
          data-testid="reading-mode-bar"
          aria-label="Reading modes"
        >
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = currentMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={(e) => handleModeChange(e, m.id)}
                className={`flex items-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-3 py-1 text-[11px] sm:text-xs transition-all ${
                  active
                    ? activeTabStyle
                    : `text-muted-foreground hover:text-foreground`
                }`}
                data-testid={`mode-tab-${m.id}`}
                aria-pressed={active}
              >
                <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
