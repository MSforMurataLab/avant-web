#!/usr/bin/env bash
# Git Bash で「npm: command not found」になるとき用。
# Node を既定インストール先に入れた場合の PATH を追加してから npm を実行します。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

NODE_DIRS=(
  "/c/Program Files/nodejs"
  "/c/Program Files (x86)/nodejs"
)
for d in "${NODE_DIRS[@]}"; do
  if [[ -d "$d" ]]; then
    export PATH="$d:$PATH"
    break
  fi
done

exec npm run server
