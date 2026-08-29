# 冷笑エンジン

> ハッカソン 2026-08 / テーマ:**妄想 × 技術の無駄遣い**

複数人がスマホ/PCを持ち寄って会話すると、AIがリアルタイムで「冷笑」を検出してスコア化し、
会話終了後には上位の冷笑者を**本人そっくりの声で読み上げて煽る**装置。

## これは何をするアプリか

1. ニックネームだけでログイン(パスワード不要)
2. パスコードでルームを作成 / 参加(**1人1台の端末**で参加する想定。各自のマイクが自分の声だけを拾うので、話者分離をタダで実現している)
3. ルームに入っている間、マイクは自動でON。無音を検知すると発話を自動で区切って送信する(無音0.6秒・最短発話120msで区切る簡易VAD)
4. 送られた音声はOpenAIで文字起こしされ、Claudeが「冷笑(相手を鼻で笑う・茶化す・痛いポエム的発言等)」かどうかを判定してスコアを付ける
5. 冷笑判定された発言は会話画面でリアルタイムに色付きハイライト表示される
6. 会話終了後、参加者ごとの合計スコア・辛口フィードバックが表示され、**上位3名の冷笑者だけ**、会話中の声を学習した音声クローンで「その声そっくりに」煽りセリフが読み上げられる

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js(App Router)/ TypeScript / Tailwind CSS |
| バックエンド | Ruby on Rails 8(APIモード)/ PostgreSQL |
| リアルタイム通信 | Action Cable(発話の即時反映・画面遷移の同期) |
| 音声認識 | OpenAI `gpt-4o-transcribe` |
| 冷笑判定・辛口講評 | Anthropic Claude(Haiku 4.5) |
| 音声クローン・読み上げ | ElevenLabs(Instant Voice Cloning + TTS。任意機能、未設定でも他は動く) |
| 非同期処理 | Rails標準の `:async` ジョブアダプタ(単一インスタンス運用前提) |

## ローカルでの動かし方

```bash
# 1. リポジトリ直下に .env を作成し、APIキーを設定する(.env.example参照)
cp .env.example .env
# ANTHROPIC_API_KEY / OPENAI_API_KEY は必須。ELEVENLABS_API_KEY は任意(無くても他機能は動く)

# 2. バックエンド + DB を起動(初回はビルドが走る。マイグレーションも自動実行される)
docker compose up -d

# 3. フロントエンドを別ターミナルで起動
cd app/client
npm install
npm run dev
```

- フロントエンド: http://localhost:3001
- バックエンドAPI: http://localhost:3000(ヘルスチェックは `/up`)
- DBのホスト公開ポートは5433(5432は他プロジェクトと衝突しやすいため)

スマホ実機からアクセスして試す場合は、`ngrok`等でPCの3001番ポートをHTTPS公開し、Rails側の
`FRONTEND_ORIGIN`(CORS許可オリジン)をそのURLに合わせて設定し直す必要がある。

## デプロイ

**Railway**(Rails API + PostgreSQL)+ **Vercel**(Next.js)を採用(「できるだけ簡単に」という方針のため)。
`docs/infrastructure.md` にAWS構成(App Runner + RDS + Amplify)の詳細設計も残っているが、
現時点の実デプロイ先はRailway/Vercelで、AWS案は本番運用を見据える場合の代替案という位置づけ。

## 設計・実装上の注意点

- **話者分離はデバイスで解決している**。1人1台の前提を崩すと、音声認識・冷笑判定・音声クローンの
  どれも「誰の発言か」が壊れる
- **冷笑判定の骨格はLLM(Claude)そのものが担っている**(当初の設計ドキュメントでは辞書ベースの決定論的採点を
  想定していたが、実装段階でルーブリックをLLMへのプロンプトとして直接埋め込む方式に変更した。
  詳細は `app/server/app/services/cringe_judge.rb` を参照)
- **音声サンプルは恒久保存しない**。会話中は一時ディレクトリ(`tmp/voice_samples/`)に貯め、
  結果生成後(音声クローンに使った/使わなかったに関わらず)必ず破棄する
- **音声クローンは上位3名のみ**、かつ合計発話時間が一定以上(目安6秒)無いとスキップされる。
  ElevenLabsのInstant Voice Cloningは有料プラン(Starter, $6/月〜)が必要
- Railwayのファイルシステムは揮発性のため、デプロイ直後などタイミングによっては
  一時保存した音声サンプルが失われることがある(音声クローンが生成されない場合の原因になりうる)

## 設計ドキュメント

- [docs/concept.md](docs/concept.md) — 企画・コンセプト全体
- [docs/scoring.md](docs/scoring.md) — 痛さスコアリングの初期設計(現在の実装は`cringe_judge.rb`参照。方式は変更済み)
- [docs/infrastructure.md](docs/infrastructure.md) — AWSインフラ設計(採用はしていないが判断根拠の記録として保持)
- [docs/screens.md](docs/screens.md) — 画面設計
- [docs/db_design.md](docs/db_design.md) — DB設計
- [docs/api_design.md](docs/api_design.md) — API設計

開発時の詳細な運用ルール(コマンド一覧・アーキテクチャ上の決定事項)は [CLAUDE.md](CLAUDE.md) を参照。
