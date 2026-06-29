"use client";

import * as React from "react";
import { Sun, Moon, Laptop } from "lucide-react";
import type { ThemeMode } from "./theme-toggle";

const STORAGE_KEY = "theme";

type ResolvedTheme = "light" | "dark";

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === "system" ? getSystemTheme() : mode;
}

function getStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  return (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) ?? "system";
}

export function ThemeToggleNavbar() {
  const [mode, setMode] = React.useState<ThemeMode>("system");

  React.useEffect(() => {
    setMode(getStoredMode());
  }, []);

  React.useEffect(() => {
    const resolved = resolveTheme(mode);
    document.documentElement.classList.toggle("dark", resolved === "dark");
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const cycle = React.useCallback(() => {
    setMode((prev) => {
      const next: ThemeMode =
        prev === "system" ? "light" : prev === "light" ? "dark" : "system";
      localStorage.setItem(STORAGE_KEY, next);
      window.dispatchEvent(
        new CustomEvent("open-stellar:theme-change", {
          detail: { mode: next },
        }),
      );
      return next;
    });
  }, []);

  const label =
    mode === "system"
      ? `Theme: system (${getSystemTheme()})`
      : `Theme: ${mode}`;
  const Icon = mode === "dark" ? Moon : mode === "light" ? Sun : Laptop;

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title="Theme (system → light → dark)"
      className="inline-flex items-center justify-center rounded-md border border-border/50 bg-background/40 p-2 text-foreground/90 hover:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
