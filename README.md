# avant-web（Solo CoC6 AI GM）

**クトゥルフ神話TRPG第6版に準拠したソロ専用**の AI ゲームマスター Web アプリです。**調査員は1名**。シナリオは LLM が JSON で生成し、`scene_count` とシーン配列の長さ・各フィールドの文字数をサーバー側ではなくクライアントで検証してからセッションに載せます（長文化しすぎないようプロンプトでも固定します）。

技能判定の **d100 はブラウザ内の暗号論的乱数**で振り、結果をチャットに貼り付けられます。GM 応答末尾の `<<<SCENE_NEXT>>>` で場面インデックスが進みます。

### API キー（BYOK）

OpenAI 互換の **チャット API** 用キーを入力すると、**ブラウザから直接**ご利用のプロバイダへリクエストが送られます。公開リポジトリ・共有端末では利用しないでください。「このブラウザのセッション内でのみ記憶」は **sessionStorage** に保存します。

### ローカル開発

```bash
npm ci
npm run dev
```

本番相当ビルド:

```bash
npm run build   # 出力は dist/
npm run lint
npm run test -- --run
npm run preview -- --host   # dist をベースパス /avant-web/ で確認
```

### 公開 URL（GitHub Pages）

ワークフロー成功後、リポジトリの **Settings → Pages** に表示される URL で公開されます（例: `https://<org>.github.io/avant-web/`）。

## 公開を止める方法

1. **Pages をオフにする（推奨）**  
   **Settings → Pages** で **Source** を **None** に変更する。

2. **ワークフローを止める**  
   **Actions** で該当ワークフローを無効化する、または `.github/workflows/deploy-pages.yml` を削除して `main` に push する。

3. **リポジトリを非公開にする／削除する**  
   アクセス制御や廃止として最終手段。

ローカルで試していた **localtunnel** などの一時トンネルは、プロセスを終了すればその URL は無効になります。
