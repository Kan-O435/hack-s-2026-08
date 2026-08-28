# パフォーマンス上の設計判断

このドキュメントは「何を測ったか」ではなく、**現状のコードが実際に何をやっていて、なぜそうなっているか**の棚卸し。
ハッカソンのデモ用途(単一インスタンス・短時間・少人数)というスコープを前提に、"正しくスケールする設計" より
"デモの体感速度を壊さないこと" を優先している判断が多い。読む前に `CLAUDE.md` のアーキテクチャ方針
(採点の決定論化・クライアント完結のリアルタイム処理)を把握しておくこと。

## 1. クライアント側で完結させている処理

### 発話区間検出(VAD)はブラウザ内、サーバーには一切送らない
`app/client/app/rooms/[id]/live/page.tsx` は `AudioContext` + `AnalyserNode` で
100msごとにRMS(音量)をポーリングし(`SPEECH_RMS_THRESHOLD`)、無音が`SILENCE_DURATION_MS`(600ms)
続いたら発話区間を確定させている。これによりサーバーには「発話が終わった1区間」単位でしか音声が飛ばない
(常時ストリーミングしない)。マイクをミュートしていない限りVADループ自体は動き続けるが、計算量は
FFTサイズ2048のRMS計算のみで軽量。

### 発話ごとに独立した `MediaRecorder` セグメント
1本の連続録音ではなく、発話区間ごとに新しい `MediaRecorder` を生成して録音・停止している
(`startSegment`/`stopSegment`)。これにより1リクエストあたりのペイロードが小さく保たれ、
かつ「今どこまで喋ったか」をサーバー側で切り出す処理が不要になる。

### 短すぎる発話・無音は送信しない
`MIN_SPEECH_MS`(120ms)未満の発話区間は破棄してアップロードしない。ノイズや咳払いレベルの
誤検知でWhisper API・Claude APIを呼んでコストとレイテンシを無駄にしないためのフィルタ。

## 2. サーバー側: 重い処理は全部非同期ジョブに逃がす

### 発話送信 → 文字起こし → 採点の3段階を別ジョブに分離
`Utterance` 作成のリクエストは即座に返し(`utterance_created` をActionCableでブロードキャスト)、
`TranscribeUtteranceJob`(Whisper API呼び出し)→ 成功したら `JudgeUtteranceJob`(Claude API呼び出し)
の順にジョブをチェーンして進める。各段階が終わるたびに `utterance_transcribed` / `utterance_scored` を
個別にブロードキャストするので、フロントは「文字起こし中...」→「スコア確定」と段階的にUIを更新でき、
ユーザーはLLMの往復レイテンシ(数百ms〜数秒)を待たされている感覚を持ちにくい。

### 冷笑判定に決め打ちショートカットがある
`CringeJudge.judge` は本文に `FORCED_TRIGGER_WORDS`(「うお」「ドワー」「きちー」)が含まれる場合、
Claude APIを呼ばずに即座に固定スコア(120点)を返す。ネタ的な仕込みではあるが、
結果的に「LLM呼び出しを一切せずに済む早期リターン」という高速パスになっている。

> **注意(設計との差分)**: `CLAUDE.md` は「痛さスコアの骨格は決定論的(辞書ヒット×重み)に計算し、
> LLMは講評文生成のみを担当する」方針を明記しているが、現在の `CringeJudge.judge` は
> スコアそのものをClaudeに判定させている。決定論的な辞書スコアリング(クライアント側kuromoji.js)は
> `docs/scoring.md` で設計されているが、現時点の実装コードには見当たらない。
> つまり「同じ発言でも毎回スコアが変わりうる」状態が残っており、方針との既知のギャップ。

### システムプロンプトをプロンプトキャッシュしている
`CringeJudge` の4つのAPI呼び出し(判定・講評・音声煽り・表情採点)はいずれも
`system_` に `cache_control: { type: "ephemeral" }` を付与している。1ルーム内で大量に発話が
飛ぶ想定のため、同一システムプロンプトのトークンをキャッシュヒットさせてレイテンシとコストを削減する狙い。

### 外部API呼び出しは指数バックオフ付きリトライ、失敗してもUIを止めない
`JudgeUtteranceJob` / `ExpressionBonusJob` は `Anthropic::Errors::APIError` を
`wait: :polynomially_longer, attempts: 3` でリトライする。最終的に失敗しても例外を握りつぶして
ログにだけ残し、`cringe_score` は `nil` のまま(フロントはスコア未確定を「冷笑なし」と同じ表示にフォールバック)。
`TranscribeUtteranceJob` も同様に、失敗時は「(文字起こしに失敗しました)」に差し替えてブロードキャストする。
→ 1件のAPI失敗が会話全体の進行をブロックしない設計。

### `ActiveJob` は永続キューを使わず、スレッド数を明示的に絞ったAsyncAdapter
Solid Queueではなくインプロセスの `ActiveJob::QueueAdapters::AsyncAdapter` を使い、
`JOB_MAX_THREADS`(デフォルト5)で上限を切っている(`config/environments/production.rb`)。
理由はコメントに明記されている通り、デフォルトのAsyncAdapterはCPUコア数依存でスレッド数が決まり、
`database.yml` のDBプールサイズと連動しないため、Railwayのような小さいコンテナだとDBプール枯渇や
メモリ超過を起こしうるため。`database.yml` 側もこれに合わせて
`pool: RAILS_MAX_THREADS + JOB_MAX_THREADS` としており、Pumaのリクエストスレッドとジョブスレッドが
同一プロセス内でDBコネクションを取り合うことを踏まえてプールサイズを決めている。
トレードオフとして、デプロイ(プロセス再起動)時にキュー中のジョブは失われる。単一インスタンス・
短時間デモ用途なので許容している。

