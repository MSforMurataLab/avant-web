# avant-web（Solo CoC6 AI GM）

**クトゥルフ神話TRPG第6版に準拠したソロ専用**の AI ゲームマスター Web アプリです。**調査員は1名**。シナリオは LLM が JSON で生成し、`scene_count` とシーン配列の長さ・各フィールドの文字数をブラウザ側で検証してからセッションに載せます（長文化しすぎないようプロンプトでも固定します）。

技能判定の **d100 はブラウザ内の暗号論的乱数**で振り、結果をチャットに貼り付けられます。GM 応答末尾の `<<<SCENE_NEXT>>>` で場面インデックスが進みます。

### LLM 呼び出し（サーバー側キー）

API キーは **`server/proxy.mjs`** が環境変数 **`OPENAI_API_KEY`** から読み、OpenAI 互換の `chat/completions` に中継します。フロントは **`POST …/api/llm/chat`** にだけアクセスし、キーを保持しません。

**GitHub Pages は静的ホストのためプロキシは動きません。** Pages でサイトを公開する場合は、Railway・Fly.io・自宅 VPS・Cloudflare Workers など別途プロキシをホストし、ビルド時に **`VITE_LLM_API_BASE`** にそのベース URL（例: `https://api.example.com/api/llm`、末尾スラッシュなし）を埋め込んでください。リポジトリの **Settings → Secrets and variables → Actions** に `VITE_LLM_API_BASE` を登録すると、デプロイワークフローがビルドに渡します。

**公開プロキシは第三者に無制限に課金されるリスク**があります。本番ではレート制限・認証・許可オリジンのみ（`CORS_ALLOW_ORIGIN`）などを検討してください。`.env.example` を参照してください。

### ローカル開発

ターミナル 1（プロキシ。キーはこのプロセスの環境だけに置く）:

```bash
export OPENAI_API_KEY=sk-...   # Windows は set / PowerShell の環境変数でも可
npm run server                  # 既定 http://127.0.0.1:8787
```

ターミナル 2:

```bash
npm ci
npm run dev                     # /api/llm を上記プロキシへ転送（vite.config.ts）
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
