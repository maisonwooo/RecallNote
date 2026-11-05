#!/bin/bash
# RecallNote 자동 백업 예약 설치. 직접 실행하세요:  bash scripts/install-auto-backup.sh
# 하는 일: ① ~/.local/bin 에 실행기 만들기 ② ~/Library/LaunchAgents 에 예약 파일 만들기 ③ launchd 에 등록
# 결과: 매일 12:40 과 로그인할 때 한 번씩 "마지막 백업 후 7일이 지났나?"를 확인해서, 지났을 때만 백업합니다.
# 되돌리기: bash scripts/uninstall-auto-backup.sh
set -u

PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node || true)"
WRAPPER="$HOME/.local/bin/recallnote-auto-backup.sh"
PLIST="$HOME/Library/LaunchAgents/com.paul.recallnote-auto-backup.plist"
LABEL="com.paul.recallnote-auto-backup"

[ -n "$NODE" ] || { echo "node 를 찾지 못했어요. 터미널에서 node -v 가 되는지 확인해 주세요."; exit 1; }
"$NODE" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' || { echo "Node 22 이상이 필요해요 (지금: $("$NODE" -v))."; exit 1; }
[ -f "$PROJECT/scripts/auto-backup.ts" ] || { echo "프로젝트 폴더를 찾지 못했어요: $PROJECT"; exit 1; }
for f in "$WRAPPER" "$PLIST"; do
  [ -e "$f" ] && { echo "이미 설치돼 있어요: $f"; echo "다시 설치하려면 먼저 bash scripts/uninstall-auto-backup.sh 를 실행하세요."; exit 1; }
done

mkdir -p "$HOME/.local/bin" "$HOME/Library/LaunchAgents"

cat > "$WRAPPER" <<WRAP
#!/bin/bash
# RecallNote 자동 백업 실행기 (launchd 가 매일 부른다). 결과는 ~/recallnote-backup.log 에 남는다.
PROJECT="$PROJECT"
NODE="$NODE"
LOG="\$HOME/recallnote-backup.log"
stamp() { date '+%Y-%m-%d %H:%M:%S KST'; }
[ -d "\$PROJECT" ] || { echo "\$(stamp) FAIL 프로젝트 폴더가 없어요: \$PROJECT" >> "\$LOG"; exit 1; }
[ -x "\$NODE" ]    || { echo "\$(stamp) FAIL node 를 찾지 못했어요: \$NODE (node 를 업데이트했다면 다시 설치해 주세요)" >> "\$LOG"; exit 1; }
cd "\$PROJECT" || exit 1
exec "\$NODE" scripts/auto-backup.ts
WRAP
chmod +x "$WRAPPER"

cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$WRAPPER</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>12</integer><key>Minute</key><integer>40</integer></dict>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$HOME/recallnote-backup.log</string>
  <key>StandardErrorPath</key><string>$HOME/recallnote-backup.log</string>
</dict></plist>
PL

plutil -lint "$PLIST" >/dev/null || { echo "예약 파일 검사에 실패했어요."; exit 1; }
launchctl bootstrap "gui/$(id -u)" "$PLIST" || { echo "등록에 실패했어요."; exit 1; }

echo "설치했어요."
echo "  실행기: $WRAPPER"
echo "  예약  : $PLIST"
echo "  로그  : $HOME/recallnote-backup.log   백업: $HOME/recallnote-backup/"
sleep 3
echo "--- 방금 첫 확인 결과(로그 마지막 줄) ---"
tail -n 3 "$HOME/recallnote-backup.log" 2>/dev/null || echo "(아직 로그가 없어요. 잠시 뒤 cat ~/recallnote-backup.log 로 확인해 보세요.)"
