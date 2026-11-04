// 카드 관련 SQL을 한곳에 모은 파일. 모든 함수는 db 연결을 첫 인자로 받는다(테스트에서 임시 DB를 넣기 위해).
// SQL에 사용자 입력을 글자로 이어 붙이지 않는다. 값은 항상 ? 자리에 따로 넘긴다(SQL 주입 방지).
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { withTransaction } from "./db/transaction.ts";
import type { CardInput } from "./card-input.ts";

export type Card = {
  id: number;
  type: string;
  question: string;
  answer: string;
  source: string | null;
  box: number;
  dueDate: string; // 서울 날짜 YYYY-MM-DD
  createdAt: string; // UTC ISO
  updatedAt: string;
  deletedAt: string | null;
  tags: string[];
};

export type CardRow = {
  id: number;
  type: string;
  question: string;
  answer: string;
  source: string | null;
  box: number;
  due_date: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const NOW_UTC = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
const TODAY_SEOUL = "date('now', '+9 hours')";

function toCard(row: CardRow, tags: string[]): Card {
  // node:sqlite 는 특수한 객체를 돌려주므로, 화면(클라이언트)에 넘겨도 안전한 평범한 객체로 바꾼다.
  return {
    id: Number(row.id),
    type: row.type,
    question: row.question,
    answer: row.answer,
    source: row.source,
    box: Number(row.box),
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    tags,
  };
}

/** 카드 여러 장의 태그 이름을 한 번에 가져온다. (카드마다 따로 묻지 않는다) */
function loadTags(db: DatabaseSync, ids: number[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  if (ids.length === 0) return map;
  const marks = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT ct.card_id AS card_id, t.name AS name
       FROM card_tags ct JOIN tags t ON t.id = ct.tag_id
       WHERE ct.card_id IN (${marks})
       ORDER BY t.name COLLATE NOCASE`,
    )
    .all(...ids) as { card_id: number; name: string }[];
  for (const row of rows) {
    const list = map.get(Number(row.card_id)) ?? [];
    list.push(row.name);
    map.set(Number(row.card_id), list);
  }
  return map;
}

export function attachTags(db: DatabaseSync, rows: CardRow[]): Card[] {
  const tags = loadTags(db, rows.map((row) => Number(row.id)));
  return rows.map((row) => toCard(row, tags.get(Number(row.id)) ?? []));
}

/** 카드의 태그를 통째로 바꾼다(기존 연결을 지우고 새로 연결). 반드시 트랜잭션 안에서 부를 것. */
function replaceTags(db: DatabaseSync, cardId: number, names: string[]): void {
  db.prepare("DELETE FROM card_tags WHERE card_id = ?").run(cardId);
  for (const name of names) {
    // 이미 있는 이름(대소문자 무시)이면 그대로 두고, 없으면 새로 만든다.
    db.prepare("INSERT INTO tags (name) VALUES (?) ON CONFLICT (name) DO NOTHING").run(name);
    const tag = db.prepare("SELECT id FROM tags WHERE name = ?").get(name) as { id: number };
    db.prepare("INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)").run(cardId, Number(tag.id));
  }
}

/** 새 카드를 만든다. 상자 1, 복습 예정일은 서울 오늘. 카드와 태그는 한 트랜잭션으로 저장한다. */
export function createCard(db: DatabaseSync, input: CardInput): number {
  return withTransaction(db, () => {
    const result = db
      .prepare(`INSERT INTO cards (question, answer, source, due_date) VALUES (?, ?, ?, ${TODAY_SEOUL})`)
      .run(input.question, input.answer, input.source);
    const id = Number(result.lastInsertRowid);
    replaceTags(db, id, input.tags);
    return id;
  });
}

/** 카드를 고친다. 없거나 보관함에 있는 카드면 false. */
export function updateCard(db: DatabaseSync, id: number, input: CardInput): boolean {
  return withTransaction(db, () => {
    const result = db
      .prepare(
        `UPDATE cards SET question = ?, answer = ?, source = ?, updated_at = ${NOW_UTC}
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(input.question, input.answer, input.source, id);
    if (Number(result.changes) === 0) return false;
    replaceTags(db, id, input.tags);
    return true;
  });
}

