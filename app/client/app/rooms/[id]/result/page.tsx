"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { cringeColor, type ParticipantResult, type RoomResultResponse } from "@/lib/rooms";

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
      <div className="flex flex-1 items-center justify-center bg-[var(--theme-page)] p-6 text-[var(--theme-text)]">
        <p className="border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">{error}</p>
      </div>
    );
  }

  if (!data || data.status === "processing") {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--theme-page)] p-6 text-[var(--theme-text)]">
        <p className="border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
          採点中です。しばらくお待ちください...
        </p>
      </div>
    );
  }

  const [champion, ...rest] = data.results;

  return (
    <div className="flex w-full flex-1 bg-[var(--theme-page)] text-[var(--theme-text)]">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-6">
        <header className="flex items-center justify-between border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
          <p>{data.room.name}</p>
          <Link href="/home" className="border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-1 text-sm hover:bg-[var(--theme-surface-hover)]">
            ホームに戻る
          </Link>
        </header>

        {champion && (
          <HallOfFameCard
            result={champion}
            playing={playingUserId === champion.user_id}
            disabled={playingUserId !== null}
            onPlay={() => playVoiceRoast(champion.user_id)}
          />
        )}

        {rest.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-bold text-[var(--theme-muted)]">他の参加者</h2>
            {rest.map((result, index) => (
              <ParticipantRow
                key={result.user_id}
                result={result}
                rank={index + 2}
                playing={playingUserId === result.user_id}
                disabled={playingUserId !== null}
                onPlay={() => playVoiceRoast(result.user_id)}
              />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

function HallOfFameCard({
  result,
  playing,
  disabled,
  onPlay,
}: {
  result: ParticipantResult;
  playing: boolean;
  disabled: boolean;
  onPlay: () => void;
}) {
  const topLine = result.top_lines[0];

  return (
    <section className="hall-of-fame-reveal overflow-hidden rounded-2xl border-2 border-[var(--theme-border-strong)] bg-[var(--theme-surface)]">
      {result.photo_url && (
        <div className="relative aspect-[4/3] w-full bg-black">
          <Image src={result.photo_url} alt={`${result.nickname}さんの冷笑写真`} fill unoptimized className="object-cover" />
        </div>
      )}

      <div className="flex flex-col gap-4 p-6">
        <div className="text-center">
          <p className="text-xs font-bold tracking-widest text-[var(--theme-muted)]">殿堂入り 本日の冷笑王</p>
          <h1 className="mt-1 text-2xl font-bold">{result.nickname}</h1>
          <p className="mt-2 text-5xl font-bold text-[var(--theme-text)]">{result.total_score}点</p>
        </div>

        {result.expression_bonus != null && result.expression_bonus > 0 && (
          <div className="mx-auto flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="bg-[var(--theme-accent)] px-2 py-1 font-bold text-[var(--theme-accent-contrast)]">表情+{result.expression_bonus}</span>
            {result.expression_comment && <span className="text-[var(--theme-muted)] italic">{result.expression_comment}</span>}
          </div>
        )}

        {topLine && (
          <blockquote className="border-l-4 border-[var(--theme-border-strong)] pl-3 text-lg font-bold">「{topLine.phrase}」</blockquote>
        )}

        <p className="text-center text-[var(--theme-muted)]">{result.critique}</p>

        {result.voice_roast_status === "processing" && (
          <p className="text-center text-sm text-[var(--theme-muted)]">🔊 本人の声で煽る音声を準備中...</p>
        )}

        {result.voice_roast_status === "ready" && (
          <button
            type="button"
            onClick={onPlay}
            disabled={disabled}
            className="mx-auto border-2 border-[var(--theme-border-strong)] bg-[var(--theme-surface-deep)] px-6 py-3 text-lg font-bold hover:bg-[var(--theme-surface-hover)] disabled:opacity-50"
          >
            {playing ? "▶ 再生中..." : "🔊 本人の声で聞く"}
          </button>
        )}
      </div>
    </section>
  );
}

function ParticipantRow({
  result,
  rank,
  playing,
  disabled,
  onPlay,
}: {
  result: ParticipantResult;
  rank: number;
  playing: boolean;
  disabled: boolean;
  onPlay: () => void;
}) {
  return (
    <div className="border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-bold">
          {rank}位 {result.nickname}
        </h3>
        <p className="text-xl font-bold">{result.total_score}点</p>
      </div>

      <p className="mb-4 text-[var(--theme-muted)]">{result.critique}</p>

      {result.voice_roast_status === "processing" && (
        <p className="mb-4 text-sm text-[var(--theme-muted)]">🔊 本人の声で煽る音声を準備中...</p>
      )}

      {result.voice_roast_status === "ready" && (
        <button
          type="button"
          onClick={onPlay}
          disabled={disabled}
          className="mb-4 border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2 text-sm hover:bg-[var(--theme-surface-hover)] disabled:opacity-50"
        >
          {playing ? "▶ 再生中..." : "▶ 本人の声で聞く"}
        </button>
      )}

      {result.top_lines.length > 0 && (
        <ul className="flex flex-col gap-1">
          {result.top_lines.map((line, lineIndex) => (
            <li key={lineIndex} className="p-1 text-sm text-black" style={{ backgroundColor: cringeColor(line.score) }}>
              {line.score}点: {line.phrase}
              {line.reason && <span className="opacity-70">({line.reason})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
