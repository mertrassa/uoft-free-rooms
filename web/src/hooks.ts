import { useCallback, useEffect, useState } from "react";
import { DEFAULT_FILTERS, SIZES, type Filters, type Size } from "./availability";

const STAR_KEY = "freerooms:starred";
// Also read by the inline script in index.html, which applies it before first paint.
const THEME_KEY = "freerooms:theme";

export type Theme = "system" | "light" | "dark";

/** "system" follows the OS setting; light/dark override it via <html data-theme>. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const t = localStorage.getItem(THEME_KEY);
      return t === "light" || t === "dark" ? t : "system";
    } catch {
      return "system";
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try {
      if (theme === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, theme);
    } catch {
      // storage blocked: the choice lasts for this visit only
    }
  }, [theme]);
  return [theme, setTheme];
}

/** Starred buildings ("BA") and rooms ("BA 1200"), kept in this browser only. */
export function useStarred(): [Set<string>, (key: string) => void] {
  const [starred, setStarred] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(STAR_KEY) ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const toggle = useCallback((key: string) => {
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(STAR_KEY, JSON.stringify([...next]));
      } catch {
        // storage blocked: stars last for this visit only
      }
      return next;
    });
  }, []);
  return [starred, toggle];
}

export interface UrlState {
  date: string | null;
  minute: number | null;
  filters: Filters;
  query: string;
  demo: boolean;
}

export function readUrl(search = window.location.search): UrlState {
  const p = new URLSearchParams(search);
  const t = p.get("t");
  const size = p.get("size") as Size | null;
  const date = p.get("date");
  return {
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    minute: t && /^\d{1,2}:\d{2}$/.test(t) ? Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]) : null,
    filters: {
      minFor: Number(p.get("for")) || DEFAULT_FILTERS.minFor,
      size: size && Object.hasOwn(SIZES, size) ? size : DEFAULT_FILTERS.size,
      tables: p.get("tables") === "1",
      starredOnly: p.get("starred") === "1",
      dept: p.get("labs") === "1",
    },
    query: p.get("q") ?? "",
    demo: p.get("demo") === "1",
  };
}

export function writeUrl(s: UrlState) {
  const p = new URLSearchParams();
  if (s.demo) p.set("demo", "1");
  if (s.date) p.set("date", s.date);
  if (s.minute != null) {
    p.set("t", `${Math.floor(s.minute / 60)}:${String(s.minute % 60).padStart(2, "0")}`);
  }
  if (s.filters.minFor) p.set("for", String(s.filters.minFor));
  if (s.filters.size !== "any") p.set("size", s.filters.size);
  if (s.filters.tables) p.set("tables", "1");
  if (s.filters.starredOnly) p.set("starred", "1");
  if (s.filters.dept) p.set("labs", "1");
  if (s.query) p.set("q", s.query);
  const qs = p.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}
