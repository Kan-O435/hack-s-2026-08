# API設計

> 親ドキュメント: [concept.md](concept.md)
> 関連: [screens.md](screens.md) / [db_design.md](db_design.md) / [scoring.md](scoring.md)

Rails APIモード(`app/server`)。ベースパスは `/api/v1`。

---

## 0. 設計方針

- **リアルタイム加点(辞書+kuromoji.js)はこのAPIを一切経由しない**(ブラウザ内完結、infrastructure.md §1)。ここに載るのは低頻度な経路(発話区間の確定送信、ルーム操作、LLM確定処理)のみ
- 認証は device_token による bearer token 方式(パスワードなし、db_design.md §0)
- ルーム参加者間の即時同期(参加者一覧・文字起こし・画面遷移)は REST ではなく Action Cable(Solid Cable)で行う。REST は「操作の実行」、Action Cable は「結果の配信」という役割分担
- レスポンスは JSON、キーは snake_case

---

## 1. 認証

全エンドポイント(`POST /sessions` を除く)で以下のヘッダーを必須とする。

```
Authorization: Bearer <device_token>
```

トークンが無効/欠落している場合は `401 Unauthorized` を返す。

### `POST /api/v1/sessions`

ニックネームを送るとユーザーを新規作成し、トークンを発行する。ログアウトの概念はなく、端末がトークンを破棄すれば実質ログアウトになる。

リクエスト:
```json
{ "nickname": "たろう" }
```

レスポンス `201`:
```json
{
  "user": { "id": 1, "nickname": "たろう" },
  "token": "a1b2c3..."
}
```

---

## 2. エンドポイント一覧

| メソッド | パス | 用途 | 権限 |
|---|---|---|---|
| POST | `/sessions` | ニックネームでユーザー作成+トークン発行 | 不要 |
| POST | `/rooms` | ルーム作成(自動でhostとして参加) | 要トークン |
| POST | `/rooms/:passcode/join` | パスコードでルーム参加 | 要トークン |
| GET | `/rooms/:id` | ルーム詳細+参加者一覧の取得 | 要トークン、参加者のみ |
| PATCH | `/rooms/:id/start` | 会話開始(waiting→in_progress) | 要トークン、host のみ |
| POST | `/rooms/:id/utterances` | 発話1区間の送信 | 要トークン、参加者のみ |
| PATCH | `/rooms/:id/finish` | 会話終了(in_progress→finished)+採点ジョブ起動 | 要トークン、host のみ |
| GET | `/rooms/:id/result` | 最終結果の取得(ポーリング用) | 要トークン、参加者のみ |
| PUT | `/utterances/:id/sneer_photo` | 冷笑発話への撮影画像登録 | 要トークン、発話者本人のみ |
| DELETE | `/utterances/:id/sneer_photo` | 冷笑発話の撮影画像削除 | 要トークン、発話者本人のみ |
| GET | `/me/rooms` | 自分が参加した終了済みルーム一覧(履歴) | 要トークン |
| GET | `/me/sneer_cards` | 参加ルームの冷笑図鑑カード一覧 | 要トークン |

---

## 3. エンドポイント詳細

### `POST /api/v1/rooms`

リクエスト:
```json
{ "name": "終電後の妄想会" }
```

レスポンス `201`:
```json
{
  "room": {
    "id": 10,
    "name": "終電後の妄想会",
    "passcode": "X7K2QP",
    "status": "waiting",
    "host_user_id": 1
  }
}
```

### `POST /api/v1/rooms/:passcode/join`

パスコードは URL パラメータ。ルームが `waiting` 以外(開始済み/終了済み)の場合は `409 Conflict`。

レスポンス `200`: `GET /rooms/:id` と同じ形(下記)。

### `GET /api/v1/rooms/:id`

レスポンス `200`:
```json
{
  "room": {
    "id": 10,
    "name": "終電後の妄想会",
    "passcode": "X7K2QP",
    "status": "waiting",
    "host_user_id": 1
  },
  "participants": [
    { "user_id": 1, "nickname": "たろう", "joined_at": "2026-08-27T23:10:00+09:00" },
    { "user_id": 2, "nickname": "はなこ", "joined_at": "2026-08-27T23:11:03+09:00" }
  ]
}
```

