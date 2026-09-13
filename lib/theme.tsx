"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Light / dark theme for the dashboard.
 *
 * The choice is stamped as `data-theme` on <html> and persisted in
 * localStorage. `globals.css` swaps the colour tokens under
 * `[data-theme="dark"]`, so every page picks the theme up without per-page
 * work. `ThemeScript` (in the root layout) applies the stored value before
 * first paint so a dark-mode user never sees a white flash.
 */

export type Theme = "light" | "dark";

const STORAGE_KEY = "mobly_admin_theme";

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

function readStored(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

function apply(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  document.documentElement.style.colorScheme = t;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Match what ThemeScript already stamped so hydration doesn't flip it.
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document !== "undefined") {
      const cur = document.documentElement.getAttribute("data-theme");
      if (cur === "dark" || cur === "light") return cur;
    }
    return readStored() ?? "light";
  });

  useEffect(() => {
    apply(theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* private mode etc. — the in-memory value still works */
    }
  }, []);

  const toggle = useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [theme, setTheme],
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/**
 * Inline, render-blocking snippet for <head>: reads the stored theme (falling
 * back to the OS preference) and stamps it on <html> before any CSS paints.
 */
export function ThemeScript() {
  const code = `(function(){try{var k="${STORAGE_KEY}",v=localStorage.getItem(k);if(v!=="dark"&&v!=="light"){v=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",v);document.documentElement.style.colorScheme=v}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