/** 소프트 삭제: 지우지 않고 deleted_at 에 시각만 적는다. */
export function softDeleteCard(db: DatabaseSync, id: number): boolean {
  const result = db
    .prepare(`UPDATE cards SET deleted_at = ${NOW_UTC} WHERE id = ? AND deleted_at IS NULL`)
    .run(id);
  return Number(result.changes) > 0;
}

/** 복원: deleted_at 을 다시 비운다. 상자와 복습 예정일은 그대로 남아 있다. */
export function restoreCard(db: DatabaseSync, id: number): boolean {
  const result = db
    .prepare("UPDATE cards SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL")
    .run(id);
  return Number(result.changes) > 0;
}

/** 카드 한 장 (보관함에 있는 카드도 돌려준다. 보여줄지는 부르는 쪽이 정한다). */
export function getCard(db: DatabaseSync, id: number): Card | null {
  const row = db.prepare("SELECT * FROM cards WHERE id = ?").get(id) as CardRow | undefined;
  return row ? attachTags(db, [row])[0] : null;
}

/** LIKE 검색에서 %, _, \ 를 특수문자가 아닌 "그냥 글자"로 찾게 만든다. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export type ListOptions = { q?: string; tag?: string; limit?: number };

/** 카드 목록: 삭제 안 된 카드만, 최근 만든 순. 검색어(질문·답)와 태그로 거를 수 있다. */
export function listCards(db: DatabaseSync, options: ListOptions = {}): { cards: Card[]; hasMore: boolean } {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 10000));
  const where = ["c.deleted_at IS NULL"];
  const params: SQLInputValue[] = [];

  const q = options.q?.trim();
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    where.push("(c.question LIKE ? ESCAPE '\\' OR c.answer LIKE ? ESCAPE '\\')");
    params.push(pattern, pattern);
  }
  const tag = options.tag?.trim();
  if (tag) {
    // tags.name 은 대소문자를 구분하지 않는 열이라 'Git' 과 'git' 이 같게 비교된다.
    where.push(
      `EXISTS (SELECT 1 FROM card_tags ct JOIN tags t ON t.id = ct.tag_id
               WHERE ct.card_id = c.id AND t.name = ?)`,
    );
    params.push(tag);
  }

  // 한 장 더 가져와서 "더 있는지"만 확인한다.
  const rows = db
    .prepare(
      `SELECT c.* FROM cards c WHERE ${where.join(" AND ")}
       ORDER BY c.created_at DESC, c.id DESC LIMIT ?`,
    )
    .all(...params, limit + 1) as CardRow[];
  const hasMore = rows.length > limit;
  return { cards: attachTags(db, rows.slice(0, limit)), hasMore };
}

/** 보관함(삭제한 카드), 최근에 지운 순. */
export function listArchived(db: DatabaseSync): Card[] {
  const rows = db
    .prepare("SELECT * FROM cards WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, id DESC")
    .all() as CardRow[];
  return attachTags(db, rows);
}

export type TagCount = { name: string; count: number };

/**
 * 태그별 카드 장수(필터 버튼용): 삭제 안 된 카드만 세고, 많은 순 → 이름 순.
 * 아무 카드에도 안 붙은 태그는 JOIN 에서 빠진다. (연습 문제 ②의 쿼리)
 */
export function listTagCounts(db: DatabaseSync): TagCount[] {
  const rows = db
    .prepare(
      `SELECT t.name AS name, count(*) AS card_count
       FROM tags t
       JOIN card_tags ct ON ct.tag_id = t.id
       JOIN cards c      ON c.id = ct.card_id
       WHERE c.deleted_at IS NULL
       GROUP BY t.id
       ORDER BY card_count DESC, t.name COLLATE NOCASE`,
    )
    .all() as { name: string; card_count: number }[];
  return rows.map((row) => ({ name: row.name, count: Number(row.card_count) }));
}

export function countCards(db: DatabaseSync): { active: number; archived: number } {
  const row = db
    .prepare(
      `SELECT count(*) FILTER (WHERE deleted_at IS NULL) AS active,
              count(*) FILTER (WHERE deleted_at IS NOT NULL) AS archived
       FROM cards`,
    )
    .get() as { active: number; archived: number };
  return { active: Number(row.active), archived: Number(row.archived) };
}
