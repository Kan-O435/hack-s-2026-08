"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { cringeColor, type RoomResultResponse } from "@/lib/rooms";

const POLL_INTERVAL_MS = 2000;

export default function ResultPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<RoomResultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playingUserId, setPlayingUserId] = useState<number | null>(null);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }

    let cancelled = false;

    async function poll() {
      const res = await apiFetch(`/api/v1/rooms/${params.id}/result`, auth!.token);

      if (cancelled) return;

      if (!res.ok) {
        setError("結果の取得に失敗しました");
        return;
      }

      const body: RoomResultResponse = await res.json();
      setData(body);
    }

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [params.id, router]);

  async function playVoiceRoast(userId: number) {
    const auth = getAuth();
    if (!auth || playingUserId !== null) return;

    setPlayingUserId(userId);
    try {
      const res = await apiFetch(`/api/v1/rooms/${params.id}/voice_roast/${userId}`, auth.token);
      if (!res.ok) {
        setPlayingUserId(null);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => setPlayingUserId(null);
      audio.onerror = () => setPlayingUserId(null);
      await audio.play();
    } catch {
      setPlayingUserId(null);
    }
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center bg-white p-6">
        <p className="border border-black p-4 text-black">{error}</p>
      </div>
    );
  }

  if (!data || data.status === "processing") {
    return (
      <div className="flex flex-1 items-center justify-center bg-white p-6">
        <p className="border border-black p-4 text-black">採点中です。しばらくお待ちください...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 bg-white p-6">
      <header className="flex items-center justify-between border border-black p-4">
        <p className="text-black">{data.room.name}</p>
        <Link href="/home" className="border border-black bg-white px-3 py-1 text-sm text-black">
          ホームに戻る
        </Link>
      </header>

      {data.results.map((result, index) => (
        <section key={result.user_id} className="border border-black p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-lg font-bold text-black">
              {index + 1}位 {result.nickname}
            </h2>
            <p className="text-xl font-bold text-black">{result.total_score}点</p>
          </div>

          <p className="mb-4 text-black">{result.critique}</p>

          {result.voice_roast_status === "processing" && (
            <p className="mb-4 text-sm text-black opacity-60">🔊 本人の声で煽る音声を準備中...</p>
          )}

          {result.voice_roast_status === "ready" && (
            <button
              type="button"
              onClick={() => playVoiceRoast(result.user_id)}
              disabled={playingUserId !== null}
              className="mb-4 border border-black bg-white px-3 py-2 text-sm text-black disabled:opacity-50"
            >
              {playingUserId === result.user_id ? "▶ 再生中..." : "▶ 本人の声で聞く"}
            </button>
          )}

          {result.top_lines.length > 0 && (
            <ul className="flex flex-col gap-1">
              {result.top_lines.map((line, lineIndex) => (
                <li
                  key={lineIndex}
                  className="p-1 text-sm text-black"
                  style={{ backgroundColor: cringeColor(line.score) }}
                >
                  {line.score}点: {line.phrase}
                  {line.reason && <span className="opacity-70">({line.reason})</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
