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

run_via_windows_cmd() {
  if ! command -v cygpath >/dev/null 2>&1; then
    echo "cygpath が見つかりません。PowerShell または「Node の PATH が通ったターミナル」で npm run server を実行してください。" >&2
    exit 127
  fi
  local root_win
  root_win=$(cygpath -w "$ROOT")
  exec cmd.exe //c "cd /d \"$root_win\" && npm run server"
}

if command -v npm >/dev/null 2>&1; then
  exec npm run server
fi

echo "[server.sh] Git Bash の PATH に npm がありません。Windows の PATH で npm を起動します。" >&2
run_via_windows_cmd
