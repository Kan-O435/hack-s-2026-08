"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveAuth } from "@/lib/auth";

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
    <div className="flex flex-1 items-center justify-center bg-[#171c23] p-6 text-[#f4f6f8]">
      <div className="w-full max-w-[470px] rounded-[14px] border border-white/25 bg-[#20262e] px-6 py-8 shadow-[0_18px_48px_rgba(0,0,0,0.28)] sm:px-9 sm:py-9">
        <h1 className="mb-8 text-center text-3xl font-bold text-[#f4f6f8]">
          ログイン
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="nickname"
              className="text-xs font-bold text-[#7fa7c5]"
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
              className="h-12 rounded-[10px] border border-white/30 bg-[#151a20] px-3.5 text-[#f4f6f8] outline-none transition-colors placeholder:text-[#89929e] focus:border-white/70"
              placeholder="たろう"
              autoFocus
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-[#ff6b6b]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="h-12 cursor-pointer rounded-[10px] border border-white/20 bg-[#6f98b8] px-[18px] font-bold text-[#101820] transition-colors hover:bg-[#80a7c4] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "はじめています..." : "はじめる"}
          </button>
        </form>
      </div>
    </div>
  );
}
