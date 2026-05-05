#!/usr/bin/env bash
# Git Bash で npm が見つからないとき用（npm run dev）
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

exec npm run dev