参加者以外(トークンのユーザーが `room_participants` に居ない)がアクセスした場合は `403 Forbidden`。

### `PATCH /api/v1/rooms/:id/start`

host以外が呼ぶと `403`。`waiting` 以外の状態で呼ぶと `409`。
成功時、`status` を `in_progress` に、`started_at` を現在時刻に更新し、Action Cable で `room_started` を broadcast する。

レスポンス `200`: 更新後の room オブジェクト。

### `POST /api/v1/rooms/:id/utterances`

クライアントが1発話区間ぶんをまとめて送る(1文字ずつのストリーミングはしない)。

リクエスト:
```json
{
  "transcript": "俺たちってさ、結局、熱量なんだよね",
  "spoken_at": "2026-08-27T23:15:30+09:00",
  "duration_ms": 4200,
  "pause_before_ms": 3100,
  "volume_drop_ratio": 0.42,
  "speech_rate": 4.8,
  "realtime_score": 65
}
```

レスポンス `201`: 保存された utterance。保存と同時に Action Cable で `utterance_created` を room 全体に broadcast する。

### `PUT /api/v1/utterances/:id/sneer_photo`

`utterance_scored` で `sneer_detected=true` を受信した発話者本人の端末が、撮影した写真をmultipart/form-dataで登録する。

| フィールド | 型 | 必須 | 内容 |
|---|---|---|---|
| photo | file | yes | JPEGまたはWebP、最大5MB |
| captured_at | ISO 8601 datetime | yes | 端末が写真を撮影した時刻 |

同じ発話への再送では最初の写真を置き換えず、既存データを `200` で返す。初回保存は `201`。他人の発話は `403`、冷笑判定されていない発話や不正ファイルは `422` とする。写真URLは5分で失効する署名付きURLを返す。

レスポンス:
```json
{
  "utterance": {
    "id": 42,
    "snapshot_captured_at": "2026-08-28T12:34:56+09:00",
    "photo_url": "https://..."
  }
}
```

### `DELETE /api/v1/utterances/:id/sneer_photo`

発話者本人が自分の冷笑写真を削除する。添付ファイルと `snapshot_captured_at` を同時に削除し、成功時は `204` を返す。既に写真がない場合も `204` とする。他人の発話は `403`。

### `PATCH /api/v1/rooms/:id/finish`

host以外は `403`。`in_progress` 以外は `409`。
`status` を `finished`、`finished_at` を現在時刻に更新し、`room_finished` を broadcast。同時に採点ジョブ(`RoomResultJob`)をキューイングする(§5参照)。

レスポンス `200`: 更新後の room オブジェクト(この時点では `room_results` はまだ無い)。

### `GET /api/v1/rooms/:id/result`

採点ジョブが未完了の間はこのエンドポイントをポーリングするか、Action Cable の `result_ready` を待って叩く。

ジョブ未完了時のレスポンス `200`:
```json
{ "status": "processing" }
```

完了後のレスポンス `200`:
```json
{
  "status": "ready",
  "room": {
    "id": 10,
    "name": "終電後の妄想会",
    "summary_text": "今夜は全体的に深夜テンションが加速していました。特に…",
    "top_user_id": 1
  },
  "results": [
    {
      "user_id": 1,
      "nickname": "たろう",
      "total_score": 87,
      "title": "深夜の哲学者",
      "critique": "「熱量」という語の選択に…",
      "axes": {
        "主語のデカさ": { "score": 75, "reason": "...", "evidence": "熱量" }
      },
      "spans": [
        { "text": "俺たち", "start": 0, "end": 3, "axis": "勝手に代表する度", "delta": 12, "reason": "..." }
      ]
    }
  ]
}
```

`axes` / `spans` のスキーマは scoring.md §4 と一致させる。

### `GET /api/v1/me/rooms`

自分が参加した `finished` ルームを新しい順に返す(履歴一覧用)。

レスポンス `200`:
```json
{
  "rooms": [
    { "id": 10, "name": "終電後の妄想会", "finished_at": "2026-08-27T23:40:00+09:00", "my_total_score": 87, "my_title": "深夜の哲学者" }
  ]
}
```

### `GET /api/v1/me/sneer_cards`

