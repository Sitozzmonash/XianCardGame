#!/usr/bin/env bash
# 全栈验收脚本（一键跑完后端测试 + API 端到端 + 前端类型检查 + Web 构建）
#
# 用法（git-bash / WSL / macOS / Linux）：
#   bash scripts/accept.sh                 # 全跑
#   bash scripts/accept.sh backend         # 只跑后端
#   bash scripts/accept.sh e2e             # 只跑 API 端到端
#   bash scripts/accept.sh frontend        # 只跑前端
#
# 退出码 0 表示全部通过；任一环节失败即非 0。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
PY="$BACKEND/.venv/Scripts/python.exe"
[ -x "$PY" ] || PY="$BACKEND/.venv/bin/python"
[ -x "$PY" ] || PY="python"
PORT="${ACCEPT_PORT:-8033}"
BASE="http://127.0.0.1:$PORT/api/v1"
WHAT="${1:-all}"
FAILED=0
declare -a RESULTS=()

note()  { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }
ok()    { RESULTS+=("✅ $*"); printf '  ✅ %s\n' "$*"; }
bad()   { RESULTS+=("❌ $*"); FAILED=1; printf '  ❌ %s\n' "$*"; }
skip()  { RESULTS+=("⏭  $*"); printf '  ⏭  %s\n' "$*"; }

run_backend() {
  note "后端：全量 pytest（含隐藏信息泄漏 / 反作弊 / 训练评测 / API 契约）"
  ( cd "$BACKEND" && "$PY" -m pytest tests -q ) && ok "pytest 全量通过" || bad "pytest 有失败"
}

run_e2e() {
  note "API 端到端：脚本扮演人类玩家打完整局（2/3/6 人）"

  # 端口占用预检：若已有服务在监听，说明是上次残留 —— 否则会拿旧服务跑验收，结果不可信
  if curl -s -m 2 "$BASE/health" >/dev/null 2>&1; then
    bad ":$PORT 已被占用（可能是上次残留的服务）——请先停止它，或换端口：ACCEPT_PORT=8044 bash scripts/accept.sh e2e"
    return 1
  fi

  # 注意：不能用 `( cd X && python ... & echo $! )` —— 那样 $! 是子 shell 的 PID，
  # 杀掉子 shell 后 python 会变成孤儿继续占端口（本脚本踩过）。必须让 $! 直接是 python。
  pushd "$BACKEND" >/dev/null || return 1
  "$PY" -m uvicorn app.main:app --host 127.0.0.1 --port "$PORT" \
    > "$LOCALAPPDATA/Temp/accept_uvicorn.log" 2>&1 &
  local pid=$!
  popd >/dev/null
  trap 'stop_server "$pid"' RETURN

  for _ in $(seq 1 40); do
    curl -s -m 2 "$BASE/health" >/dev/null 2>&1 && break
    sleep 1
  done
  if ! curl -s -m 2 "$BASE/health" | grep -q '"ok"'; then
    bad "后端未能在 :$PORT 启动（见 $LOCALAPPDATA/Temp/accept_uvicorn.log）"
  else
    ok "后端已启动 :$PORT（pid $pid）"
    for P in 2 3 6; do
      if ( cd "$BACKEND" && "$PY" scripts/e2e_api.py --base "$BASE" --players "$P" --games 1 >/dev/null 2>&1 ); then
        ok "E2E ${P} 人局通过"
      else
        bad "E2E ${P} 人局失败（单独跑：python scripts/e2e_api.py --players $P --games 1）"
      fi
    done
  fi
  stop_server "$pid"
  return 0
}

# 停服务并**确认真的停了**（先 TERM、等待、必要时 Windows 上 taskkill /F 兜底）
stop_server() {
  local pid="${1:-}"
  [ -n "$pid" ] || return 0
  kill "$pid" 2>/dev/null
  for _ in $(seq 1 10); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.3
  done
  command -v taskkill >/dev/null 2>&1 && taskkill /F /PID "$pid" >/dev/null 2>&1
  kill -9 "$pid" 2>/dev/null
  return 0
}

run_frontend() {
  note "前端：TypeScript 类型检查"
  ( cd "$FRONTEND" && npx tsc --noEmit ) && ok "tsc --noEmit 0 错误" || bad "tsc 报错"

  note "前端：Web 构建（真后端模式）"
  ( cd "$FRONTEND" && EXPO_NO_TELEMETRY=1 npx expo export --platform web \
      --output-dir dist-accept >/dev/null 2>&1 ) \
    && ok "expo export 成功（产物 frontend/dist-accept）" || bad "expo export 失败"

  note "前端：各路由 HTML 标题非空"
  local empty=0
  for f in index battle setup cards result ai-lab +not-found; do
    local file="$FRONTEND/dist-accept/$f.html"
    if [ -f "$file" ]; then
      if grep -q '<title[^>]*>[^<]\+</title>' "$file"; then :; else empty=$((empty+1)); echo "     ✗ $f.html 标题为空"; fi
    fi
  done
  [ "$empty" -eq 0 ] && ok "8 个路由标题齐全" || bad "$empty 个路由标题为空"
}

case "$WHAT" in
  backend)  run_backend ;;
  e2e)      run_e2e ;;
  frontend) run_frontend ;;
  all)      run_backend; run_e2e; run_frontend ;;
  *) echo "用法：bash scripts/accept.sh [backend|e2e|frontend|all]"; exit 2 ;;
esac

note "验收汇总"
for line in "${RESULTS[@]}"; do echo "  $line"; done
if [ "$FAILED" -eq 0 ]; then
  printf '\n\033[32m全部通过\033[0m\n'; exit 0
else
  printf '\n\033[31m存在失败项\033[0m\n'; exit 1
fi
