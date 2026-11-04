import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "./migrate.ts";

/** DB 파일 위치. 기본은 프로젝트 안 data/recallnote.db. 테스트/검증 때는 RECALLNOTE_DB_PATH 로 다른 파일을 쓴다. */
export function resolveDbPath(): string {
  return process.env.RECALLNOTE_DB_PATH
    ? resolve(process.env.RECALLNOTE_DB_PATH)
    : join(process.cwd(), "data", "recallnote.db");
}

export function resolveMigrationsDir(): string {
  return join(process.cwd(), "migrations");
}

/** DB 파일을 열고(없으면 만들고) 안전 설정을 켠다. 마이그레이션은 하지 않는다. */
export function openDatabase(file: string): DatabaseSync {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON"); // 외래키 검사 켜기 (SQLite는 기본이 꺼짐 → 연결마다 켜야 함)
  db.exec("PRAGMA journal_mode = WAL"); // 읽기와 쓰기가 서로 덜 막히는 저장 방식
  db.exec("PRAGMA busy_timeout = 3000"); // 다른 곳에서 쓰는 중이면 3초까지 기다림
  return db;
}

/** 열고 + 미적용 마이그레이션까지 적용한다. */
export function openAndMigrate(file: string, migrationsDir = resolveMigrationsDir()): DatabaseSync {
  const db = openDatabase(file);
  runMigrations(db, migrationsDir);
  return db;
}

// 개발 서버는 코드가 바뀔 때마다 모듈을 다시 불러오므로, 연결을 globalThis에 한 번만 보관한다.
const globalForDb = globalThis as unknown as { __recallnoteDb?: DatabaseSync };

/** 앱에서 쓰는 DB 연결. 처음 부르면 빈 DB를 자동으로 만들고 마이그레이션을 적용한다. */
export function getDb(): DatabaseSync {
  if (!globalForDb.__recallnoteDb) {
    globalForDb.__recallnoteDb = openAndMigrate(resolveDbPath());
  }
  return globalForDb.__recallnoteDb;
}
