# avant-web（Solo CoC7 AI GM）

**クトゥルフ神話TRPG第7版に準拠したソロ専用**の AI ゲームマスター Web アプリです。**調査員は1名**。特性・派生ステータスは第7版の算出（例: 特性はサイコロ合計×5、HP は (CON+SIZ)/10 切り捨て）に沿います。シナリオは LLM が JSON で生成し、`scene_count` とシーン配列の長さ・各フィールドの文字数をブラウザ側で検証してからセッションに載せます（長文化しすぎないようプロンプトでも固定します）。

技能判定の **d100 はブラウザ内の暗号論的乱数**で振り、結果をチャットに貼り付けられます。GM 応答末尾の `<<<SCENE_NEXT>>>` で場面インデックスが進みます。

### LLM 呼び出し（サーバー側キー · Google Gemini）

API キーは **`server/proxy.mjs`** が環境変数 **`GEMINI_API_KEY`**（または **`GOOGLE_API_KEY`**）から読み、[Gemini API](https://ai.google.dev/) の **`generateContent`（v1beta）** を呼び出します。フロントは従来どおり **`POST …/api/llm/chat`** に OpenAI 形式の `messages` を送りますが、サーバーが Gemini 用ボディへ変換し、応答だけ OpenAI の `chat.completion` 形に揃えて返すため **フロントの改修は不要**です。

- **既定モデル**: 環境変数 **`GEMINI_MODEL`**（未設定時は `gemini-flash-latest`）。画面の「モデル ID」で上書き可能（`gpt-…` のような OpenAI 名だけ送られた場合はサーバー既定にフォールバック）。
- **エンドポイント**: 通常は `https://generativelanguage.googleapis.com/v1beta`。変更する場合のみ **`GEMINI_API_ROOT`** を設定。
- API キーは [Google AI Studio](https://aistudio.google.com/app/apikey) などで発行します。
- **503 / UNAVAILABLE（高負荷）** はプロキシが指数バックオフで **モデルごとに最大 6 回**（**`GEMINI_MAX_ATTEMPTS`**）まで再試行し、それでもダメなら **`GEMINI_FALLBACK_MODELS`**（既定: `gemini-2.5-flash` → `gemini-2.0-flash` → `gemini-2.5-pro`）の順で別モデルに切り替えます（既定の最初のモデルは **`gemini-flash-latest`**）。すべて失敗する場合は時間をおいて再試行するか、一覧を環境に合わせて調整してください。

**シナリオ生成のレート制限:** リクエスト本文に `_quota_bucket: "scenario"` が付いた呼び出し（本アプリのシナリオ JSON 生成のみ）は、**匿名クッキー `coc_quota_sid` ごとに日本時間で 1 日あたり 3 回まで**です（環境変数 **`SCENARIO_QUOTA_PER_DAY`** で変更可）。上限はシナリオ生成のみで、セッション中の GM チャットにはかかりません。フロントは **`credentials: include`** でクッキーを送るため、`CORS_ALLOW_ORIGIN` が `*` 以外の明示リストのとき **`Access-Control-Allow-Credentials`** が有効になります。別オリジンでクッキーを確実に渡す場合は **`COOKIE_SAMESITE_NONE=1`** と **`COOKIE_SECURE=1`**（HTTPS 必須）を検討してください。

**GitHub Pages は静的ホストのためプロキシは動きません。** Pages でサイトを公開する場合は、Railway・Fly.io・自宅 VPS・Cloudflare Workers など別途プロキシをホストし、ビルド時に **`VITE_LLM_API_BASE`** にそのベース URL（例: `https://api.example.com/api/llm`、末尾スラッシュなし）を埋め込んでください。リポジトリの **Settings → Secrets and variables → Actions** に `VITE_LLM_API_BASE` を登録すると、デプロイワークフローがビルドに渡します。

**公開プロキシは第三者に無制限に課金されるリスク**があります。本番ではレート制限・認証・許可オリジンのみ（`CORS_ALLOW_ORIGIN`）などを検討してください。`.env.example` を参照してください。

### Docker でプロキシのみをホストする（HTTPS はホスト側）

ルートの **`Dockerfile`** は **`server/proxy.mjs`** と実行に必要な **`npm` 依存だけ**を入れたイメージです。コンテナ内は **HTTP のみ**で待ち受け（既定ポート **`8787`**。PaaS が注入する **`PORT`** があればそちらを使用）。**ブラウザ向けの HTTPS** は Railway・Fly.io・Render などがエッジで終端します。

ローカル確認:

```bash
docker build -t avant-gemini-proxy .
docker run --rm -p 8787:8787 \
  -e GEMINI_API_KEY=your_key \
  -e CORS_ALLOW_ORIGIN=http://localhost:5173 \
  avant-gemini-proxy
```

**Railway:** リポジトリを接続すると通常 **Dockerfile を自動検出**してビルドします。**Variables** に `GEMINI_API_KEY` と `CORS_ALLOW_ORIGIN`（GitHub Pages なら `https://<org>.github.io`）を設定し、公開された **`https://….up.railway.app/api/llm`** を Actions の **`VITE_LLM_API_BASE`** に渡してください。

**Fly.io:** `fly.toml` の `app` を未使用名に変えてから **`fly launch`** / **`fly secrets set GEMINI_API_KEY=…`** / **`fly deploy`**。コメント参照。

### Render でプロキシ alone を動かす

HTTPS は Render が終端し、アプリはコンテナ内で **`PORT`**（自動設定）を listen します。ヘルスチェックは **`GET /health`**（200 JSON）。

**方法 A — Blueprint（`render.yaml`）**

1. [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**。
2. この GitHub リポジトリを接続し、ルートの **`render.yaml`** を読み込ませる。
3. 作成された Web サービスの **Environment** で **`GEMINI_API_KEY`** を **Secret** として追加（Blueprint の `sync: false` はプレースホルダのため）。
4. **`CORS_ALLOW_ORIGIN`** を **`https://＜GitHub のユーザーまたは組織名＞.github.io`** に変更（カスタムドメインの Pages ならその `https://…`）。複数ならカンマ区切り。
5. デプロイ完了後、画面上部の URL（例 **`https://avant-web-gemini-proxy.onrender.com`**）を確認する。
6. GitHub の **Actions シークレット `VITE_LLM_API_BASE`** に  
   **`https://＜手順5のホスト名＞/api/llm`**（末尾スラッシュなし）を設定し、`main` で Pages を再ビルドする。

**方法 B — 手動で Web Service**

**New** → **Web Service** → リポジトリ選択 → **Docker**、**Dockerfile Path** は `./Dockerfile`。**Health Check Path** に **`/health`**。環境変数は上と同様に **`GEMINI_API_KEY`**（Secret）・**`CORS_ALLOW_ORIGIN`**。

**注意:** Free プランは無アクセス時にスピンダウンし、初回リクエストが遅くなることがあります。シナリオ枠クッキーを別オリジンで確実に使う場合は `.env.example` の **`COOKIE_SAMESITE_NONE`** / **`COOKIE_SECURE`** を Render の Environment にも設定してください。

### ローカル開発

プロジェクト直下に **`.env`** を置くと（`.env.example` をコピーして `GEMINI_API_KEY` を記入）、`npm run server` 実行時に **自動で読み込まれます**。手動で環境変数を export してもかまいません。

**Windows の Git Bash で `npm: command not found` のとき:** Node をインストール済みでも、Git Bash の `PATH` に npm が入っていないことがあります。リポジトリ直下の **`server.sh`** / **`dev.sh`** を使うか、次のどちらかで対処してください。

```bash
# 一回だけ現在のシェル用（標準のインストール先）
export PATH="/c/Program Files/nodejs:$PATH"
npm run server
```

または `./server.sh`（プロキシ）・`bash dev.sh`（Vite。事前に `npm ci` は PowerShell や PATH が通ったターミナルで実行）。

ターミナル 1（プロキシ）:

```bash
npm run server              # 既定 http://127.0.0.1:8787（.env を読込）
```

ターミナル 2:

```bash
npm ci
npm run dev                     # /avant-web/api/llm → 127.0.0.1:8787/api/llm に転送（vite.config.ts）
```

本番相当ビルド:

```bash
npm run build   # 出力は dist/
npm run lint
npm run test -- --run
```

`npm run preview` は開発用プロキシを兼ねないため、ビルド済みフロントから LLM を試すには **`VITE_LLM_API_BASE`** を付けてビルドするか、プロキシとオリジンを合わせて配信してください。

### 公開 URL（GitHub Pages）

ワークフロー成功後、リポジトリの **Settings → Pages** に表示される URL で公開されます（例: `https://<org>.github.io/avant-web/`）。前述のとおり **別ホストのプロキシ URL をシークレットに設定する**まで、フロントからの生成・チャットは失敗します。

### 公開時に `API 405` / `405 Not Allowed` と HTML が返るとき

ブラウザが **`https://…github.io/…/api/llm/chat`** のような **Pages 自身の URL** に `POST` している状態です。Pages は静的ファイルだけを配るため POST が拒否され、nginx の **405 Not Allowed**（本文が `<html>…405…</html>`）になります。

1. **Railway / Fly.io / Render / 自宅 VPS** などで `server/proxy.mjs` を HTTPS で公開し、`GEMINI_API_KEY` をサーバー側にだけ設定する。
2. そのプロキシの **`…/api/llm` までのベース URL** を決める（例: `https://my-proxy.up.railway.app/api/llm`。末尾スラッシュなし）。
3. GitHub の **Settings → Secrets and variables → Actions** に **`VITE_LLM_API_BASE`** を作成し、上記ベース URL を値として保存する。
4. **`main` に push** して Actions のビルドが走り直すと、`import.meta.env` に埋め込まれ、フロントは **プロキシのホスト**へ POST するようになる。

カスタムドメインで Pages を見せている場合も中身は静的ホストのままなので、同様に **`VITE_LLM_API_BASE` がビルドに入っているか**を確認してください。シークレットを追加したあと **再ビルド・再デプロイが必要**です（既存の `dist` だけでは反映されません）。

## 公開を止める方法

1. **Pages をオフにする（推奨）**  
   **Settings → Pages** で **Source** を **None** に変更する。

2. **ワークフローを止める**  
   **Actions** で該当ワークフローを無効化する、または `.github/workflows/deploy-pages.yml` を削除して `main` に push する。

3. **リポジトリを非公開にする／削除する**  
   アクセス制御や廃止として最終手段。

ローカルで試していた **localtunnel** などの一時トンネルは、プロセスを終了すればその URL は無効になります。
