"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getAuth, type AuthUser } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { createRoomConsumer } from "@/lib/cable";
import { cringeColor, type ApiErrorBody, type RoomDetail, type Utterance } from "@/lib/rooms";

type RoomBroadcast =
  | { event: "utterance_created"; utterance: Utterance }
  | { event: "utterance_transcribed"; utterance: Utterance }
  | { event: "utterance_scored"; utterance: Utterance }
  | { event: "room_finished"; finished_at: string };

const PREFERRED_MIME_TYPES = ["audio/webm", "audio/mp4", "audio/ogg"];

// この3つはブラウザ・マイクの環境差で最適値が変わるので、実機で様子を見て調整する前提の初期値
const SPEECH_RMS_THRESHOLD = 10; // 0-100スケール。この値を超えたら「話している」とみなす
const SILENCE_DURATION_MS = 1000; // これだけ無音が続いたら発話の区切りとみなす
const MIN_SPEECH_MS = 300; // これより短い発話は誤検知(物音等)とみなして送信しない

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export default function LivePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [detail, setDetail] = useState<RoomDetail | null>(null);
  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [supportsMic, setSupportsMic] = useState<boolean | null>(null);
  const [micReady, setMicReady] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [manualText, setManualText] = useState("");
  const [finishing, setFinishing] = useState(false);
  const navigatedRef = useRef(false);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadTimerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef("");
  const pendingUploadRef = useRef(false);

  const mutedRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const silenceStartRef = useRef(0);
  const speechStartRef = useRef(0);

  function uploadAudio(blob: Blob, durationMs: number, spokenAtMs: number) {
    const auth = getAuth();
    if (!auth) return;

    const extension = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
    const formData = new FormData();
    formData.append("audio", blob, `utterance.${extension}`);
    formData.append("spoken_at", new Date(spokenAtMs).toISOString());
    formData.append("duration_ms", String(Math.max(durationMs, 200)));

    apiFetch(`/api/v1/rooms/${params.id}/utterances`, auth.token, {
      method: "POST",
      body: formData,
    }).catch(() => setError("送信に失敗しました"));
  }

  function startSegment() {
    if (!streamRef.current) return;

    const recorder = new MediaRecorder(
      streamRef.current,
      mimeTypeRef.current ? { mimeType: mimeTypeRef.current } : undefined,
    );
    audioChunksRef.current = [];
    speechStartRef.current = Date.now();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      if (pendingUploadRef.current) {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        const durationMs = Date.now() - speechStartRef.current;
        if (blob.size > 0) uploadAudio(blob, durationMs, speechStartRef.current);
      }
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
  }

  function stopSegment(upload: boolean) {
    pendingUploadRef.current = upload;
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  }

  function startVadLoop() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const dataArray = new Uint8Array(analyser.fftSize);

    vadTimerRef.current = window.setInterval(() => {
      if (mutedRef.current) {
        if (isSpeakingRef.current) {
          isSpeakingRef.current = false;
          setSpeaking(false);
          stopSegment(false); // ミュート中に発話が途切れた場合は送信しない
        }
        return;
      }

      analyser.getByteTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length) * 100;
      const now = Date.now();

      if (rms > SPEECH_RMS_THRESHOLD) {
        silenceStartRef.current = 0;
        if (!isSpeakingRef.current) {
          isSpeakingRef.current = true;
          setSpeaking(true);
          startSegment();
        }
      } else if (isSpeakingRef.current) {
        if (silenceStartRef.current === 0) silenceStartRef.current = now;
        if (now - silenceStartRef.current > SILENCE_DURATION_MS) {
          isSpeakingRef.current = false;
          setSpeaking(false);
          const speechDurationMs = silenceStartRef.current - speechStartRef.current;
          stopSegment(speechDurationMs >= MIN_SPEECH_MS);
        }
      }
    }, 100);
  }

  async function initMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mimeTypeRef.current = pickMimeType();

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      setMicReady(true);
      startVadLoop();
    } catch {
      setSupportsMic(false);
      setError("マイクの使用が許可されていません。ブラウザの設定を確認してください");
    }
  }

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

    const consumer = createRoomConsumer(auth.token);
    const subscription = consumer.subscriptions.create(
      { channel: "RoomChannel", room_id: params.id },
      {
        received: (data: RoomBroadcast) => {
          if (data.event === "utterance_created") {
            setUtterances((prev) => [...prev, data.utterance]);
          } else if (data.event === "utterance_transcribed" || data.event === "utterance_scored") {
            setUtterances((prev) =>
              prev.map((u) => (u.id === data.utterance.id ? data.utterance : u)),
            );
          } else if (data.event === "room_finished" && !navigatedRef.current) {
            navigatedRef.current = true;
            router.push(`/rooms/${params.id}/result`);
          }
        },
      },
    );

    const micApiAvailable =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined" &&
      typeof AudioContext !== "undefined";
    setSupportsMic(micApiAvailable);
    if (micApiAvailable) {
      initMic();
    }

    return () => {
      if (vadTimerRef.current !== null) window.clearInterval(vadTimerRef.current);
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      audioContextRef.current?.close();
      subscription.unsubscribe();
      consumer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, router]);

  function toggleMute() {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      return next;
    });
  }

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = manualText.trim();
    if (!text) return;

    const auth = getAuth();
    if (!auth) return;

    apiFetch(`/api/v1/rooms/${params.id}/utterances`, auth.token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: text,
        spoken_at: new Date().toISOString(),
        duration_ms: 200,
      }),
    }).catch(() => setError("送信に失敗しました"));

    setManualText("");
  }

  async function handleFinish() {
    const auth = getAuth();
    if (!auth) return;

    setFinishing(true);
    try {
      const res = await apiFetch(`/api/v1/rooms/${params.id}/finish`, auth.token, {
        method: "PATCH",
      });

      if (!res.ok) {
        const body: ApiErrorBody = await res.json().catch(() => ({}));
        setError(body.error?.message ?? "終了に失敗しました");
      }
      // 成功時の画面遷移はroom_finishedのブロードキャストを受けて行う(参加者全員が同時に遷移するため)
    } finally {
      setFinishing(false);
    }
  }

  if (!user) {
    return null;
  }

  const isHost = detail?.room.host_user_id === user.id;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 bg-white p-6">
      <header className="flex items-center justify-between border border-black p-4">
        <p className="text-black">{detail?.room.name ?? "会話中"}</p>
        <div className="flex gap-2">
          {isHost && (
            <button
              type="button"
              onClick={handleFinish}
              disabled={finishing}
              className="border border-black bg-white px-3 py-1 text-sm text-black disabled:opacity-50"
            >
              {finishing ? "終了しています..." : "会話を終了する"}
            </button>
          )}
          <Link href="/home" className="border border-black bg-white px-3 py-1 text-sm text-black">
            ホームに戻る
          </Link>
        </div>
      </header>

      {error && <p className="border border-black p-4 text-black">{error}</p>}

      <div className="flex-1 overflow-y-auto border border-black p-4">
        {utterances.length === 0 ? (
          <p className="text-black">まだ発言がありません</p>
        ) : (
          <div className="flex flex-col gap-3">
            {utterances.map((u) => {
              const isOwn = u.user_id === user.id;
              const isCringe = (u.cringe_score ?? 0) > 0;
              const accent = cringeColor(u.cringe_score);

              return (
                <div
                  key={u.id}
                  className={`flex flex-col gap-1 ${isOwn ? "items-end" : "items-start"}`}
                >
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
        )}
      </div>

      {supportsMic === true && !micReady && (
        <p className="border border-black p-2 text-center text-sm text-black opacity-60">
          マイクの準備中...
        </p>
      )}

      {supportsMic === true && micReady && (
        <button
          type="button"
          onClick={toggleMute}
          className="border border-black bg-white px-3 py-4 text-black"
        >
          {muted ? "🔇 ミュート中(タップで再開)" : speaking ? "🎙️ 発話中..." : "🎙️ 聞き取り中(タップでミュート)"}
        </button>
      )}

      {supportsMic === false && (
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            type="text"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            className="flex-1 border border-black bg-white px-3 py-2 text-black outline-none"
            placeholder="このブラウザはマイクに対応していません。ここに入力してください"
          />
          <button
            type="submit"
            className="border border-black bg-white px-3 py-2 text-black"
          >
            送信
          </button>
        </form>
      )}
    </div>
  );
}
