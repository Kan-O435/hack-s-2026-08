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
      router.push("/");
    } catch {
      setError("サーバーに接続できませんでした");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-white p-6">
      <div className="w-full max-w-sm border border-black p-8">
        <h1 className="mb-6 text-center text-xl font-bold text-black">
          ログイン
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="nickname" className="text-sm text-black">
              ニックネーム
            </label>
            <input
              id="nickname"
              name="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={30}
              className="border border-black bg-white px-3 py-2 text-black outline-none"
              placeholder="たろう"
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-black">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="border border-black bg-white px-3 py-2 text-black disabled:opacity-50"
          >
            {submitting ? "はじめています..." : "はじめる"}
          </button>
        </form>
      </div>
    </div>
  );
}
