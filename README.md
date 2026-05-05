# avant-web（Solo CoC6 AI GM）

**クトゥルフ神話TRPG第6版に準拠したソロ専用**の AI ゲームマスター Web アプリです。**調査員は1名**。シナリオは LLM が JSON で生成し、`scene_count` とシーン配列の長さ・各フィールドの文字数をブラウザ側で検証してからセッションに載せます（長文化しすぎないようプロンプトでも固定します）。

技能判定の **d100 はブラウザ内の暗号論的乱数**で振り、結果をチャットに貼り付けられます。GM 応答末尾の `<<<SCENE_NEXT>>>` で場面インデックスが進みます。

### LLM 呼び出し（サーバー側キー · Google Gemini）

API キーは **`server/proxy.mjs`** が環境変数 **`GEMINI_API_KEY`**（または **`GOOGLE_API_KEY`**）から読み、[Gemini API](https://ai.google.dev/) の **`generateContent`（v1beta）** を呼び出します。フロントは従来どおり **`POST …/api/llm/chat`** に OpenAI 形式の `messages` を送りますが、サーバーが Gemini 用ボディへ変換し、応答だけ OpenAI の `chat.completion` 形に揃えて返すため **フロントの改修は不要**です。

- **既定モデル**: 環境変数 **`GEMINI_MODEL`**（未設定時は `gemini-2.5-flash`）。画面の「モデル ID」で上書き可能（`gpt-…` のような OpenAI 名だけ送られた場合はサーバー既定にフォールバック）。
- **エンドポイント**: 通常は `https://generativelanguage.googleapis.com/v1beta`。変更する場合のみ **`GEMINI_API_ROOT`** を設定。
- API キーは [Google AI Studio](https://aistudio.google.com/app/apikey) などで発行します。

**シナリオ生成のレート制限:** リクエスト本文に `_quota_bucket: "scenario"` が付いた呼び出し（本アプリのシナリオ JSON 生成のみ）は、**匿名クッキー `coc_quota_sid` ごとに日本時間で 1 日あたり 3 回まで**です（環境変数 **`SCENARIO_QUOTA_PER_DAY`** で変更可）。上限はシナリオ生成のみで、セッション中の GM チャットにはかかりません。フロントは **`credentials: include`** でクッキーを送るため、`CORS_ALLOW_ORIGIN` が `*` 以外の明示リストのとき **`Access-Control-Allow-Credentials`** が有効になります。別オリジンでクッキーを確実に渡す場合は **`COOKIE_SAMESITE_NONE=1`** と **`COOKIE_SECURE=1`**（HTTPS 必須）を検討してください。

**GitHub Pages は静的ホストのためプロキシは動きません。** Pages でサイトを公開する場合は、Railway・Fly.io・自宅 VPS・Cloudflare Workers など別途プロキシをホストし、ビルド時に **`VITE_LLM_API_BASE`** にそのベース URL（例: `https://api.example.com/api/llm`、末尾スラッシュなし）を埋め込んでください。リポジトリの **Settings → Secrets and variables → Actions** に `VITE_LLM_API_BASE` を登録すると、デプロイワークフローがビルドに渡します。

**公開プロキシは第三者に無制限に課金されるリスク**があります。本番ではレート制限・認証・許可オリジンのみ（`CORS_ALLOW_ORIGIN`）などを検討してください。`.env.example` を参照してください。

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

## 公開を止める方法

1. **Pages をオフにする（推奨）**  
   **Settings → Pages** で **Source** を **None** に変更する。

2. **ワークフローを止める**  
   **Actions** で該当ワークフローを無効化する、または `.github/workflows/deploy-pages.yml` を削除して `main` に push する。

3. **リポジトリを非公開にする／削除する**  
   アクセス制御や廃止として最終手段。

ローカルで試していた **localtunnel** などの一時トンネルは、プロセスを終了すればその URL は無効になります。
