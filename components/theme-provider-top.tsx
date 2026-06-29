"use client";

import * as React from "react";
import {
  ThemeProviderSimple,
  THEME_INLINE_SCRIPT,
} from "./theme-provider-simple";

export function ThemeProviderTop({ children }: { children: React.ReactNode }) {
  // Script runs before hydration only if Next inlines it in layout.
  // Kept here for ergonomics.
  return <ThemeProviderSimple>{children}</ThemeProviderSimple>;
}

export { THEME_INLINE_SCRIPT };
