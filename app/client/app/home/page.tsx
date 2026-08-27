"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearAuth, getAuth, type AuthUser } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

type RoomHistoryItem = {
  id: number;
  name: string;
  finished_at: string;
  my_total_score: number;
  my_title: string;
};

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [rooms, setRooms] = useState<RoomHistoryItem[] | null>(null);
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

    apiFetch("/api/v1/me/rooms", auth.token)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = await res.json();
        setRooms(data.rooms);
      })
      .catch(() => setError("履歴の取得に失敗しました"));
  }, [router]);

  function handleLogout() {
    clearAuth();
    router.replace("/login");
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex w-full flex-1 bg-[#171c23] text-[#f4f6f8]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <header className="flex items-center justify-between gap-4 rounded-[14px] border border-white/25 bg-[#20262e] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.18)]">
          <p className="text-[#f4f6f8]">ようこそ、{user.nickname} さん</p>
          <button
            type="button"
            onClick={handleLogout}
            className="h-10 shrink-0 cursor-pointer rounded-[10px] border border-white/30 bg-[#151a20] px-4 text-sm text-[#dce2e8] transition-colors hover:border-white/50 hover:bg-[#2a313a]"
          >
            ログアウト
          </button>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href="/rooms/join"
            className="flex min-h-32 items-center justify-center rounded-[14px] border border-white/25 bg-[#20262e] p-8 text-center font-bold text-[#7fa7c5] transition-colors hover:border-white/45 hover:bg-[#262d36]"
          >
            チャットに参加する
          </Link>
          <Link
            href="/rooms/new"
            className="flex min-h-32 items-center justify-center rounded-[14px] border border-white/25 bg-[#20262e] p-8 text-center font-bold text-[#7fa7c5] transition-colors hover:border-white/45 hover:bg-[#262d36]"
          >
            チャットを作る
          </Link>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-bold text-[#f4f6f8]">履歴</h2>

          {error && (
            <p
              role="alert"
              className="rounded-[10px] border border-[#b86f74] bg-[#2b2024] p-4 text-[#f1c4c7]"
            >
              {error}
            </p>
          )}

          {rooms && rooms.length === 0 && (
            <p className="rounded-[10px] border border-white/25 bg-[#20262e] p-4 text-[#aeb5bf]">
              まだ会話履歴はありません
            </p>
          )}

          {rooms && rooms.length > 0 && (
            <ul className="flex flex-col gap-3">
              {rooms.map((room) => (
                <li key={room.id}>
                  <Link
                    href={`/rooms/${room.id}/result`}
                    className="grid gap-2 rounded-[10px] border border-white/25 bg-[#20262e] p-4 text-[#f4f6f8] transition-colors hover:border-white/45 hover:bg-[#262d36] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4"
                  >
                    <span className="min-w-0 truncate">{room.name}</span>
                    <span className="text-[#7fa7c5]">
                      {room.my_title}（{room.my_total_score}点）
                    </span>
                    <span className="text-sm text-[#aeb5bf]">
                      {new Date(room.finished_at).toLocaleDateString("ja-JP")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
