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
const SPEECH_RMS_THRESHOLD = 10;
const SILENCE_DURATION_MS = 600;
const MIN_SPEECH_MS = 120;
const FINISH_GRACE_MS = 12_000;
const CAPTURE_RETRY_COUNT = 3;

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
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
  const [supportsCamera, setSupportsCamera] = useState<boolean | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);
  const [failedCapture, setFailedCapture] = useState<Utterance | null>(null);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [manualText, setManualText] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [waitingForJudgement, setWaitingForJudgement] = useState(false);

  const navigatedRef = useRef(false);
  const roomFinishedRef = useRef(false);
  const finishTimerRef = useRef<number | null>(null);
  const pendingUtteranceIdsRef = useRef(new Set<number>());
  const capturedUtteranceIdsRef = useRef(new Set<number>());
  const activeCapturesRef = useRef(0);
  const activeSubmissionsRef = useRef(0);

  const audioStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const vadTimerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef("");
  const pendingUploadRef = useRef(false);
  const mountedRef = useRef(true);

  const mutedRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const silenceStartRef = useRef(0);
  const speechStartRef = useRef(0);

  function navigateToResult() {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.push(`/rooms/${params.id}/result`);
  }

  function maybeNavigateAfterFinish() {
    if (!roomFinishedRef.current || navigatedRef.current) return;
    if (
      pendingUtteranceIdsRef.current.size === 0 &&
      activeCapturesRef.current === 0 &&
      activeSubmissionsRef.current === 0
    ) {
      if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
      navigateToResult();
    }
  }

  function beginFinishWait() {
    roomFinishedRef.current = true;
    if (
      pendingUtteranceIdsRef.current.size === 0 &&
      activeCapturesRef.current === 0 &&
      activeSubmissionsRef.current === 0
    ) {
      navigateToResult();
      return;
    }

    setWaitingForJudgement(true);
    finishTimerRef.current = window.setTimeout(navigateToResult, FINISH_GRACE_MS);
  }

  function trackOwnUtterance(utterance: Utterance, currentUserId: number) {
    if (utterance.user_id === currentUserId && utterance.cringe_score == null) {
      pendingUtteranceIdsRef.current.add(utterance.id);
    }
  }

  function upsertUtterance(utterance: Utterance) {
    setUtterances((previous) => {
      const exists = previous.some((item) => item.id === utterance.id);
      return exists
        ? previous.map((item) => (item.id === utterance.id ? utterance : item))
        : [...previous, utterance];
    });
  }

  async function uploadAudio(blob: Blob, durationMs: number, spokenAtMs: number) {
    const auth = getAuth();
    if (!auth) return;

    const extension = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
    const formData = new FormData();
    formData.append("audio", blob, `utterance.${extension}`);
    formData.append("spoken_at", new Date(spokenAtMs).toISOString());
    formData.append("duration_ms", String(Math.max(durationMs, 200)));

    activeSubmissionsRef.current += 1;
    try {
      const response = await apiFetch(`/api/v1/rooms/${params.id}/utterances`, auth.token, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error();
      const payload: RoomBroadcast = await response.json();
      if (payload.event === "utterance_created") {
        trackOwnUtterance(payload.utterance, auth.user.id);
        upsertUtterance(payload.utterance);
      }
    } catch {
      if (mountedRef.current) setError("発話の送信に失敗しました");
    } finally {
      activeSubmissionsRef.current -= 1;
      maybeNavigateAfterFinish();
    }
  }

  function startSegment() {
    const streamToRecord = recordingStreamRef.current ?? audioStreamRef.current;
    if (!streamToRecord) return;
    const recorder = new MediaRecorder(
      streamToRecord,
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
        if (blob.size > 0) void uploadAudio(blob, durationMs, speechStartRef.current);
      }
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
  }

  function stopSegment(upload: boolean) {
    pendingUploadRef.current = upload;
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
  }

  function startVadLoop() {
    const analyser = analyserRef.current;
    if (!analyser || vadTimerRef.current !== null) return;
    const dataArray = new Uint8Array(analyser.fftSize);

    vadTimerRef.current = window.setInterval(() => {
      if (mutedRef.current) {
        if (isSpeakingRef.current) {
          isSpeakingRef.current = false;
          setSpeaking(false);
          stopSegment(false);
        }
        return;
      }

      analyser.getByteTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i += 1) {
        const value = (dataArray[i] - 128) / 128;
        sumSquares += value * value;
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
    if (audioStreamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
        video: false,
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      audioStreamRef.current = stream;
      mimeTypeRef.current = pickMimeType();
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);

      // VAD(発話区間検出)の閾値には影響させたくないので、生の音量をそのままanalyserに渡す
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      // 録音経路だけ、小声の聞き取りづらさを緩和するために圧縮+持ち上げをかける。
      // 早口の言葉が飛ぶ・小声の語尾が消えるといった文字起こし精度の劣化は、
      // 声量の小さい部分をコンプレッサーで持ち上げてSN比を上げることである程度緩和できる
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -50;
      compressor.knee.value = 40;
      compressor.ratio.value = 12;
      compressor.attack.value = 0;
      compressor.release.value = 0.25;
      const makeupGain = audioContext.createGain();
      makeupGain.gain.value = 1.6;
      const recordingDestination = audioContext.createMediaStreamDestination();
      source.connect(compressor);
      compressor.connect(makeupGain);
      makeupGain.connect(recordingDestination);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      recordingStreamRef.current = recordingDestination.stream;
      setSupportsMic(true);
      setMicReady(true);
      startVadLoop();
    } catch {
      setSupportsMic(false);
      setError("マイクの使用が許可されていません。テキスト入力で参加できます");
    }
  }

  function attachCameraStream(stream: MediaStream) {
    const video = videoRef.current;
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    void video.play().catch(() => undefined);
  }

  async function initCamera() {
    setCameraError(null);
    setCameraReady(false);
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStreamRef.current = stream;
      attachCameraStream(stream);
      setSupportsCamera(true);
      setCameraReady(true);
    } catch {
      setSupportsCamera(false);
      setCameraError("カメラを起動できませんでした。会話は続けられますが、冷笑写真は保存されません");
    }
  }

  async function currentFrameBlob(): Promise<Blob> {
    const video = videoRef.current;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth) break;
      await sleep(100);
    }
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) {
      throw new Error("camera_not_ready");
    }

    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("canvas_unavailable"));
        return;
      }
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("capture_failed"))),
        "image/jpeg",
        0.88,
      );
    });
  }

  async function captureSneerPhoto(utterance: Utterance) {
    if (capturedUtteranceIdsRef.current.has(utterance.id)) return;
    const auth = getAuth();
    if (!auth) return;

    capturedUtteranceIdsRef.current.add(utterance.id);
    activeCapturesRef.current += 1;
    setCaptureMessage("冷笑を検知しました。写真を保存しています...");
    try {
      const photo = await currentFrameBlob();
      const formData = new FormData();
      formData.append("photo", photo, `sneer-${utterance.id}.jpg`);
      formData.append("captured_at", new Date().toISOString());
      let saved = false;
      for (let attempt = 0; attempt < CAPTURE_RETRY_COUNT; attempt += 1) {
        const response = await apiFetch(`/api/v1/utterances/${utterance.id}/sneer_photo`, auth.token, {
          method: "PUT",
          body: formData,
        }).catch(() => null);
        if (response?.ok) {
          saved = true;
          break;
        }
        if (attempt < CAPTURE_RETRY_COUNT - 1) await sleep(500 * (attempt + 1));
      }
      if (!saved) throw new Error("upload_failed");

      if (mountedRef.current) {
        setFailedCapture(null);
        setCaptureMessage("冷笑写真を図鑑に保存しました");
        window.setTimeout(() => mountedRef.current && setCaptureMessage(null), 3_000);
      }
    } catch {
      capturedUtteranceIdsRef.current.delete(utterance.id);
      if (mountedRef.current) {
        setFailedCapture(utterance);
        setCaptureMessage("写真を保存できませんでした。カメラを確認して再試行してください");
      }
    } finally {
      activeCapturesRef.current -= 1;
      pendingUtteranceIdsRef.current.delete(utterance.id);
      maybeNavigateAfterFinish();
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(auth.user);

    apiFetch(`/api/v1/rooms/${params.id}`, auth.token)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data: RoomDetail = await response.json();
        setDetail(data);
      })
      .catch(() => setError("ルームの取得に失敗しました"));

    const consumer = createRoomConsumer(auth.token);
    const subscription = consumer.subscriptions.create(
      { channel: "RoomChannel", room_id: params.id },
      {
        received: (data: RoomBroadcast) => {
          if (data.event === "utterance_created") {
            trackOwnUtterance(data.utterance, auth.user.id);
            upsertUtterance(data.utterance);
          } else if (data.event === "utterance_transcribed") {
            upsertUtterance(data.utterance);
          } else if (data.event === "utterance_scored") {
            upsertUtterance(data.utterance);
            if (data.utterance.user_id === auth.user.id) {
              if (data.utterance.sneer_detected) {
                void captureSneerPhoto(data.utterance);
              } else {
                pendingUtteranceIdsRef.current.delete(data.utterance.id);
                maybeNavigateAfterFinish();
              }
            }
          } else if (data.event === "room_finished") {
            beginFinishWait();
          }
        },
      },
    );

    const mediaApiAvailable = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
    const micApiAvailable =
      mediaApiAvailable && typeof MediaRecorder !== "undefined" && typeof AudioContext !== "undefined";
    setSupportsMic(micApiAvailable);
    setSupportsCamera(mediaApiAvailable);
    if (micApiAvailable) void initMic();
    if (mediaApiAvailable) void initCamera();

    return () => {
      mountedRef.current = false;
      if (vadTimerRef.current !== null) window.clearInterval(vadTimerRef.current);
      if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
      audioStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
      subscription.unsubscribe();
      consumer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, router]);

  function toggleMute() {
    setMuted((previous) => {
      const next = !previous;
      mutedRef.current = next;
      return next;
    });
  }

  async function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = manualText.trim();
    if (!text) return;
    const auth = getAuth();
    if (!auth) return;

    setManualText("");
    activeSubmissionsRef.current += 1;
    try {
      const response = await apiFetch(`/api/v1/rooms/${params.id}/utterances`, auth.token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, spoken_at: new Date().toISOString(), duration_ms: 200 }),
      });
      if (!response.ok) throw new Error();
      const payload: RoomBroadcast = await response.json();
      if (payload.event === "utterance_created") {
        trackOwnUtterance(payload.utterance, auth.user.id);
        upsertUtterance(payload.utterance);
      }
    } catch {
      setError("発話の送信に失敗しました");
    } finally {
      activeSubmissionsRef.current -= 1;
      maybeNavigateAfterFinish();
    }
  }

  async function handleFinish() {
    const auth = getAuth();
    if (!auth) return;
    if (isSpeakingRef.current) {
      isSpeakingRef.current = false;
      setSpeaking(false);
      stopSegment(true);
      await sleep(250);
    }
    setFinishing(true);
    try {
      const response = await apiFetch(`/api/v1/rooms/${params.id}/finish`, auth.token, { method: "PATCH" });
      if (!response.ok) {
        const body: ApiErrorBody = await response.json().catch(() => ({}));
        setError(body.error?.message ?? "終了に失敗しました");
      }
    } finally {
      setFinishing(false);
    }
  }

  if (!user) return null;
  const isHost = detail?.room.host_user_id === user.id;

  return (
    <div className="flex w-full flex-1 bg-[var(--theme-page)] text-[var(--theme-text)]">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
          <div>
            <p className="font-bold">{detail?.room.name ?? "会話中"}</p>
            {waitingForJudgement && (
              <p className="mt-1 text-sm text-[var(--theme-muted)]">最後の冷笑判定と写真保存を待っています...</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {isHost && (
              <button type="button" onClick={handleFinish} disabled={finishing || waitingForJudgement} className="border border-[var(--theme-border-strong)] bg-[var(--theme-surface-deep)] px-3 py-2 text-sm disabled:opacity-50">
                {finishing ? "終了しています..." : "会話を終了する"}
              </button>
            )}
            <Link href="/home" className="border border-[var(--theme-border)] px-3 py-2 text-sm">ホームに戻る</Link>
          </div>
        </header>

        <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="flex flex-col gap-3">
            <div className="aspect-[4/3] overflow-hidden border border-[var(--theme-border)] bg-black">
              <video
                ref={(node) => {
                  videoRef.current = node;
                  if (node && cameraStreamRef.current) attachCameraStream(cameraStreamRef.current);
                }}
                autoPlay
                muted
                playsInline
                aria-label="内カメラのプレビュー"
                className="h-full w-full scale-x-[-1] object-cover"
              />
            </div>
            <div className="border border-[var(--theme-border)] bg-[var(--theme-surface)] p-3 text-sm">
              <p className="font-bold">{cameraReady ? "カメラ作動中" : supportsCamera === false ? "カメラ停止中" : "カメラ準備中"}</p>
              <p className="mt-1 text-[var(--theme-muted)]">会話中は内カメラを使用し、あなたの発話から冷笑を検知した瞬間だけ写真を保存します。</p>
              {cameraError && <p className="mt-2 text-[var(--theme-danger-text)]">{cameraError}</p>}
              {!cameraReady && supportsCamera !== null && (
                <button type="button" onClick={() => void initCamera()} className="mt-3 border border-[var(--theme-border-strong)] px-3 py-2">カメラを再試行</button>
              )}
            </div>
            {supportsMic === true && !micReady && <p className="border border-[var(--theme-border)] p-3 text-center text-sm text-[var(--theme-muted)]">マイクの準備中...</p>}
            {supportsMic === true && micReady && (
              <button type="button" onClick={toggleMute} className="border border-[var(--theme-border-strong)] bg-[var(--theme-surface)] px-3 py-4">
                {muted ? "ミュート中（押して再開）" : speaking ? "発話を録音中..." : "聞き取り中（押してミュート）"}
              </button>
            )}
          </aside>

          <div className="flex min-h-96 flex-col gap-3">
            {error && <p role="alert" className="border border-[var(--theme-danger-border)] bg-[var(--theme-danger-surface)] p-3 text-[var(--theme-danger-text)]">{error}</p>}
            {captureMessage && (
              <div className="flex flex-wrap items-center justify-between gap-2 border border-[var(--theme-border)] bg-[var(--theme-surface)] p-3 text-sm">
                <p>{captureMessage}</p>
                {failedCapture && <button type="button" onClick={() => void captureSneerPhoto(failedCapture)} className="border border-[var(--theme-border-strong)] px-3 py-1">写真保存を再試行</button>}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
              {utterances.length === 0 ? <p className="text-[var(--theme-muted)]">まだ発言がありません</p> : (
                <div className="flex flex-col gap-3">
                  {utterances.map((utterance) => {
                    const isOwn = utterance.user_id === user.id;
                    const isCringe = (utterance.cringe_score ?? 0) > 0;
                    const accent = cringeColor(utterance.cringe_score);
                    return (
                      <div key={utterance.id} className={`flex flex-col gap-1 ${isOwn ? "items-end" : "items-start"}`}>
                        <span className="text-xs font-bold">{utterance.nickname}</span>
                        <div className="max-w-[85%] rounded-lg border-2 px-4 py-2" style={{ borderColor: isCringe ? accent : "var(--theme-border-strong)" }}>
                          <p>{utterance.transcript}</p>
                          {isCringe && <span className="mt-2 inline-block rounded px-2 py-0.5 text-xs font-bold text-black" style={{ backgroundColor: accent }}>冷笑度 {utterance.cringe_score}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {supportsMic === false && (
              <form onSubmit={handleManualSubmit} className="flex gap-2">
                <input type="text" value={manualText} onChange={(event) => setManualText(event.target.value)} className="min-w-0 flex-1 border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-3 outline-none" placeholder="発言を入力" />
                <button type="submit" className="border border-[var(--theme-border-strong)] bg-[var(--theme-surface)] px-4 py-3">送信</button>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
