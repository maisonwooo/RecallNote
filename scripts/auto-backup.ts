// npm run backup:auto : 자동 백업 한 번 실행 (마지막 백업 후 7일이 안 지났으면 건너뜀)
// 예약(launchd)이 매일 이 명령을 부른다. 직접 불러도 안전하다: DB는 읽기만 한다.
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveDbPath } from "../src/lib/db/connection.ts";
import { runAutoBackup } from "../src/lib/backup/auto.ts";

const outcome = runAutoBackup({
  dbFile: resolveDbPath(),
  root: process.env.RECALLNOTE_BACKUP_ROOT ?? join(homedir(), "recallnote-backup"),
  logFile: process.env.RECALLNOTE_BACKUP_LOG ?? join(homedir(), "recallnote-backup.log"),
});

if (outcome.status === "backed-up") console.log(`백업 완료: ${outcome.file}${outcome.deleted.length ? ` (오래된 ${outcome.deleted.length}개 정리)` : ""}`);
else if (outcome.status === "skipped") console.log(`건너뜀: ${outcome.reason}`);
else console.error(`실패: ${outcome.message}`);
process.exit(outcome.status === "failed" ? 1 : 0);
