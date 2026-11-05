import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { withTransaction } from "../db/transaction.ts";
import { buildBackup, countCurrent, latestActivity } from "./export.ts";
import { seoulStamp, type BackupData, type Counts } from "./format.ts";
import { countBackup } from "./validate.ts";

export type ImportPreview = {
  exportedAt: string;
  current: Counts;
  incoming: Counts;
  /** 현재 데이터에 이 백업을 만든 뒤의 활동이 있으면 true (가져오면 그 기록이 사라진다) */
  currentIsNewer: boolean;
};

/** 가져오기 전에 보여줄 미리보기. DB는 읽기만 한다. */
export function buildPreview(db: DatabaseSync, data: BackupData): ImportPreview {
  const latest = latestActivity(db);
  return {
    exportedAt: data.exportedAt,
    current: countCurrent(db),
    incoming: countBackup(data),
    currentIsNewer: latest !== null && latest > data.exportedAt,
  };
}

/**
 * 현재 데이터를 JSON 파일로 저장한다(자동 안전 백업). 같은 이름이 있으면 덮어쓰지 않고 번호를 붙인다.
 * 저장하지 못하면 오류가 나고, 부르는 쪽(applyBackup)은 가져오기를 시작하지 않는다.
 */
export function writeSnapshot(db: DatabaseSync, dir: string, now: Date): string {
  mkdirSync(dir, { recursive: true });
  const json = `${JSON.stringify(buildBackup(db, now), null, 2)}\n`;
  const base = `before-import-${seoulStamp(now)}`;
  for (let n = 0; n < 100; n++) {
    const file = join(dir, n === 0 ? `${base}.json` : `${base}-${n}.json`);
    try {
      writeFileSync(file, json, { flag: "wx", mode: 0o600 }); // wx: 이미 있으면 실패(덮어쓰기 금지), 0600: 나만 읽기
      return file;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  throw new Error("안전 백업 파일 이름을 정하지 못했어요.");
}

/**
 * 백업 데이터로 현재 DB를 통째로 바꾼다. (검사를 통과한 data 만 받는다)
 * 1) 바꾸기 직전의 현재 데이터를 안전 백업 파일로 저장한다. 실패하면 DB를 건드리지 않고 중단한다.
 * 2) 지우고 넣는 전체를 트랜잭션 하나로 실행한다. 중간에 실패하면 전부 취소된다.
 */
export function applyBackup(
  db: DatabaseSync,
  data: BackupData,
  options: { snapshotDir: string; now?: Date },
): { snapshotPath: string; counts: Counts } {
  const now = options.now ?? new Date();
  const snapshotPath = writeSnapshot(db, options.snapshotDir, now);

  withTransaction(db, () => {
    // 자식 표부터 지운다 (외래키 순서)
    db.exec("DELETE FROM learning_sources; DELETE FROM card_tags; DELETE FROM reviews; DELETE FROM study_sessions; DELETE FROM cards; DELETE FROM tags;");

    const tagId = new Map<string, number>();
    const insertTag = db.prepare("INSERT INTO tags (name, created_at) VALUES (?, ?)");
    for (const tag of data.tags) {
      tagId.set(tag.name.toLowerCase(), Number(insertTag.run(tag.name, tag.createdAt).lastInsertRowid));
    }

    const insertCard = db.prepare(
      `INSERT INTO cards (id, type, question, answer, source, box, due_date, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertLink = db.prepare("INSERT INTO card_tags (card_id, tag_id) VALUES (?, ?)");
    for (const c of data.cards) {
      insertCard.run(c.id, c.type, c.question, c.answer, c.source, c.box, c.dueDate, c.createdAt, c.updatedAt, c.deletedAt);
      for (const name of c.tags) insertLink.run(c.id, tagId.get(name.toLowerCase()) as number);
    }

    const insertReview = db.prepare(
      "INSERT INTO reviews (id, card_id, result, box_before, box_after, reviewed_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const r of data.reviews) insertReview.run(r.id, r.cardId, r.result, r.boxBefore, r.boxAfter, r.reviewedAt);

    const insertSession = db.prepare(
      "INSERT INTO study_sessions (id, started_at, planned_minutes, ended_at, status, focus_seconds) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const s of data.studySessions) insertSession.run(s.id, s.startedAt, s.plannedMinutes, s.endedAt, s.status, s.focusSeconds);

    // 학습 기록 표식 (버전 1 파일에는 없어서 빈 목록 = 비워진다. 버전 1 데이터는 이 기능 이전이라 가져온 카드가 없다)
    const insertSource = db.prepare("INSERT INTO learning_sources (source_key, status, card_id, created_at) VALUES (?, ?, ?, ?)");
    for (const l of data.learningSources) insertSource.run(l.key, l.status, l.cardId, l.createdAt);

    // 파일에 있는 설정만 덮어쓴다 (없는 설정은 현재 값을 유지)
    const upsert = db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    );
    for (const [key, value] of Object.entries(data.settings)) upsert.run(key, value);
  });

  return { snapshotPath, counts: countCurrent(db) };
}
