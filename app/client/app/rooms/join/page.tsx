"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { ApiErrorBody, RoomDetail } from "@/lib/rooms";

export default function JoinRoomPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmed = passcode.trim().toUpperCase();
    if (!trimmed) {
      setError("パスコードを入力してください");
      return;
    }

    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }

    setSubmitting(true);

    try {
      const res = await apiFetch(`/api/v1/rooms/${trimmed}/join`, auth.token, {
        method: "POST",
      });

      if (!res.ok) {
        const body: ApiErrorBody = await res.json().catch(() => ({}));
        setError(body.error?.message ?? "参加に失敗しました");
        return;
      }

      const data: RoomDetail = await res.json();
      router.push(`/rooms/${data.room.id}/lobby`);
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
          チャットに参加する
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="passcode" className="text-sm text-black">
              パスコード
            </label>
            <input
              id="passcode"
              name="passcode"
              type="text"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              maxLength={6}
              className="border border-black bg-white px-3 py-2 text-black uppercase outline-none"
              placeholder="3Z6XFT"
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-black">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="border border-black bg-white px-3 py-2 text-black disabled:opacity-50"
          >
            {submitting ? "参加しています..." : "参加"}
          </button>
        </form>
      </div>
    </div>
  );
}
