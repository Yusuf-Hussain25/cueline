"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

const KEY = "cueline-theme";
type Theme = "light" | "dark";

const listeners = new Set<() => void>();

const current = (): Theme => {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
};

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  const media = window.matchMedia("(prefers-color-scheme: light)");
  media.addEventListener("change", cb);
  return () => {
    listeners.delete(cb);
    media.removeEventListener("change", cb);
  };
};

export function ThemeToggle() {
  // Server render can't know the theme; the inline script in layout.tsx already applied it
  const theme = useSyncExternalStore(subscribe, current, () => "dark" as Theme);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // private mode: the toggle still works for this visit
    }
    listeners.forEach((l) => l());
  };

  return (
    <button type="button" className="btn btn-ghost icon-btn" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title="Toggle theme">
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
