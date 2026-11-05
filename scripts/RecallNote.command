#!/bin/zsh
# RecallNote 실행 아이콘: 더블클릭하면 서버를 켜고 브라우저를 엽니다.
# 이 창을 닫거나 Ctrl+C를 누르면, 이 스크립트가 켠 서버도 같이 꺼집니다.
# 이미 서버가 켜져 있으면 새로 켜지 않고 브라우저만 엽니다(그 서버는 끄지 않습니다).

PORT="${RECALLNOTE_PORT:-3000}"
URL="http://127.0.0.1:${PORT}"

cd "$(dirname "$0")/.." || exit 1

open_browser() {
  # 테스트할 때(RECALLNOTE_NO_OPEN=1)는 브라우저를 열지 않는다
  if [ -z "$RECALLNOTE_NO_OPEN" ]; then
    open "$URL"
  fi
}

# 이미 그 포트에서 서버가 돌고 있으면 브라우저만 연다
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "이미 서버가 켜져 있어요. 브라우저만 엽니다: $URL"
  open_browser
  exit 0
fi

npm run dev -- -p "$PORT" &
SERVER_PID=$!

# 내가 켠 서버와 그 하위 프로세스만 골라서 끈다
kill_tree() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do
    kill_tree "$child"
  done
  kill -TERM "$1" 2>/dev/null
}

stop_server() {
  trap - EXIT HUP INT TERM
  echo ""
  echo "서버를 끕니다..."
  kill_tree "$SERVER_PID"
  wait "$SERVER_PID" 2>/dev/null
  exit 0
}
trap stop_server EXIT HUP INT TERM

# 서버가 준비될 때까지 최대 60초 기다린 뒤 브라우저를 연다
for _ in {1..60}; do
  if curl -s -o /dev/null "$URL"; then
    open_browser
    break
  fi
  # 서버가 중간에 죽었으면 그만 기다린다
  kill -0 "$SERVER_PID" 2>/dev/null || { echo "서버가 켜지지 않았어요."; exit 1; }
  sleep 1
done

echo ""
echo "RecallNote 실행 중: $URL"
echo "끝내려면 이 창을 닫거나 Ctrl+C 를 누르세요."
wait "$SERVER_PID"
