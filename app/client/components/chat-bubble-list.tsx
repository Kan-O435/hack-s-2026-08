import { cringeColor, type Utterance } from "@/lib/rooms";

export function ChatBubbleList({
  utterances,
  currentUserId,
}: {
  utterances: Utterance[];
  currentUserId: number;
}) {
  if (utterances.length === 0) {
    return <p className="text-black">まだ発言がありません</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {utterances.map((u) => {
        const isOwn = u.user_id === currentUserId;
        const isCringe = (u.cringe_score ?? 0) > 0;
        const accent = cringeColor(u.cringe_score);

        return (
          <div key={u.id} className={`flex flex-col gap-1 ${isOwn ? "items-end" : "items-start"}`}>
            <span className="text-xs font-bold text-black">{u.nickname}</span>
            <div
              className="max-w-[80%] rounded-2xl border-2 px-4 py-2 text-black"
              style={{ borderColor: isCringe ? accent : "black" }}
            >
              <p>{u.transcript}</p>
              {isCringe && (
                <span
                  className="mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-bold text-black"
                  style={{ backgroundColor: accent }}
                >
                  ⚠ 冷笑度 {u.cringe_score}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
