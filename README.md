# avant-web

静的シングルページ（WebGL2 背景・ラボ計測・コマンドパレット・Service Worker）。

## 公開 URL（GitHub Pages）

リポジトリ設定で Pages のソースを **GitHub Actions** にしたうえで、ワークフロー成功後に次の URL で公開されます。

`https://msformuratalab.github.io/avant-web/`

（組織／ユーザー名とリポジトリ名が変わる場合は、リポジトリの **Settings → Pages** に表示される URL を参照してください。）

## 公開を止める方法

次のいずれかで、サイトの公開を止められます。

1. **Pages をオフにする（推奨）**  
   GitHub リポジトリの **Settings → Pages** を開き、**Build and deployment** の **Source** を **None**（またはデプロイ元の解除）に変更する。

2. **ワークフローを止める**  
   **Actions** タブで該当ワークフローを無効化する、または `.github/workflows/deploy-pages.yml` を削除して `main` に push する（Pages のソースが Actions のままだと、再デプロイは行われませんが、設定によっては最後のビルドが残る場合があるため、止めるなら **Settings → Pages** で None が確実です）。

3. **リポジトリを非公開にする／削除する**  
   アクセス制御や廃止として最終手段。

ローカルで試していた **localtunnel** などの一時トンネルは、該当プロセスを終了すればその URL は無効になります。
