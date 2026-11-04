// 오늘의 복습(라이트너 상자) 로직. DB 접근은 db 연결을 첫 인자로 받는다(테스트용).
// 날짜 규칙: 카드의 due_date 는 서울 날짜 문자열(YYYY-MM-DD), reviews.reviewed_at 은 UTC 시각.
import type { DatabaseSync } from "node:sqlite";
import { attachTags, type Card, type CardRow } from "./cards.ts";
import { withTransaction } from "./db/transaction.ts";
import { getDailyReviewLimit } from "./settings.ts";

export type ReviewResult = "wrong" | "unsure" | "right";

export const MAX_BOX = 5;
/** 상자 번호별 복습 간격(일): 1→1일, 2→2일, 3→4일, 4→8일, 5→16일 */
const INTERVAL_DAYS: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 };
/** "더 복습하기"를 한 번 누를 때 추가로 보여줄 최대 장수 */
export const EXTRA_BATCH = 10;

export function isReviewResult(value: unknown): value is ReviewResult {
  return value === "wrong" || value === "unsure" || value === "right";
}

export function intervalDays(box: number): number {
  const days = INTERVAL_DAYS[box];
  if (days === undefined) throw new Error(`잘못된 상자 번호: ${box}`);
  return days;
}

/** 평가에 따른 새 상자: 맞음 +1(최대 5), 애매 그대로, 틀림 1로. */
export function nextBox(box: number, result: ReviewResult): number {
  intervalDays(box); // 상자 번호가 1~5인지 확인
  if (result === "wrong") return 1;
  if (result === "unsure") return box;
  return Math.min(box + 1, MAX_BOX);
}

/** 서울 기준 오늘 날짜 (예: 2026-11-04). 날짜가 바뀌는 시각은 서울 자정. */
export function todaySeoul(db: DatabaseSync): string {
  return (db.prepare("SELECT date('now', '+9 hours') AS d").get() as { d: string }).d;
}

/** 오늘 복습(평가)한 횟수. reviewed_at(UTC)을 서울 날짜로 바꿔서 센다. */
export function countDoneToday(db: DatabaseSync, today: string): number {
  const row = db
    .prepare("SELECT count(*) AS n FROM reviews WHERE date(reviewed_at, '+9 hours') = ?")
    .get(today) as { n: number };
  return Number(row.n);
}

/** 복습 예정일이 오늘 이전(오늘 포함)인, 삭제 안 된 카드 수. */
export function countDue(db: DatabaseSync, today: string): number {
  const row = db
    .prepare("SELECT count(*) AS n FROM cards WHERE deleted_at IS NULL AND due_date <= ?")
    .get(today) as { n: number };
  return Number(row.n);
}

/** 삭제 안 된 카드 중 가장 빠른 미래 복습 예정일 (없으면 null). */
export function nextUpcomingDate(db: DatabaseSync, today: string): string | null {
  const row = db
    .prepare("SELECT min(due_date) AS d FROM cards WHERE deleted_at IS NULL AND due_date > ?")
    .get(today) as { d: string | null };
  return row.d;
}

export type ReviewOverview = {
  today: string;
  limit: number; // 하루 상한
  doneToday: number; // 오늘 이미 복습한 횟수
  dueTotal: number; // 지금 복습 대상인 카드 수 (상한과 상관없이)
  remaining: number; // 상한까지 남은 장수
  toStudy: number; // 지금 "복습 시작"으로 볼 장수 = min(대상, 남은 장수)
};

export function getReviewOverview(db: DatabaseSync, today = todaySeoul(db)): ReviewOverview {
  const limit = getDailyReviewLimit(db);
  const doneToday = countDoneToday(db, today);
  const dueTotal = countDue(db, today);
  const remaining = Math.max(0, limit - doneToday);
  return { today, limit, doneToday, dueTotal, remaining, toStudy: Math.min(dueTotal, remaining) };
}

/**
 * 지금 볼 복습 카드들. 가장 오래 밀린 카드부터, 같은 날이면 상자 번호가 낮은 것부터, 그래도 같으면 id 순.
 * - 보통 모드: 하루 상한에서 오늘 이미 한 장수를 뺀 만큼
 * - extra 모드("더 복습하기"): 상한과 상관없이 최대 EXTRA_BATCH 장
 */
export function getReviewQueue(
  db: DatabaseSync,
  options: { extra?: boolean; today?: string } = {},
): { cards: Card[]; overview: ReviewOverview } {
  const today = options.today ?? todaySeoul(db);
  const overview = getReviewOverview(db, today);
  const take = options.extra ? EXTRA_BATCH : overview.remaining;
  if (take <= 0) return { cards: [], overview };

  const rows = db
    .prepare(
      `SELECT * FROM cards
       WHERE deleted_at IS NULL AND due_date <= ?
       ORDER BY due_date, box, id
       LIMIT ?`,
    )
    .all(today, take) as CardRow[];
  return { cards: attachTags(db, rows), overview };
}

export type ApplyResult =
  | { ok: true; boxBefore: number; boxAfter: number; nextDue: string }
  | { ok: false; reason: "not-due" };

/**
 * 평가 하나를 저장한다: 카드의 상자·예정일을 바꾸고 reviews 에 기록 (한 트랜잭션).
 * 카드가 없거나, 삭제됐거나, 이미 오늘 처리돼 예정일이 미래면 아무것도 바꾸지 않고 not-due 를 돌려준다.
 * → 같은 요청이 두 번 와도(더블 클릭, 탭 두 개) 결과는 한 번만 반영된다.
 */
export function applyReview(
  db: DatabaseSync,
  cardId: number,
  result: ReviewResult,
  today = todaySeoul(db),
): ApplyResult {
  return withTransaction(db, (): ApplyResult => {
    const card = db
      .prepare("SELECT box, due_date FROM cards WHERE id = ? AND deleted_at IS NULL")
      .get(cardId) as { box: number; due_date: string } | undefined;
    if (!card || card.due_date > today) return { ok: false, reason: "not-due" };

    const boxBefore = Number(card.box);
    const boxAfter = nextBox(boxBefore, result);
    const nextDue = (
      db.prepare("SELECT date(?, ?) AS d").get(today, `+${intervalDays(boxAfter)} days`) as { d: string }
    ).d;

    db.prepare("UPDATE cards SET box = ?, due_date = ? WHERE id = ?").run(boxAfter, nextDue, cardId);
    db.prepare("INSERT INTO reviews (card_id, result, box_before, box_after) VALUES (?, ?, ?, ?)").run(
      cardId,
      result,
      boxBefore,
      boxAfter,
    );
    return { ok: true, boxBefore, boxAfter, nextDue };
  });
}

export type ReviewSummary = { right: number; unsure: number; wrong: number; total: number };

/** 오늘 복습 결과 요약 (맞음/애매/틀림 개수). */
export function getTodaySummary(db: DatabaseSync, today = todaySeoul(db)): ReviewSummary {
  const row = db
    .prepare(
      `SELECT count(*) FILTER (WHERE result = 'right')  AS right_n,
              count(*) FILTER (WHERE result = 'unsure') AS unsure_n,
              count(*) FILTER (WHERE result = 'wrong')  AS wrong_n,
              count(*) AS total_n
       FROM reviews
       WHERE date(reviewed_at, '+9 hours') = ?`,
    )
    .get(today) as { right_n: number; unsure_n: number; wrong_n: number; total_n: number };
  return {
    right: Number(row.right_n),
    unsure: Number(row.unsure_n),
    wrong: Number(row.wrong_n),
    total: Number(row.total_n),
  };
}
