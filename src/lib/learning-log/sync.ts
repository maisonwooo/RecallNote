// 학습 기록에서 카드를 만드는 DB 쪽 로직. 파일에서 읽은 줄(ParsedLog)과 learning_sources 표를 맞춰 본다.
import type { DatabaseSync } from "node:sqlite";
import { insertCard } from "../cards.ts";
import { withTransaction } from "../db/transaction.ts";
import { toCardInput, type ParsedLog, type ParsedRow } from "./parse.ts";

/** 한 번에 처리할 수 있는 줄 수 */
export const MAX_KEYS_PER_CALL = 200;
const KEY = /^[0-9a-f]{16}$/;

export type SyncOverview = {
  total: number; // 읽은 줄 수
  fresh: ParsedRow[]; // 카드로 만들 수 있고 아직 처리 안 한 줄 (후보)
  notReady: ParsedRow[]; // 질문이나 답이 없는 줄 등 (이유 포함)
  skipped: ParsedRow[]; // 건너뛰기로 한 줄
  imported: number; // 이미 카드로 만든 줄 수
  problems: string[]; // 읽다가 건너뛴 줄 설명
};

function sourceStatuses(db: DatabaseSync): Map<string, "imported" | "skipped"> {
  const rows = db.prepare("SELECT source_key, status FROM learning_sources").all() as { source_key: string; status: "imported" | "skipped" }[];
  return new Map(rows.map((r) => [r.source_key, r.status]));
}

export function buildSyncOverview(db: DatabaseSync, log: ParsedLog): SyncOverview {
  const status = sourceStatuses(db);
  const overview: SyncOverview = { total: log.rows.length, fresh: [], notReady: [], skipped: [], imported: 0, problems: log.problems };
  for (const row of log.rows) {
    if (!row.ready) {
      overview.notReady.push(row);
      continue;
    }
    const s = status.get(row.key);
    if (s === "imported") overview.imported += 1;
    else if (s === "skipped") overview.skipped.push(row);
    else overview.fresh.push(row);
  }
  return overview;
}

export type Ignored = { key: string; reason: "invalid" | "not-in-file" | "not-ready" | "already" };

function usableKeys(keys: string[]): { keys: string[]; ignored: Ignored[] } {
  if (keys.length > MAX_KEYS_PER_CALL) throw new Error(`한 번에 ${MAX_KEYS_PER_CALL}개까지만 처리할 수 있어요.`);
  const ignored: Ignored[] = [];
  const seen = new Set<string>();
  const usable: string[] = [];
  for (const key of keys) {
    if (typeof key !== "string" || !KEY.test(key)) ignored.push({ key: String(key).slice(0, 20), reason: "invalid" });
    else if (!seen.has(key)) {
      seen.add(key);
      usable.push(key);
    }
  }
  return { keys: usable, ignored };
}

/**
 * 고른 줄을 카드로 만든다. 화면이 보낸 값을 믿지 않고 "파일에서 다시 읽은 줄"만 쓴다.
 * 이미 처리한 줄(카드로 만들었거나 건너뜀)은 건드리지 않아서 두 번 눌러도 한 번만 만들어진다(멱등).
 * 전체가 트랜잭션 하나라서 중간에 실패하면 카드도 표식도 전부 취소된다.
 */
export function importRows(db: DatabaseSync, log: ParsedLog, requested: string[]): { created: number; cardIds: number[]; ignored: Ignored[] } {
  const { keys, ignored } = usableKeys(requested);
  const byKey = new Map<string, ParsedRow>();
  for (const row of log.rows) if (!byKey.has(row.key)) byKey.set(row.key, row);

  const cardIds: number[] = [];
  withTransaction(db, () => {
    const status = sourceStatuses(db);
    const record = db.prepare("INSERT INTO learning_sources (source_key, status, card_id) VALUES (?, 'imported', ?)");
    for (const key of keys) {
      const row = byKey.get(key);
      if (!row) ignored.push({ key, reason: "not-in-file" });
      else if (!row.ready) ignored.push({ key, reason: "not-ready" });
      else if (status.has(key)) ignored.push({ key, reason: "already" });
      else {
        const id = insertCard(db, toCardInput(row));
        record.run(key, id);
        cardIds.push(id);
      }
    }
  });
  return { created: cardIds.length, cardIds, ignored };
}

/** 고른 줄을 "카드로 안 만들기"로 표시한다. 파일에 있고 후보 상태인 줄만. 바뀐 줄 수를 돌려준다. */
export function skipRows(db: DatabaseSync, log: ParsedLog, requested: string[]): number {
  const { keys } = usableKeys(requested);
  const ready = new Set(log.rows.filter((r) => r.ready).map((r) => r.key));
  let changed = 0;
  withTransaction(db, () => {
    const insert = db.prepare("INSERT OR IGNORE INTO learning_sources (source_key, status, card_id) VALUES (?, 'skipped', NULL)");
    for (const key of keys) if (ready.has(key)) changed += Number(insert.run(key).changes);
  });
  return changed;
}

/** 건너뛰기를 되돌린다 (다시 후보가 된다). 카드로 만든 줄은 건드리지 않는다. */
export function unskipRows(db: DatabaseSync, requested: string[]): number {
  const { keys } = usableKeys(requested);
  let changed = 0;
  withTransaction(db, () => {
    const del = db.prepare("DELETE FROM learning_sources WHERE source_key = ? AND status = 'skipped'");
    for (const key of keys) changed += Number(del.run(key).changes);
  });
  return changed;
}
