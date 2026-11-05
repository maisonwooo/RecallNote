import type { DatabaseSync } from "node:sqlite";
import { BACKUP_FORMAT, BACKUP_VERSION, SETTING_KEYS, type BackupData, type Counts } from "./format.ts";

type CardRow = {
  id: number; type: "qa"; question: string; answer: string; source: string | null; box: number;
  due_date: string; created_at: string; updated_at: string; deleted_at: string | null;
};

/** 현재 DB 전체를 백업 데이터(평범한 객체)로 만든다. 읽기만 하고 아무것도 바꾸지 않는다. */
export function buildBackup(db: DatabaseSync, now: Date = new Date()): BackupData {
  const tagNames = new Map<number, string[]>();
  const links = db
    .prepare(
      `SELECT ct.card_id AS card_id, t.name AS name
       FROM card_tags ct JOIN tags t ON t.id = ct.tag_id
       ORDER BY ct.card_id, t.name COLLATE NOCASE`,
    )
    .all() as { card_id: number; name: string }[];
  for (const link of links) {
    const list = tagNames.get(Number(link.card_id)) ?? [];
    list.push(link.name);
    tagNames.set(Number(link.card_id), list);
  }

  const settings: Record<string, string> = {};
  const settingRows = db.prepare("SELECT key, value FROM settings ORDER BY key").all() as { key: string; value: string }[];
  for (const row of settingRows) {
    if ((SETTING_KEYS as readonly string[]).includes(row.key)) settings[row.key] = row.value;
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    settings,
    tags: (db.prepare("SELECT name, created_at FROM tags ORDER BY id").all() as { name: string; created_at: string }[]).map(
      (t) => ({ name: t.name, createdAt: t.created_at }),
    ),
    cards: (db.prepare("SELECT * FROM cards ORDER BY id").all() as CardRow[]).map((c) => ({
      id: Number(c.id),
      type: c.type,
      question: c.question,
      answer: c.answer,
      source: c.source,
      box: Number(c.box),
      dueDate: c.due_date,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      deletedAt: c.deleted_at,
      tags: tagNames.get(Number(c.id)) ?? [],
    })),
    reviews: (
      db.prepare("SELECT id, card_id, result, box_before, box_after, reviewed_at FROM reviews ORDER BY id").all() as {
        id: number; card_id: number; result: "wrong" | "unsure" | "right"; box_before: number; box_after: number; reviewed_at: string;
      }[]
    ).map((r) => ({
      id: Number(r.id), cardId: Number(r.card_id), result: r.result,
      boxBefore: Number(r.box_before), boxAfter: Number(r.box_after), reviewedAt: r.reviewed_at,
    })),
    learningSources: (
      db.prepare("SELECT source_key, status, card_id, created_at FROM learning_sources ORDER BY source_key").all() as {
        source_key: string; status: "imported" | "skipped"; card_id: number | null; created_at: string;
      }[]
    ).map((l) => ({ key: l.source_key, status: l.status, cardId: l.card_id === null ? null : Number(l.card_id), createdAt: l.created_at })),
    studySessions: (
      db.prepare("SELECT id, started_at, planned_minutes, ended_at, status, focus_seconds FROM study_sessions ORDER BY id").all() as {
        id: number; started_at: string; planned_minutes: number; ended_at: string | null;
        status: "running" | "completed" | "stopped"; focus_seconds: number;
      }[]
    ).map((s) => ({
      id: Number(s.id), startedAt: s.started_at, plannedMinutes: Number(s.planned_minutes),
      endedAt: s.ended_at, status: s.status, focusSeconds: Number(s.focus_seconds),
    })),
  };
}

/** 현재 DB의 항목 수 */
export function countCurrent(db: DatabaseSync): Counts {
  const one = (sql: string) => Number((db.prepare(sql).get() as { n: number }).n);
  return {
    cards: one("SELECT count(*) AS n FROM cards WHERE deleted_at IS NULL"),
    archived: one("SELECT count(*) AS n FROM cards WHERE deleted_at IS NOT NULL"),
    tags: one("SELECT count(*) AS n FROM tags"),
    reviews: one("SELECT count(*) AS n FROM reviews"),
    sessions: one("SELECT count(*) AS n FROM study_sessions"),
  };
}

/** 현재 DB에서 가장 최근에 일어난 일의 시각 (카드 만들기·고치기, 복습, 타이머 시작). 없으면 null. */
export function latestActivity(db: DatabaseSync): string | null {
  const row = db
    .prepare(
      `SELECT max(t) AS t FROM (
         SELECT max(created_at) AS t FROM cards
         UNION ALL SELECT max(updated_at) FROM cards
         UNION ALL SELECT max(reviewed_at) FROM reviews
         UNION ALL SELECT max(started_at) FROM study_sessions)`,
    )
    .get() as { t: string | null };
  return row.t;
}
