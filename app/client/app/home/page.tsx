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
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 bg-white p-6">
      <header className="flex items-center justify-between border border-black p-4">
        <p className="text-black">ようこそ、{user.nickname} さん</p>
        <button
          type="button"
          onClick={handleLogout}
          className="border border-black bg-white px-3 py-1 text-sm text-black"
        >
          ログアウト
        </button>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/rooms/join"
          className="flex items-center justify-center border border-black p-8 text-center text-black"
        >
          チャットに参加する
        </Link>
        <Link
          href="/rooms/new"
          className="flex items-center justify-center border border-black p-8 text-center text-black"
        >
          チャットを作る
        </Link>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-bold text-black">履歴</h2>

        {error && <p className="border border-black p-4 text-black">{error}</p>}

        {rooms && rooms.length === 0 && (
          <p className="border border-black p-4 text-black">
            まだ会話履歴はありません
          </p>
        )}

        {rooms && rooms.length > 0 && (
          <ul className="flex flex-col gap-3">
            {rooms.map((room) => (
              <li key={room.id}>
                <Link
                  href={`/rooms/${room.id}/result`}
                  className="flex items-center justify-between gap-4 border border-black p-4 text-black"
                >
                  <span>{room.name}</span>
                  <span>
                    {room.my_title}({room.my_total_score}点)
                  </span>
                  <span>
                    {new Date(room.finished_at).toLocaleDateString("ja-JP")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
