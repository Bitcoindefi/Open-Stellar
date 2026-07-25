"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Laptop } from "lucide-react";

export function ThemeToggleNavbar() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const cycle = React.useCallback(() => {
    if (!mounted) return;
    if (theme === "system") {
      setTheme("light");
    } else if (theme === "light") {
      setTheme("dark");
    } else {
      setTheme("system");
    }
  }, [theme, setTheme, mounted]);

  // Prevent layout shift / hydration mismatch
  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Theme"
        title="Theme (system → light → dark)"
        className="inline-flex items-center justify-center rounded-md border border-border/50 bg-background/40 p-2 text-foreground/90 hover:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Laptop size={18} aria-hidden="true" />
      </button>
    );
  }

  const label =
    theme === "system"
      ? "Theme: system"
      : `Theme: ${theme}`;

  let Icon = Laptop;
  if (theme === "dark") {
    Icon = Moon;
  } else if (theme === "light") {
    Icon = Sun;
  }

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

