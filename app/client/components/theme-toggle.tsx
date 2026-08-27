"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "color-theme";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(STORAGE_KEY);
    const initialTheme: Theme = storedTheme === "light" ? "light" : "dark";

    applyTheme(initialTheme);
    // localStorageはクライアントでのみ参照できるため、マウント後に同期する
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(initialTheme);
  }, []);

  function selectTheme(nextTheme: Theme) {
    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  }

  return (
    <div
      role="group"
      aria-label="カラーテーマ"
      className="grid h-9 shrink-0 grid-cols-2 border border-[var(--theme-border)] bg-[var(--theme-surface-deep)] p-0.5"
    >
      {(["light", "dark"] as const).map((option) => {
        const selected = theme === option;

        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => selectTheme(option)}
            className={`min-w-[62px] cursor-pointer px-2 text-xs font-bold transition-colors ${
              selected
                ? "bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)]"
                : "text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
            }`}
          >
            {option === "light" ? "ライト" : "ダーク"}
          </button>
        );
      })}
    </div>
  );
}