## 3. 高コストな外部API呼び出しを間引く

### 音声クローン(ElevenLabs)は上位3人だけ
`RoomResultJob#dispatch_voice_roasts` は合計スコア上位3人(`VOICE_ROAST_TOP_N`)にだけ
`VoiceRoastJob`(クローン音声生成)を実行する。それ以外の参加者の音声サンプルはこの時点で不要になるため
即座に `VoiceSampleStore.cleanup_user` で破棄している。

### 発話時間が足りない場合はクローンを試みない
`VoiceRoastJob::MIN_SPOKEN_DURATION_MS`(6秒)未満の合計発話時間しかない参加者は、
ElevenLabs APIを呼ばずに `voice_roast_status: :unavailable` へ即座に落とす。
低品質になるとわかっている高コストAPI呼び出しを事前に弾いている。

## 4. ストレージ・DBの肥大化対策

### 音声サンプルは使い終わったら都度削除
`VoiceSampleStore.cleanup_user` / `cleanup_room` は、クローン生成の成否に関わらず
`VoiceRoastJob` の `ensure` 節で必ず呼ばれる。本番(Railway)のファイルシステムは揮発性なので、
そもそも長期保存を前提にできない設計になっている。

### ルームの自動間引き
`Room.purge_expired!` は「直近9件(`RETENTION_KEEP_COUNT`)は無条件で残す」「それ以外は
終了から7日(`RETENTION_PERIOD`)経過で削除」というルールで、発話・写真・音声を含めてまとめて破棄する。
専用のcronを持たず、`RoomResultJob`(ルーム終了のたびに動く)の中で
`Rails.cache.fetch(..., expires_in: 1.day)` を使って「1日1回だけ実行」を擬似的に実現している。
→ 外部のスケジューラ(Railwayのcron等)を用意しなくても自然に掃除される設計。

### 外部キーに対するインデックス
`utterances`, `room_participants`, `room_results` はいずれも `room_id` / `user_id`
両方にインデックスがある(`db/schema.rb`)。ルーム単位の発話一覧取得(ライブ画面・結果画面)や
ユーザー単位の集計(`RoomResultJob`)が主要なクエリパターンであることに対応している。

## 5. リアルタイム配信

Action Cable(`RoomChannel`)でルーム単位にブロードキャストし、フロントはポーリングせずWebSocketで
差分イベント(`utterance_created` / `utterance_transcribed` / `utterance_scored` / `room_finished`)
だけを受け取る。認証はクエリパラメータの `token` で行う(`app/client/lib/cable.ts`)。
Cableのバックエンドも将来的なSolid CableではなくRedis不要のasync構成に統一されている
(`CLAUDE.md` 参照)。

## 6. 会話終了時のUX: 遅い非同期処理を待ちすぎない

ルーム終了時、まだ判定中の自分の発話(`pendingUtteranceIdsRef`)や写真保存処理
(`activeCapturesRef`)が残っていれば結果画面への遷移を待つが、
`FINISH_GRACE_MS`(12秒)を超えたら強制的に遷移する(`beginFinishWait`)。
LLM判定やElevenLabs音声生成が詰まっても、ユーザーを無限に待たせない上限を設けている。

写真アップロード(`captureSneerPhoto`)は最大3回(`CAPTURE_RETRY_COUNT`)まで
指数的な間隔(500ms × attempt)でリトライしてから諦める。

## 7. 既知の未実装・今後の課題

- **音声特徴量解析(MVPの中核)はサーバー側の受け口だけ用意されていて、クライアント側が未実装**:
  `db/schema.rb` の `utterances` テーブルには `pause_before_ms` / `speech_rate` /
  `volume_drop_ratio` / `realtime_score` / `snapshot_captured_at` カラムが存在し、
  `Api::V1::UtterancesController#utterance_params` もこれらを既に `permit` している
  (`app/server/app/controllers/api/v1/utterances_controller.rb:82-85`)。
  つまりサーバーは受け取る準備ができているが、`live/page.tsx` 側でこれらを計算して
  送信するロジックがまだ無く(現状送っているのは `spoken_at` / `duration_ms` / 音声ファイルのみ)、
  常に `null` のままDBに保存されている。`docs/concept.md` §3が差別化の核として位置づけている
  「発話前の溜め・声量低下・話速低下」の解析は、配線の片側(サーバー)だけできていて
  クライアント側の計測・送信が残っている状態。
- **決定論的スコアリング(kuromoji.js辞書ベース)も未実装**: 上記の通り、現状はClaudeが
  スコアそのものを都度算出しており、`docs/scoring.md` の設計とは乖離がある。
- **`Rails.cache` は `memory_store`**: 単一インスタンス前提。複数インスタンスにスケールすると
  「1日1回だけpurgeを実行する」等のロジックがインスタンスごとに独立して動いてしまう
  (今回の用途では問題にならない)。
- **ActiveJobのAsyncAdapterはジョブを永続化しない**: デプロイのたびに実行中・待機中のジョブが消える。
