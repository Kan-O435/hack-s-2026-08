"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getAuth, type AuthUser } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { ChatBubbleList } from "@/components/chat-bubble-list";
import type { ApiErrorBody, RoomDetail, Utterance } from "@/lib/rooms";

export default function TranscriptPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [detail, setDetail] = useState<RoomDetail | null>(null);
  const [utterances, setUtterances] = useState<Utterance[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    // localStorageはSSR時に読めないため、useStateの初期値ではなくここで同期する
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(auth.user);

    apiFetch(`/api/v1/rooms/${params.id}`, auth.token)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data: RoomDetail = await res.json();
        setDetail(data);
      })
      .catch(() => setError("ルームの取得に失敗しました"));

    apiFetch(`/api/v1/rooms/${params.id}/utterances`, auth.token)
      .then(async (res) => {
        if (!res.ok) {
          const body: ApiErrorBody = await res.json().catch(() => ({}));
          throw new Error(body.error?.message);
        }
        const data: { utterances: Utterance[] } = await res.json();
        setUtterances(data.utterances);
      })
      .catch((e: Error) => setError(e.message || "会話の取得に失敗しました"));
  }, [params.id, router]);

  if (!user) {
    return null;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 bg-white p-6">
      <header className="flex items-center justify-between border border-black p-4">
        <p className="text-black">{detail?.room.name ?? "会話履歴"}</p>
        <div className="flex gap-2">
          <Link
            href={`/rooms/${params.id}/result`}
            className="border border-black bg-white px-3 py-1 text-sm text-black"
          >
            結果を見る
          </Link>
          <Link href="/home" className="border border-black bg-white px-3 py-1 text-sm text-black">
            ホームに戻る
          </Link>
        </div>
      </header>

      {error && <p className="border border-black p-4 text-black">{error}</p>}

      <div className="flex-1 overflow-y-auto border border-black p-4">
        {utterances === null ? (
          <p className="text-black">読み込み中...</p>
        ) : (
          <ChatBubbleList utterances={utterances} currentUserId={user.id} />
        )}
      </div>
    </div>
  );
}