現在のユーザーが参加したルームにある、写真保存済みの冷笑発話を撮影日時の新しい順に返す。1発話を1カードとして扱う。`page` と `per_page`（最大50）でページネーションする。

レスポンス `200`:
```json
{
  "cards": [
    {
      "id": 42,
      "photo_url": "https://...",
      "snapshot_captured_at": "2026-08-28T12:34:56+09:00",
      "speaker": { "user_id": 2, "nickname": "はなこ" },
      "utterance": {
        "transcript": "成長って言葉、便利だよね",
        "spoken_at": "2026-08-28T12:34:50+09:00",
        "cringe_score": 85,
        "cringe_phrase": "成長って言葉、便利だよね",
        "cringe_reason": "概念を皮肉っぽく茶化している"
      },
      "room": { "id": 10, "name": "終電後の妄想会" }
    }
  ],
  "pagination": { "page": 1, "per_page": 20, "total_count": 1, "total_pages": 1 }
}
```

---

## 4. Action Cable(Solid Cable)チャンネル設計

`RoomChannel` を `room_id` 単位で購読する。購読時にも bearer token での認証・参加者チェックを行う。

| イベント | payload | 発火タイミング |
|---|---|---|
| `participant_joined` | `{ user_id, nickname, joined_at }` | 誰かが `join` した時 |
| `room_started` | `{ started_at }` | host が `start` した時 |
| `utterance_created` | utterance オブジェクト | 誰かが発話を送信した時 |
| `utterance_transcribed` | utterance オブジェクト | 音声の文字起こしが完了した時 |
| `utterance_scored` | `sneer_detected` と冷笑判定を含む utterance オブジェクト | 発話単位の冷笑判定が完了した時 |
| `room_finished` | `{ finished_at }` | host が `finish` した時 |
| `result_ready` | `{}`(中身は `GET /result` を叩かせる) | 採点ジョブ完了時 |

フロント側は screens.md の各画面でこのチャンネルを購読し、イベントを受けて画面遷移・表示更新を行う(S5はparticipant系、S6はutterance系、S7はresult_ready)。

---

## 5. 低速経路(LLM採点)のジョブフロー

`PATCH /rooms/:id/finish` 時に Solid Queue へ `RoomResultJob` をキューイングする。

```
RoomResultJob(room_id)
  1. room内の参加者ごとに utterances を spoken_at 順に連結してテキスト化
  2. 参加者ごとに Claude へ投げる(scoring.md §4 の出力スキーマで structured output)
     → axes / spans / title / critique を取得
  3. コード側で text_score を算出(軸スコア × 重みの合成、scoring.md §1)
  4. speech_coefficient を算出(utterancesの pause/volume/speech_rate から。算出式は db_design.md §4 の未決事項)
  5. time_correction を算出(room.started_at の時刻帯から)
  6. total_score = clamp(text_score × speech_coefficient × time_correction, 0, 100)
  7. room_results に保存
  8. 全参加者ぶん終わったら、まとめて Claude にもう1回投げて room.summary_text / top_user_id を生成
  9. RoomChannel に result_ready を broadcast
```

Rails標準のSolid Queueを使うため追加のインフラ(Redis等)は不要(infrastructure.md §3)。

---

## 6. エラーレスポンス規約

```json
{ "error": { "code": "invalid_passcode", "message": "パスコードが見つかりません" } }
```

| HTTPステータス | 用途 |
|---|---|
| 401 | トークン欠落・無効 |
| 403 | 権限なし(参加者でない/hostでない) |
| 404 | リソースが存在しない |
| 409 | ルームの状態が操作と矛盾する(既に開始済み等) |
| 422 | バリデーションエラー |

---

## 7. 未決事項

- [ ] Action Cable の認証をどう繋ぐか(クエリパラメータでtokenを渡す/接続時ヘッダー、Rails側の実装詳細)
- [ ] `utterances` 送信の失敗時リトライ(オフライン時のキューイングをフロント側でどこまでやるか)
- [ ] `RoomResultJob` が一部参加者だけ失敗した場合の扱い(部分的に結果を返すか、全体を失敗扱いにするか)
- [ ] レートリミット(パスコード総当たり対策。パスコードの文字数・有効期限は現状未設計)
