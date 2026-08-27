"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getAuth, type AuthUser } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { ApiErrorBody, RoomDetail } from "@/lib/rooms";

const POLL_INTERVAL_MS = 2000;

export default function LobbyPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [detail, setDetail] = useState<RoomDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const navigatedRef = useRef(false);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    // localStorageはSSR時に読めないため、useStateの初期値ではなくここで同期する
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(auth.user);

    let cancelled = false;

    async function poll() {
      const res = await apiFetch(`/api/v1/rooms/${params.id}`, auth!.token);

      if (cancelled) return;

      if (!res.ok) {
        const body: ApiErrorBody = await res.json().catch(() => ({}));
        setError(body.error?.message ?? "ルームの取得に失敗しました");
        return;
      }

      const data: RoomDetail = await res.json();
      setDetail(data);

      if (data.room.status !== "waiting" && !navigatedRef.current) {
        navigatedRef.current = true;
        router.push(`/rooms/${data.room.id}/live`);
      }
    }

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [params.id, router]);

  async function handleStart() {
    const auth = getAuth();
    if (!auth) return;

    setStarting(true);
    try {
      const res = await apiFetch(`/api/v1/rooms/${params.id}/start`, auth.token, {
        method: "PATCH",
      });

      if (!res.ok) {
        const body: ApiErrorBody = await res.json().catch(() => ({}));
        setError(body.error?.message ?? "開始に失敗しました");
      }
    } finally {
      setStarting(false);
    }
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center bg-white p-6">
        <div className="w-full max-w-sm border border-black p-8 text-center text-black">
          <p className="mb-4">{error}</p>
          <button
            type="button"
            onClick={() => router.push("/home")}
            className="border border-black bg-white px-3 py-2 text-black"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  if (!user || !detail) {
    return null;
  }

  const isHost = detail.room.host_user_id === user.id;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 bg-white p-6">
      <div className="border border-black p-6 text-center">
        <p className="text-sm text-black">{detail.room.name}</p>
        <p className="mt-2 text-3xl font-bold tracking-widest text-black">
          {detail.room.passcode}
        </p>
        <p className="mt-1 text-xs text-black">このパスコードを共有してください</p>
      </div>

      <div className="border border-black p-4">
        <p className="mb-2 text-sm font-bold text-black">
          参加者({detail.participants.length}人)
        </p>
        <ul className="flex flex-col gap-2">
          {detail.participants.map((p) => (
            <li key={p.user_id} className="text-black">
              {p.nickname}
              {p.user_id === detail.room.host_user_id && "(ホスト)"}
            </li>
          ))}
        </ul>
      </div>

      {isHost ? (
        <button
          type="button"
          onClick={handleStart}
          disabled={starting}
          className="border border-black bg-white px-3 py-3 text-black disabled:opacity-50"
        >
          {starting ? "開始しています..." : "会話を始める"}
        </button>
      ) : (
        <p className="text-center text-sm text-black">
          ホストが開始するまでお待ちください
        </p>
      )}
    </div>
  );
}
