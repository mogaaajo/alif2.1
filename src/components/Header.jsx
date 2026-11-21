import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Moon, Sun, Settings, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/context/SettingsContext";
import SettingsDrawer from "@/components/SettingsDrawer";

export const Header = ({ title, subtitle }) => {
  const { theme, toggleTheme } = useSettings();
  const [open, setOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-40 glass border-b border-border bg-background/70"
      data-testid="app-header"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
        <Link to="/" className="flex items-center gap-3 group" data-testid="brand-link">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <BookOpen className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <p className="font-heading text-2xl font-semibold tracking-tight text-foreground">
              {title || "Tilāwah"}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            data-testid="theme-toggle-btn"
            className="rounded-full"
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label="Settings"
            data-testid="open-settings-btn"
            className="rounded-full"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <SettingsDrawer open={open} onOpenChange={setOpen} />
    </header>
  );
};

export default Header;
