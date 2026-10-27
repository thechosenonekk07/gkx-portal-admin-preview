#!/bin/zsh
set -u

PROJECT_DIR="${0:A:h}"
cd "$PROJECT_DIR" || exit 1

NODE_BIN=""
for candidate in /usr/local/bin/node /opt/homebrew/bin/node; do
  if [[ -x "$candidate" ]]; then
    NODE_BIN="$candidate"
    break
  fi
done
if [[ -z "$NODE_BIN" ]]; then
  NODE_BIN="$(command -v node 2>/dev/null || true)"
fi
if [[ -z "$NODE_BIN" ]]; then
  print "未找到 Node.js。请安装 Node.js 18 或更新版本后重新双击此文件。"
  read "?按回车键关闭窗口…"
  exit 1
fi

"$NODE_BIN" "$PROJECT_DIR/scripts/preview.mjs" stop
RESULT=$?
if [[ "$RESULT" -ne 0 ]]; then
  read "?停止失败，按回车键关闭窗口…"
fi
exit "$RESULT"
