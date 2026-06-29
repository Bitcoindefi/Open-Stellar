"use client";

import * as React from "react";

export type ThemeMode = "light" | "dark" | "system";

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

function getInitialMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  return (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) ?? "system";
}

/**
 * Minimal theme provider that sets the `dark` class on <html>.
 * - cycles light/dark/system stored in localStorage key `theme`
 * - SSR-safe: uses a hydration-gating strategy to avoid FOUC
 */
export function ThemeProviderSimple({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mode, setMode] = React.useState<ThemeMode>(() => getInitialMode());
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    const resolved = resolveTheme(mode);
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [mode]);

  // Apply on first mount only; before that we still set in layout via inline script.
  React.useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode, mounted]);

  const value = React.useMemo(() => ({ mode, setMode }), [mode]);

  return (
    // Provide minimal context-less API by exposing setMode via custom event.
    // ThemeToggle updates localStorage + dispatches event.
    <ThemeProviderContextBridge value={value}>
      {children}
    </ThemeProviderContextBridge>
  );
}

function ThemeProviderContextBridge({
  value,
  children,
}: {
  value: {
    mode: ThemeMode;
    setMode: (m: ThemeMode | ((prev: ThemeMode) => ThemeMode)) => void;
  };
  children: React.ReactNode;
}) {
  // Listen for theme changes dispatched by ThemeToggle.
  React.useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent;
      if (!ce.detail || typeof ce.detail.mode !== "string") return;
      const next = ce.detail.mode as ThemeMode;
      value.setMode(next);
    };
    window.addEventListener(
      "open-stellar:theme-change",
      handler as EventListener,
    );
    return () =>
      window.removeEventListener(
        "open-stellar:theme-change",
        handler as EventListener,
      );
  }, [value]);

  return <>{children}</>;
}

export const THEME_INLINE_SCRIPT = `(function(){
  try {
    var key = 'theme';
    var stored = localStorage.getItem(key);
    var mode = stored || 'system';
    var dark = mode === 'dark' ? true : mode === 'light' ? false : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();`;
