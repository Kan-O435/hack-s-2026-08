"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearAuth, getAuth, type AuthUser } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { ThemeToggle } from "@/components/theme-toggle";

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
    <div className="flex w-full flex-1 bg-[var(--theme-page)] text-[var(--theme-text)] transition-colors">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 transition-colors">
          <p className="text-[var(--theme-text)]">
            ようこそ、{user.nickname} さん
          </p>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={handleLogout}
              className="h-10 shrink-0 cursor-pointer border border-[var(--theme-border)] bg-[var(--theme-surface-deep)] px-4 text-sm text-[var(--theme-text)] transition-colors hover:border-[var(--theme-border-strong)] hover:bg-[var(--theme-surface-hover)]"
            >
              ログアウト
            </button>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            href="/rooms/join"
            className="flex min-h-32 items-center justify-center border border-[var(--theme-border)] bg-[var(--theme-surface)] p-8 text-center font-bold text-[var(--theme-text)] transition-colors hover:border-[var(--theme-border-strong)] hover:bg-[var(--theme-surface-hover)]"
          >
            チャットに参加する
          </Link>
          <Link
            href="/rooms/new"
            className="flex min-h-32 items-center justify-center border border-[var(--theme-border)] bg-[var(--theme-surface)] p-8 text-center font-bold text-[var(--theme-text)] transition-colors hover:border-[var(--theme-border-strong)] hover:bg-[var(--theme-surface-hover)]"
          >
            チャットを作る
          </Link>
          <Link
            href="/sneer-encyclopedia"
            className="flex min-h-32 items-center justify-center border border-[var(--theme-border)] bg-[var(--theme-surface)] p-8 text-center font-bold text-[var(--theme-text)] transition-colors hover:border-[var(--theme-border-strong)] hover:bg-[var(--theme-surface-hover)]"
          >
            冷笑図鑑を見る
          </Link>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-bold text-[var(--theme-text)]">履歴</h2>

          {error && (
            <p
              role="alert"
              className="border border-[var(--theme-danger-border)] bg-[var(--theme-danger-surface)] p-4 text-[var(--theme-danger-text)]"
            >
              {error}
            </p>
          )}

          {rooms && rooms.length === 0 && (
            <p className="border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 text-[var(--theme-muted)]">
              まだ会話履歴はありません
            </p>
          )}

          {rooms && rooms.length > 0 && (
            <ul className="flex flex-col gap-3">
              {rooms.map((room) => (
                <li key={room.id}>
                  <Link
                    href={`/rooms/${room.id}/transcript`}
                    className="grid gap-2 border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 text-[var(--theme-text)] transition-colors hover:border-[var(--theme-border-strong)] hover:bg-[var(--theme-surface-hover)] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4"
                  >
                    <span className="min-w-0 truncate">{room.name}</span>
                    <span className="text-[var(--theme-text)]">
                      {room.my_title}（{room.my_total_score}点）
                    </span>
                    <span className="text-sm text-[var(--theme-muted)]">
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
