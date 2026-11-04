import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";

/**
 * 예시 데이터를 넣는다. 카드나 태그가 이미 있으면 아무것도 하지 않고 false 를 돌려준다
 * (내 진짜 학습 기록 위에 예시가 섞이는 사고를 막기 위해).
 */
export function seedDatabase(db: DatabaseSync, seedFile: string): boolean {
  const cards = (db.prepare("SELECT count(*) AS n FROM cards").get() as { n: number }).n;
  const tags = (db.prepare("SELECT count(*) AS n FROM tags").get() as { n: number }).n;
  if (cards > 0 || tags > 0) return false;

  const sql = readFileSync(seedFile, "utf8");
  db.exec("BEGIN");
  try {
    db.exec(sql);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return true;
}
