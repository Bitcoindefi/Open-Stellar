"use client";

import { usePathname } from "next/navigation";
import { ThemeToggleNavbar } from "@/components/theme-toggle-navbar";

// The home page places the toggle in its own top-right group, next to the admin link, so a
// fixed copy there would sit on top of the sidebar tabs (desktop) or that link (mobile).
const ROUTES_WITH_INLINE_TOGGLE = new Set(["/"]);

export function FloatingThemeToggle() {
  const pathname = usePathname();
  if (pathname && ROUTES_WITH_INLINE_TOGGLE.has(pathname)) return null;
  return (
    <div style={{ position: "fixed", top: 12, right: 12, zIndex: 50 }}>
      <ThemeToggleNavbar />
    </div>
  );
}
