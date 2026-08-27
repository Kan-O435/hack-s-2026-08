# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

ハッカソン2026-08向けの作品「妄想ポエム痛さ判定機」(作品名未定)。テーマは「妄想 × 技術の無駄遣い」。
喋ったポエムの「痛さ」を数値化して冷笑するデモアプリ。詳細な企画・設計は `docs/` を参照(下記)。

## リポジトリ構成

このリポジトリは**2階層構造**になっている点に注意:

- リポジトリルート: `docs/` の設計ドキュメントのみ。フロントエンド(Next.js)はまだスキャフォールドされていない
- `app/server/`: Rails API バックエンド。**独立したgitリポジトリ**(`.git`を持つ)としてルート配下にネストされている。ルートの `git status` からは単なる untracked ディレクトリとして見える。**`app/server` 配下のファイルをコミットする際は `app/server` に `cd` してから操作すること**(ルートで `git add app/` しても中身は追跡されない)

## Docker で起動する

リポジトリルートの `docker-compose.yml` で Rails + PostgreSQL がまとめて起動する(開発用)。

```bash
docker compose up -d       # 初回はビルドも走る。db:prepare が自動実行されるのでマイグレーション不要
docker compose logs -f web # ログ確認
docker compose down        # 停止(ボリュームは残る。データごと消すなら -v を付与)
```

- `http://localhost:3000/up` でヘルスチェック確認可能
- ソースは `./app/server` を bind mount しているのでコード変更は再ビルド不要で反映される
- DBのホスト公開ポートは **5433**(5432ではない)。他のプロジェクトのpostgresコンテナと衝突する環境があったための回避
- `app/server/Dockerfile.dev` が開発用。`app/server/Dockerfile` は本番用(Kamal / AWS App Runner向け、`infrastructure.md`参照)で別物なので混同しないこと

## コマンド(app/server 配下、Ruby on Rails。Dockerを使わずホストで直接動かす場合)

すべて `app/server/` ディレクトリで実行する。

```bash
bin/setup              # 依存関係インストール + DB準備 + 開発サーバー起動
bin/dev                # 開発サーバーのみ起動
bin/rails test         # 全テスト実行(Minitest)
bin/rails test test/models/foo_test.rb        # 単一ファイルのテスト
bin/rails test test/models/foo_test.rb:12     # 単一テスト(行番号指定)
bin/rubocop            # Lint(rubocop-rails-omakase)
bin/brakeman           # セキュリティ静的解析
bin/bundler-audit      # 依存gemの脆弱性チェック
bin/ci                 # 上記をまとめて実行(setup → rubocop → bundler-audit → brakeman → test → seed replant)
```

DBはPostgreSQL(`config/database.yml`)。Ruby 3.4.1 / Rails 8.1系。

## アーキテクチャ上の重要な決定(実装時に踏まえること)

`docs/` の設計が実装の前提になっている。特に以下は実装方針を左右するので、コードを書く前に把握しておくこと。

### 採点はLLM任せにしない(最重要)

痛さスコアの**骨格は決定論的に計算する**(辞書ヒット×重み + 構文スコア、時刻/場の補正)。
LLM(Claude)が担うのは**講評文・称号の生成のみ**。同じ発言で毎回スコアが変わるとデモの説得力が死ぬため、
この役割分担は崩さない。詳細ルーブリック・アンカー例・出力スキーマは `docs/scoring.md`。

### リアルタイム処理はブラウザ内で完結、Railsを経由しない

形態素解析(kuromoji.js)と辞書スコアリングはクライアントサイド(ブラウザ)で行い、
発話中のリアルタイム加点ポップアップに使う。Rails APIが呼ばれるのは「発話が終わった後」の低速経路
(LLM講評生成・スコア確定・DB保存)のみ。この分離を崩すとリアルタイム演出のレイテンシ要件が壊れる。

### 音声の特徴量解析がMVPの中核(テキスト採点はおまけ)

「テキストをLLMに投げるだけでは実現できないこと」が差別化の生命線(`docs/concept.md` §3)。
発話前の溜め・声量低下・話速低下などの音声特徴量を解析する機能は**拡張ではなくMVP**。
逆にテキスト採点(辞書の軸を増やす、講評を凝るなど)は作り込んでも差別化にならないため優先度を上げすぎない。

### 技術スタック

Next.js(フロントエンド、未スキャフォールド) / Ruby on Rails APIモード(`app/server/`) / AWS(App Runner + RDS for PostgreSQL)。
非同期ジョブはSidekiq+Redisではなく **Solid Queue**(Rails標準、DB上で完結)を採用し、インフラ要素を減らしている
(Gemfileの `solid_queue` / `solid_cache` / `solid_cable` はこの決定を反映済み)。
CORSは `config/initializers/cors.rb` で有効化済み(`rack-cors` gem導入済み)。許可オリジンは環境変数
`FRONTEND_ORIGIN`(未設定時は `http://localhost:3001`)。Next.js側は `docker compose` のRails(3000番)と
ポートが衝突しないよう `next dev -p 3001` で起動する前提(`app/client/package.json` 参照)。

## 設計ドキュメント

- `docs/concept.md` — 企画・コンセプト全体、チャットボットとの差別化ロジック(§3)、演出設計、実装優先度
- `docs/scoring.md` — 痛さスコアリングの詳細設計(ルーブリック・few-shot・出力スキーマ・キャリブレーション手順)
- `docs/infrastructure.md` — AWSインフラ設計。Well-Architected Frameworkの5本柱ごとの判断根拠と、意図的に見送った選択肢の記録
- `docs/screens.md` — 画面設計(画面遷移、各画面の要素・操作、リアルタイム同期の考え方)
- `docs/db_design.md` — DB設計(テーブル定義、認証まわりの設計方針)
- `docs/api_design.md` — API設計(エンドポイント一覧、Action Cableチャンネル設計、LLM採点のジョブフロー)
