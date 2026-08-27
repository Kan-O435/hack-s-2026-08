"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";

export default function LoginPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmed = nickname.trim();
    if (!trimmed) {
      setError("ニックネームを入力してください");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/sessions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname: trimmed }),
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "ログインに失敗しました");
        return;
      }

      const data = await res.json();
      saveAuth({ token: data.token, user: data.user });
      router.push("/home");
    } catch {
      setError("サーバーに接続できませんでした");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-[var(--theme-page)] p-6 text-[var(--theme-text)] transition-colors">
      <div className="w-full max-w-[470px] border border-[var(--theme-border)] bg-[var(--theme-surface)] px-6 py-8 transition-colors sm:px-9 sm:py-9">
        <div className="mb-6 flex justify-end">
          <ThemeToggle />
        </div>

        <h1 className="mb-8 text-center text-3xl font-bold text-[var(--theme-text)]">
          ログイン
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="nickname"
              className="text-xs font-bold text-[var(--theme-text)]"
            >
              ニックネーム
            </label>
            <input
              id="nickname"
              name="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={30}
              className="h-12 border border-[var(--theme-border)] bg-[var(--theme-surface-deep)] px-3.5 text-[var(--theme-text)] outline-none transition-colors placeholder:text-[var(--theme-placeholder)] focus:border-[var(--theme-border-strong)]"
              placeholder="たろう"
              autoFocus
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-[var(--theme-danger-text)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="h-12 cursor-pointer border border-[var(--theme-border)] bg-[var(--theme-accent)] px-[18px] font-bold text-[var(--theme-accent-contrast)] transition-colors hover:bg-[var(--theme-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "はじめています..." : "はじめる"}
          </button>
        </form>
      </div>
    </div>
  );
}
