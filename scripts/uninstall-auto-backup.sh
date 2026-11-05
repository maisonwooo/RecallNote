#!/bin/bash
# RecallNote 자동 백업 예약 제거. 직접 실행하세요:  bash scripts/uninstall-auto-backup.sh
# 지우는 것: 실행기 파일과 예약 파일 딱 2개. 이미 만들어진 백업(~/recallnote-backup/)과 로그는 그대로 둡니다.
LABEL="com.paul.recallnote-auto-backup"
WRAPPER="$HOME/.local/bin/recallnote-auto-backup.sh"
PLIST="$HOME/Library/LaunchAgents/com.paul.recallnote-auto-backup.plist"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null && echo "예약을 껐어요." || echo "(켜져 있는 예약이 없었어요.)"
rm -f "$WRAPPER" "$PLIST" && echo "실행기와 예약 파일을 지웠어요."
echo "백업 폴더와 로그는 그대로예요: ~/recallnote-backup/ , ~/recallnote-backup.log"
