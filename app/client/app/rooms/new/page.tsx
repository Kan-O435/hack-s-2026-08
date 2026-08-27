"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { ApiErrorBody, RoomDetail } from "@/lib/rooms";

export default function NewRoomPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }

    setSubmitting(true);

    try {
      const res = await apiFetch("/api/v1/rooms", auth.token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!res.ok) {
        const body: ApiErrorBody = await res.json().catch(() => ({}));
        setError(body.error?.message ?? "作成に失敗しました");
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
          チャットを作る
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm text-black">
              ルーム名(任意)
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              className="border border-black bg-white px-3 py-2 text-black outline-none"
              placeholder="終電後の妄想会"
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-black">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="border border-black bg-white px-3 py-2 text-black disabled:opacity-50"
          >
            {submitting ? "作成しています..." : "作成"}
          </button>
        </form>
      </div>
    </div>
  );
}
