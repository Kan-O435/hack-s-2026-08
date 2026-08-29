"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getAuth, type AuthUser } from "@/lib/auth";
import { buildSneerShareCard } from "@/lib/sneer-card-image";
import type { ApiErrorBody, SneerCard, SneerCardsResponse } from "@/lib/rooms";

export default function SneerEncyclopediaPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [cards, setCards] = useState<SneerCard[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [sharingId, setSharingId] = useState<number | null>(null);
  const [xSharingId, setXSharingId] = useState<number | null>(null);
  const [xShareNotice, setXShareNotice] = useState<string | null>(null);
  const [brokenIds, setBrokenIds] = useState<Set<number>>(new Set());

  async function loadCards(targetPage: number) {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/v1/me/sneer_cards?page=${targetPage}&per_page=12`, auth.token);
      if (!response.ok) throw new Error();
      const data: SneerCardsResponse = await response.json();
      setCards(data.cards);
      setPage(data.pagination.page);
      setTotalPages(data.pagination.total_pages);
    } catch {
      setError("冷笑図鑑を読み込めませんでした");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(auth.user);
    void loadCards(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleDelete(card: SneerCard) {
    if (!window.confirm("この冷笑写真を図鑑から削除しますか？")) return;
    const auth = getAuth();
    if (!auth) return;

    setDeletingId(card.id);
    setError(null);
    try {
      const response = await apiFetch(`/api/v1/utterances/${card.id}/sneer_photo`, auth.token, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body: ApiErrorBody = await response.json().catch(() => ({}));
        throw new Error(body.error?.message ?? "写真を削除できませんでした");
      }
      const targetPage = cards.length === 1 && page > 1 ? page - 1 : page;
      await loadCards(targetPage);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "写真を削除できませんでした");
    } finally {
      setDeletingId(null);
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function handleShare(card: SneerCard) {
    setSharingId(card.id);
    setError(null);
    try {
      // 写真単体ではなく、ニックネーム・引用・冷笑度まで合成した図鑑カードそのものを共有する
      const blob = await buildSneerShareCard(card);
      const file = new File([blob], `sneer-${card.id}.jpg`, { type: "image/jpeg" });
      const shareData = {
        files: [file],
        title: "冷笑図鑑",
        text: `${card.speaker.nickname}さんの冷笑「${card.utterance.cringe_phrase || card.utterance.transcript}」`,
      };

      if (navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        // Web Share非対応の環境(主にPCブラウザ)では画像をダウンロードしてもらう。
        // window.openはcanvas合成のawaitを挟んだ後だとポップアップブロックされることがあるため使わない
        downloadBlob(blob, `sneer-${card.id}.jpg`);
      }
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === "AbortError") return;
      setError(shareError instanceof Error ? shareError.message : "共有画像の作成に失敗しました");
    } finally {
      setSharingId(null);
    }
  }

  function handleShareToX(card: SneerCard) {
    const phrase = card.utterance.cringe_phrase || card.utterance.transcript;
    const scoreText = card.utterance.cringe_score != null ? `(冷笑度${card.utterance.cringe_score})` : "";
    const text = `${card.speaker.nickname}さんの冷笑「${phrase}」${scoreText} #冷笑エンジン #冷笑図鑑`;
    const intentUrl = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;

    // Xの投稿画面はテキスト/URLしか受け取れず、画像を直接添付する手段がないため、
    // 画像はクリップボードにコピーして投稿画面側で貼り付けてもらう形にする。
    // window.openはユーザー操作の直後(await前)に呼ばないとポップアップブロックされる。
    window.open(intentUrl, "_blank", "noopener,noreferrer");

    void (async () => {
      setXSharingId(card.id);
      setXShareNotice(null);
      setError(null);
      try {
        const blob = await buildSneerShareCard(card, "image/png");
        if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          setXShareNotice("画像をコピーしました。Xの投稿画面に貼り付けて(Ctrl/Cmd+V)ください");
        } else {
          downloadBlob(blob, `sneer-${card.id}.png`);
          setXShareNotice("この環境では画像を自動コピーできないため、ダウンロードしました。投稿画面に手動で添付してください");
        }
      } catch {
        setError("共有用の画像を準備できませんでした");
      } finally {
        setXSharingId(null);
      }
    })();
  }

  if (!user) return null;

  return (
    <div className="flex w-full flex-1 bg-[var(--theme-page)] text-[var(--theme-text)]">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--theme-border)] pb-4">
          <div>
            <h1 className="text-2xl font-bold">冷笑図鑑</h1>
            <p className="mt-1 text-sm text-[var(--theme-muted)]">会話中に検知された冷笑の記録</p>
          </div>
          <Link href="/home" className="border border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-2 text-sm hover:bg-[var(--theme-surface-hover)]">
            ホームに戻る
          </Link>
        </header>

        {error && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border border-[var(--theme-danger-border)] bg-[var(--theme-danger-surface)] p-4 text-[var(--theme-danger-text)]">
            <p>{error}</p>
            <button type="button" onClick={() => void loadCards(page)} className="border border-current px-3 py-1 text-sm">再読み込み</button>
          </div>
        )}

        {xShareNotice && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 border border-[var(--theme-border-strong)] bg-[var(--theme-surface)] p-4">
            <p>{xShareNotice}</p>
            <button type="button" onClick={() => setXShareNotice(null)} className="border border-current px-3 py-1 text-sm">閉じる</button>
          </div>
        )}

        {loading ? (
          <p className="border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 text-center text-[var(--theme-muted)]">図鑑を読み込んでいます...</p>
        ) : cards.length === 0 ? (
          <section className="border border-[var(--theme-border)] bg-[var(--theme-surface)] p-8 text-center">
            <h2 className="font-bold">まだ冷笑は記録されていません</h2>
            <p className="mt-2 text-sm text-[var(--theme-muted)]">冷笑が検知され、写真保存まで完了するとここに追加されます。</p>
          </section>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => {
              const capturedAt = card.snapshot_captured_at ?? card.utterance.spoken_at;
              return (
                <li key={card.id} className="overflow-hidden rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)]">
                  <div className="relative aspect-[4/3] bg-black">
                    {brokenIds.has(card.id) ? (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[var(--theme-surface-deep)] p-4 text-center text-[var(--theme-muted)]">
                        <p className="text-sm">写真が見つかりませんでした</p>
                        <p className="text-xs">サーバー側で失われている可能性があります</p>
                      </div>
                    ) : (
                      <Image
                        src={card.photo_url}
                        alt={`${card.speaker.nickname}さんの冷笑写真`}
                        fill
                        unoptimized
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover"
                        onError={() =>
                          setBrokenIds((prev) => {
                            const next = new Set(prev);
                            next.add(card.id);
                            return next;
                          })
                        }
                      />
                    )}
                  </div>
                  <div className="flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold">{card.speaker.nickname}</p>
                        <p className="truncate text-xs text-[var(--theme-muted)]">{card.room.name}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {card.utterance.cringe_score != null && (
                          <span className="bg-[#ffcc66] px-2 py-1 text-xs font-bold text-black">冷笑度 {card.utterance.cringe_score}</span>
                        )}
                        {card.expression_bonus != null && card.expression_bonus > 0 && (
                          <span className="bg-[var(--theme-accent)] px-2 py-1 text-xs font-bold text-[var(--theme-accent-contrast)]">表情+{card.expression_bonus}</span>
                        )}
                      </div>
                    </div>
                    <blockquote className="border-l-4 border-[var(--theme-border-strong)] pl-3 font-bold">「{card.utterance.cringe_phrase || card.utterance.transcript}」</blockquote>
                    {card.utterance.cringe_reason && <p className="text-sm text-[var(--theme-muted)]">{card.utterance.cringe_reason}</p>}
                    {card.expression_comment && (
                      <p className="text-sm text-[var(--theme-muted)] italic">表情: {card.expression_comment}</p>
                    )}
                    <div className="flex items-center justify-between gap-3 border-t border-[var(--theme-border)] pt-3">
                      <time dateTime={capturedAt} className="text-xs text-[var(--theme-muted)]">{new Date(capturedAt).toLocaleString("ja-JP")}</time>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => void handleShare(card)}
                          disabled={sharingId === card.id || brokenIds.has(card.id)}
                          className="border border-[var(--theme-border-strong)] bg-[var(--theme-surface)] px-3 py-1 text-xs hover:bg-[var(--theme-surface-hover)] disabled:opacity-50"
                        >
                          {sharingId === card.id ? "共有中..." : "共有"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShareToX(card)}
                          disabled={xSharingId === card.id}
                          className="border border-[var(--theme-border-strong)] bg-[var(--theme-surface)] px-3 py-1 text-xs hover:bg-[var(--theme-surface-hover)] disabled:opacity-50"
                        >
                          {xSharingId === card.id ? "画像準備中..." : "Xで共有"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(card)}
                          disabled={deletingId === card.id}
                          className="border border-[var(--theme-danger-border)] px-3 py-1 text-xs text-[var(--theme-danger-text)] disabled:opacity-50"
                        >
                          {deletingId === card.id ? "削除中..." : "写真を削除"}
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!loading && totalPages > 1 && (
          <nav aria-label="冷笑図鑑のページ" className="flex items-center justify-center gap-4">
            <button type="button" disabled={page <= 1} onClick={() => void loadCards(page - 1)} className="border border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-2 disabled:opacity-40">前へ</button>
            <span className="text-sm">{page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => void loadCards(page + 1)} className="border border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-2 disabled:opacity-40">次へ</button>
          </nav>
        )}
      </main>
    </div>
  );
}
