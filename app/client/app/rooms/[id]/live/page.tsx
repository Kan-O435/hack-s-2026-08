"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getAuth, type AuthUser } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { createRoomConsumer } from "@/lib/cable";
import type { RoomDetail, Utterance } from "@/lib/rooms";

type UtteranceBroadcast = {
  event: "utterance_created";
  utterance: Utterance;
};

export default function LivePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [detail, setDetail] = useState<RoomDetail | null>(null);
  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [supportsSpeech, setSupportsSpeech] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [manualText, setManualText] = useState("");
  const [interimText, setInterimText] = useState("");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const shouldListenRef = useRef(false);
  const segmentStartRef = useRef(0);

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
        received: (data: UtteranceBroadcast) => {
          if (data.event === "utterance_created") {
            setUtterances((prev) => [...prev, data.utterance]);
          }
        },
      },
    );

    const SpeechRecognitionCtor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSupportsSpeech(!!SpeechRecognitionCtor);

    return () => {
      shouldListenRef.current = false;
      recognitionRef.current?.stop();
      subscription.unsubscribe();
      consumer.disconnect();
    };
  }, [params.id, router]);

  function sendUtterance(transcript: string, durationMs: number) {
    const auth = getAuth();
    if (!auth || !transcript.trim()) return;

    apiFetch(`/api/v1/rooms/${params.id}/utterances`, auth.token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: transcript.trim(),
        spoken_at: new Date(segmentStartRef.current).toISOString(),
        duration_ms: Math.max(durationMs, 200),
      }),
    }).catch(() => setError("送信に失敗しました"));
  }

  function startListening() {
    const SpeechRecognitionCtor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "ja-JP";
    recognition.continuous = true;
    recognition.interimResults = true;

    segmentStartRef.current = Date.now();

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          sendUtterance(
            result[0].transcript,
            Date.now() - segmentStartRef.current,
          );
          segmentStartRef.current = Date.now();
        } else {
          interim += result[0].transcript;
        }
      }
      // 確定前の途中経過を出すことで、認識できているかを話しながら確認できるようにする
      setInterimText(interim);
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        shouldListenRef.current = false;
        setError("マイクの使用が許可されていません。ブラウザの設定を確認してください");
      } else if (event.error === "audio-capture") {
        shouldListenRef.current = false;
        setError("マイクが見つかりません");
      }
      // no-speech・networkなど一時的なエラーはonendでの自動再起動に任せる
    };

    recognition.onend = () => {
      setInterimText("");
      if (!shouldListenRef.current) return;

      try {
        recognition.start();
      } catch {
        // 直前のstart呼び出しとの競合で稀に投げられる。次のonendで再試行される
      }
    };

    shouldListenRef.current = true;
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function stopListening() {
    shouldListenRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    setInterimText("");
  }

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manualText.trim()) return;
    segmentStartRef.current = Date.now();
    sendUtterance(manualText, 0);
    setManualText("");
  }

  if (!user) {
    return null;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 bg-white p-6">
      <header className="flex items-center justify-between border border-black p-4">
        <p className="text-black">{detail?.room.name ?? "会話中"}</p>
        <Link href="/home" className="border border-black bg-white px-3 py-1 text-sm text-black">
          ホームに戻る
        </Link>
      </header>

      {error && <p className="border border-black p-4 text-black">{error}</p>}

      <div className="flex-1 overflow-y-auto border border-black p-4">
        {utterances.length === 0 ? (
          <p className="text-black">まだ発言がありません</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {utterances.map((u) => (
              <li key={u.id} className="text-black">
                <span className="font-bold">{u.nickname}: </span>
                {u.transcript}
              </li>
            ))}
          </ul>
        )}
      </div>

      {listening && (
        <p className="border border-black p-2 text-sm text-black opacity-60">
          認識中: {interimText || "…"}
        </p>
      )}

      {supportsSpeech === true && (
        <button
          type="button"
          onClick={listening ? stopListening : startListening}
          className="border border-black bg-white px-3 py-3 text-black"
        >
          {listening ? "話すのをやめる" : "話す"}
        </button>
      )}

      {supportsSpeech === false && (
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            type="text"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            className="flex-1 border border-black bg-white px-3 py-2 text-black outline-none"
            placeholder="このブラウザは音声認識に対応していません。ここに入力してください"
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
