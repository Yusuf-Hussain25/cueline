"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

const KEY = "cueline-theme";
type Theme = "light" | "dark";

const listeners = new Set<() => void>();
const current = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function ThemeToggle() {
  // Light is the default; the inline script in layout.tsx applies a saved dark choice before paint
  const theme = useSyncExternalStore(subscribe, current, () => "light" as Theme);

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
      {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
