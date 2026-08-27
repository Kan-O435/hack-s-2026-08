# DB設計

> 親ドキュメント: [concept.md](concept.md)
> 関連: [screens.md](screens.md) / [api_design.md](api_design.md) / [scoring.md](scoring.md)

PostgreSQL(RDS)。`app/server` の Rails モデルに対応する想定。

---

## 0. 前提

- **アカウント登録なし、ニックネームのみの簡易ログイン**(壁打ちで確定)。`infrastructure.md` §2.2 の「個人情報を扱わない/アカウント登録なし」という前提は、「メール・パスワード等のPIIは持たないが、ニックネーム+端末トークンによる継続識別は行う」に読み替える。この点は infrastructure.md 側も別途更新する。
- 認証は **端末に保存したトークン(bearer token)** 方式。パスワードは存在しない。
- 辞書(手垢語リスト)は DB ではなくフロントの静的データとして持つ(kuromoji.jsと同じくブラウザ内で完結させるため)。scoring.md 参照。DBに載せるのはユーザーが作った動的データのみ。
- 類似ポエム検索用のDB(concept.md §6-③)は今回のスコープ外。将来 `sample_poems` テーブル(text + embedding)を追加する想定でここでは定義しない。

---

## 1. ER概要

```
users ──1:N── room_participants ──N:1── rooms
  │                                        │
  │                                        │
  └──1:N── utterances ──N:1────────────────┘
  │
  └──1:N── room_results ──N:1── rooms
```

- `rooms` が1つの会話セッション(パスコードで参加する単位)
- `room_participants` は rooms と users の中間テーブル(入退室記録)
- `utterances` は会話中の発話1区間ごとのログ(音声特徴量つき)
- `room_results` はルーム終了後にLLMが確定した参加者ごとの最終スコア

---

## 2. テーブル定義

### users

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | bigint | PK | |
| nickname | string | not null | 表示名。重複可 |
| device_token | string | not null, unique index | ログイン代わりのトークン。端末側に保存し `Authorization: Bearer` で送る |
| created_at / updated_at | datetime | | |

### rooms

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | bigint | PK | |
| name | string | nullable | ルーム名。未入力時はデフォルト名を採番 |
| passcode | string | not null, unique index | 参加用の短いコード(例: 英数字6桁) |
| host_user_id | bigint | FK → users, not null | ルーム作成者 |
| status | integer | not null, default: 0 | enum: `waiting`(0) / `in_progress`(1) / `finished`(2) |
| started_at | datetime | nullable | `start` 実行時刻 |
| finished_at | datetime | nullable | `finish` 実行時刻 |
| has_alcohol | boolean | not null, default: false | scoring.mdの「場の補正」用。MVPでは常にfalse固定でも可(screens.md §5 未決) |
| summary_text | text | nullable | LLM生成のルーム全体まとめ(結果生成時に埋まる) |
| top_user_id | bigint | FK → users, nullable | 最も痛かった参加者(結果生成時に埋まる) |
| created_at / updated_at | datetime | | |

深夜補正(scoring.md §1)は `started_at` の時刻から都度計算するので、専用カラムは持たない。

### room_participants

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | bigint | PK | |
| room_id | bigint | FK → rooms, not null | |
| user_id | bigint | FK → users, not null | |
| joined_at | datetime | not null | |
| left_at | datetime | nullable | 明示的な離脱があれば記録(MVPでは未使用でも可) |
| created_at / updated_at | datetime | | |

複合 unique index: `[room_id, user_id]`(同じ人が同じルームに二重参加しない)

### utterances

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | bigint | PK | |
| room_id | bigint | FK → rooms, not null | |
| user_id | bigint | FK → users, not null | 発話者 |
| transcript | text | not null | 音声認識結果のテキスト |
| spoken_at | datetime | not null | 発話開始時刻 |
| duration_ms | integer | not null | 発話区間の長さ |
| pause_before_ms | integer | nullable | 発話前の溜め(VADの無音長) |
| volume_drop_ratio | float | nullable | 声量の低下率(RMSの直前比) |
| speech_rate | float | nullable | 話速(モーラ数/秒) |
| realtime_score | integer | nullable | クライアント側の辞書スコアリング合計(参考値、最終スコアには直接使わない) |
| created_at | datetime | | |

`pause_before_ms` / `volume_drop_ratio` / `speech_rate` は concept.md §3.4 の「太字の3特徴量」に対応する生データ。これらから `room_results.speech_coefficient` を算出する具体的な計算式は未確定(scoring.md 側の宿題、§4 参照)。

### room_results

ルーム終了後、参加者ごとに1件。LLMの低速経路(scoring.md §7)の出力を保存する。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | bigint | PK | |
| room_id | bigint | FK → rooms, not null | |
| user_id | bigint | FK → users, not null | |
| text_score | integer | not null | scoring.md §1の「軸スコアの重み付き合成」の結果(コード側で計算) |
| speech_coefficient | float | not null | 音声特徴量から算出した発話係数(concept.md §3.5) |
| time_correction | float | not null | 深夜補正等(scoring.md §1) |
| total_score | integer | not null | `clamp(text_score × speech_coefficient × time_correction, 0, 100)` |
| title | string | not null | LLM生成の称号 |
| critique | text | not null | LLM生成の講評文 |
| axes | jsonb | not null | 軸ごとのスコア+根拠。scoring.md §4 の `axes` と同スキーマ |
| spans | jsonb | not null | フレーズごとのハイライト情報。scoring.md §4 の `spans` と同スキーマ |
| created_at / updated_at | datetime | | |

複合 unique index: `[room_id, user_id]`

---

## 3. 集計の設計判断

**LLM呼び出しは参加者1人につき1回**(発話ごとではない)。ルーム終了時、参加者の `utterances.transcript` を発話順に連結した1本のテキストとしてLLMに渡し、scoring.md §4 のスキーマで軸スコア・spans・講評・称号をまとめて受け取る。これは infrastructure.md の「Railsが呼ばれるのは発話が終わった後の低速経路のみ」という設計と、LLM呼び出し回数を抑えてレイテンシ・コストを下げる狙いを両立させるため。

`spans` の文字範囲(`start`/`end`)はこの連結テキスト内でのオフセットになる点に注意(API側のレスポンスで元のutteranceにマッピングし直す処理はしない、UI側は連結テキストをそのまま表示する前提)。

---

## 4. 未決事項

- [ ] `speech_coefficient` の算出式(pause/volume/speech_rateからどう1つの係数にするか)。scoring.mdに追記が必要
- [ ] `has_alcohol` をUIから入力させるか、常時false固定にするか(screens.md §5と連動)
- [ ] `room_participants.left_at` を実際に使うか(離脱検知の実装コスト次第)
- [ ] 履歴の保持期間・削除ポリシー(ハッカソン後の後片付け、infrastructure.md §6と連動)
