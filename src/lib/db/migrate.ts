import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

const MIGRATION_NAME = /^\d{4}_[A-Za-z0-9_-]+\.sql$/;

/**
 * migrations 폴더의 번호 붙은 SQL 파일 중, 아직 적용 안 된 것만 순서대로 적용한다.
 * - 파일 하나마다 트랜잭션(전부 성공 or 전부 취소)으로 실행한다.
 * - 이미 적용된 파일은 읽지도 않는다(그래서 고쳐도 반영되지 않는다 → 고치지 말 것).
 * 새로 적용한 파일 이름 목록을 돌려준다.
 */
export function runMigrations(db: DatabaseSync, dir: string): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  const applied = new Set(
    (db.prepare("SELECT filename FROM schema_migrations").all() as { filename: string }[]).map(
      (row) => row.filename,
    ),
  );

  const files = readdirSync(dir)
    .filter((name) => MIGRATION_NAME.test(name))
    .sort();

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = readFileSync(join(dir, file), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (filename) VALUES (?)").run(file);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(`마이그레이션 ${file} 적용 실패: ${(error as Error).message}`);
    }
    newlyApplied.push(file);
  }
  return newlyApplied;
}
