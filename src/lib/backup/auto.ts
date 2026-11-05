// 자동 백업: 마지막 백업으로부터 7일이 지났을 때만 JSON 백업을 새 날짜 폴더에 만든다.
// 앱(서버)이 꺼져 있어도 동작하도록 DB를 "읽기 전용"으로 직접 열고, 현재 DB는 절대 바꾸지 않는다.
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildBackup } from "./export.ts";
import { seoulStamp } from "./format.ts";
import { parseBackup } from "./validate.ts";

export const KEEP_BACKUPS = 8; // 최근 8개만 남긴다
export const INTERVAL_DAYS = 7; // 마지막 백업 후 7일이 지나야 새로 만든다

export type AutoBackupOptions = { dbFile: string; root: string; logFile: string; now?: Date };
export type AutoBackupOutcome =
  | { status: "backed-up"; file: string; deleted: string[] }
  | { status: "skipped"; reason: string }
  | { status: "failed"; message: string };

const DAY_DIR = /^\d{8}$/;

function logLine(logFile: string, now: Date, text: string): void {
  const s = seoulStamp(now); // 20261105-143012
  const stamp = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)} KST`;
  try {
    appendFileSync(logFile, `${stamp} ${text}\n`, { mode: 0o600 });
  } catch {
    // 로그를 못 써도 백업 자체는 계속한다
  }
}

/** root 바로 아래의 날짜 폴더(숫자 8자리, 진짜 폴더)만 오래된 순으로. 바로가기(symlink)와 다른 이름은 무시한다. */
export function listBackupDays(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => DAY_DIR.test(name))
    .filter((name) => {
      const info = lstatSync(join(root, name));
      return info.isDirectory() && !info.isSymbolicLink();
    })
    .sort();
}

function daysBetween(from: string, to: string): number {
  const ms = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

export function runAutoBackup(options: AutoBackupOptions): AutoBackupOutcome {
  const now = options.now ?? new Date();
  const { dbFile, root, logFile } = options;
  const finish = <T extends AutoBackupOutcome>(outcome: T): T => {
    if (outcome.status === "backed-up") logLine(logFile, now, `OK 백업 완료: ${outcome.file}`);
    else if (outcome.status === "skipped") logLine(logFile, now, `SKIP ${outcome.reason}`);
    else logLine(logFile, now, `FAIL ${outcome.message}`);
    return outcome;
  };

  if (!isAbsolute(root) || root === sep) return finish({ status: "failed", message: `백업 폴더 경로가 안전하지 않아요: ${root}` });
  if (existsSync(root) && lstatSync(root).isSymbolicLink()) return finish({ status: "failed", message: "백업 폴더가 바로가기(symlink)라 중단했어요." });
  if (!existsSync(dbFile)) return finish({ status: "skipped", reason: "DB 파일이 아직 없어요 (앱을 한 번도 안 켰어요)." });

  const today = seoulStamp(now).slice(0, 8);
  const days = listBackupDays(root);
  if (days.includes(today)) return finish({ status: "skipped", reason: "오늘 백업이 이미 있어요." });
  const latest = days.at(-1);
  if (latest !== undefined) {
    const gap = daysBetween(latest, today);
    if (gap < INTERVAL_DAYS) return finish({ status: "skipped", reason: `마지막 백업(${latest}) 후 ${gap}일 — ${INTERVAL_DAYS}일 미만` });
  }

  // 1) DB를 읽기 전용으로 열어 백업 데이터를 만든다
  let json: string;
  try {
    const db = new DatabaseSync(dbFile, { readOnly: true });
    try {
      json = `${JSON.stringify(buildBackup(db, now), null, 2)}\n`;
    } finally {
      db.close();
    }
  } catch (error) {
    return finish({ status: "failed", message: `DB를 읽지 못했어요: ${(error as Error).message}` });
  }

  // 2) 만든 내용이 "가져오기에 쓸 수 있는지" 스스로 검사한다 (못 쓰는 백업은 백업이 아니다)
  const check = parseBackup(json);
  if (!check.ok) return finish({ status: "failed", message: `만든 백업이 검사를 통과하지 못했어요: ${check.errors[0]}` });

  // 3) 임시 파일에 쓰고 → 새 날짜 폴더를 만들고 → 이름을 바꿔 넣는다 (중간에 끊겨도 가짜 백업 폴더가 남지 않게)
  const tmp = join(root, `.tmp-${process.pid}-${now.getTime()}.json`);
  const dayDir = join(root, today);
  const file = join(dayDir, `recallnote-backup-${seoulStamp(now)}.json`);
  try {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    writeFileSync(tmp, json, { flag: "wx", mode: 0o600 });
    mkdirSync(dayDir, { mode: 0o700 }); // 이미 있으면 실패 (덮어쓰기 금지)
    try {
      renameSync(tmp, file);
    } catch (error) {
      rmSync(dayDir, { recursive: true, force: true }); // 방금 내가 만든 빈 폴더만
      throw error;
    }
  } catch (error) {
    rmSync(tmp, { force: true });
    return finish({ status: "failed", message: `백업을 저장하지 못했어요: ${(error as Error).message}` });
  }

  // 4) 오래된 백업 정리: 지우기 전에 목록을 로그에 먼저 남기고, 경로를 검증한다
  const deleted: string[] = [];
  const all = listBackupDays(root);
  if (all.length > KEEP_BACKUPS) {
    const victims = all.slice(0, all.length - KEEP_BACKUPS);
    logLine(logFile, now, `PRUNE 지울 폴더 목록: ${victims.map((name) => join(root, name)).join(" ")}`);
    for (const name of victims) {
      const target = join(root, name);
      const safe = DAY_DIR.test(name) && target === `${root}${sep}${name}` && !lstatSync(target).isSymbolicLink();
      if (!safe) {
        logLine(logFile, now, `FAIL 경로 검증 실패, 건너뜀: ${target}`);
        continue;
      }
      try {
        rmSync(target, { recursive: true });
        deleted.push(target);
        logLine(logFile, now, `DELETED ${target}`);
      } catch (error) {
        logLine(logFile, now, `FAIL 삭제 실패: ${target} (${(error as Error).message})`);
      }
    }
  }
  return finish({ status: "backed-up", file, deleted });
}
