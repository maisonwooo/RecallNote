// 복습 로직 테스트. 항상 임시 DB만 쓴다. 날짜는 today 인자로 고정해서 시계에 흔들리지 않게 한다.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { createCard, softDeleteCard } from "../src/lib/cards.ts";
import { openAndMigrate } from "../src/lib/db/connection.ts";
import {
  applyReview,
  countDoneToday,
  EXTRA_BATCH,
  getReviewOverview,
  getReviewQueue,
  getTodaySummary,
  intervalDays,
  isReviewResult,
  nextBox,
  nextUpcomingDate,
  type ReviewResult,
} from "../src/lib/review.ts";
import { DEFAULT_DAILY_REVIEW_LIMIT, getDailyReviewLimit } from "../src/lib/settings.ts";

const TODAY = "2026-11-04";

let dir: string;
let db: DatabaseSync;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "recallnote-review-"));
  db = openAndMigrate(join(dir, "test.db"));
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

/** 카드를 만들고 상자·예정일을 원하는 값으로 맞춘다 */
function card(box: number, due: string, question = `Q-${box}-${due}`): number {
  const id = createCard(db, { question, answer: "A", source: null, tags: [] });
  db.prepare("UPDATE cards SET box = ?, due_date = ? WHERE id = ?").run(box, due, id);
  return id;
}
const cardRow = (id: number) => db.prepare("SELECT box, due_date FROM cards WHERE id = ?").get(id) as { box: number; due_date: string };
const reviews = () => db.prepare("SELECT card_id, result, box_before, box_after FROM reviews ORDER BY id").all() as Record<string, unknown>[];
const setLimit = (value: string) => db.prepare("UPDATE settings SET value = ? WHERE key = 'daily_review_limit'").run(value);

describe("상자 규칙", () => {
  test("nextBox: 맞음 +1(최대 5), 애매 그대로, 틀림 1", () => {
    const expected: Record<ReviewResult, number[]> = {
      right: [2, 3, 4, 5, 5], // 상자 1~5에서 맞으면
      unsure: [1, 2, 3, 4, 5],
      wrong: [1, 1, 1, 1, 1],
    };
    for (const result of Object.keys(expected) as ReviewResult[]) {
      for (let box = 1; box <= 5; box++) assert.equal(nextBox(box, result), expected[result][box - 1], `${result}@${box}`);
    }
  });

  test("간격: 1·2·4·8·16일, 범위 밖 상자는 오류", () => {
    assert.deepEqual([1, 2, 3, 4, 5].map(intervalDays), [1, 2, 4, 8, 16]);
    assert.throws(() => intervalDays(0));
    assert.throws(() => intervalDays(6));
    assert.throws(() => nextBox(7, "right"));
  });

  test("isReviewResult", () => {
    assert.ok(isReviewResult("right") && isReviewResult("unsure") && isReviewResult("wrong"));
    assert.ok(!isReviewResult("great") && !isReviewResult(1) && !isReviewResult(null));
  });
});

describe("평가 저장 applyReview", () => {
  test("맞음: 상자 +1, 새 상자의 간격만큼 뒤로, reviews 에 기록", () => {
    const id = card(1, TODAY);
    const r = applyReview(db, id, "right", TODAY);
    assert.deepEqual(r, { ok: true, boxBefore: 1, boxAfter: 2, nextDue: "2026-11-06" });
    assert.deepEqual({ ...cardRow(id) }, { box: 2, due_date: "2026-11-06" });
    assert.deepEqual(reviews().map((x) => ({ ...x })), [{ card_id: id, result: "right", box_before: 1, box_after: 2 }]);
  });

  test("애매: 상자 유지, 그 상자 간격만큼 뒤로", () => {
    const id = card(3, "2026-11-01"); // 밀린 카드도 '오늘' 기준으로 계산
    const r = applyReview(db, id, "unsure", TODAY);
    assert.deepEqual(r, { ok: true, boxBefore: 3, boxAfter: 3, nextDue: "2026-11-08" });
  });

  test("틀림: 상자 1, 내일", () => {
    const id = card(5, TODAY);
    const r = applyReview(db, id, "wrong", TODAY);
    assert.deepEqual(r, { ok: true, boxBefore: 5, boxAfter: 1, nextDue: "2026-11-05" });
  });

  test("상자 5에서 맞음: 5에 머물고 16일 뒤", () => {
    const id = card(5, TODAY);
    const r = applyReview(db, id, "right", TODAY);
    assert.deepEqual(r, { ok: true, boxBefore: 5, boxAfter: 5, nextDue: "2026-11-20" });
  });

  test("월말·연말·윤년을 넘어가는 날짜 계산", () => {
    const a = card(4, "2026-12-20");
    assert.equal((applyReview(db, a, "right", "2026-12-20") as { nextDue: string }).nextDue, "2027-01-05"); // 상자5: +16일
    const b = card(3, "2028-02-25");
    assert.equal((applyReview(db, b, "right", "2028-02-25") as { nextDue: string }).nextDue, "2028-03-04"); // 상자4: +8일, 2028은 윤년
    const c = card(3, "2027-02-25");
    assert.equal((applyReview(db, c, "right", "2027-02-25") as { nextDue: string }).nextDue, "2027-03-05"); // 평년
  });

  test("같은 카드를 두 번 평가해도 한 번만 반영된다(더블 클릭)", () => {
    const id = card(1, TODAY);
    assert.equal(applyReview(db, id, "right", TODAY).ok, true);
    assert.deepEqual(applyReview(db, id, "right", TODAY), { ok: false, reason: "not-due" });
    assert.deepEqual({ ...cardRow(id) }, { box: 2, due_date: "2026-11-06" });
    assert.equal(reviews().length, 1);
  });

  test("미래 예정·삭제된·없는 카드는 건드리지 않는다", () => {
    const future = card(2, "2026-11-10");
    const gone = card(2, TODAY);
    softDeleteCard(db, gone);
    for (const id of [future, gone, 9999]) assert.deepEqual(applyReview(db, id, "right", TODAY), { ok: false, reason: "not-due" });
    assert.deepEqual({ ...cardRow(future) }, { box: 2, due_date: "2026-11-10" });
    assert.deepEqual({ ...cardRow(gone) }, { box: 2, due_date: TODAY });
    assert.equal(reviews().length, 0);
  });

  test("기록 저장이 실패하면 카드 변경도 취소된다(트랜잭션)", () => {
    const id = card(1, TODAY);
    db.exec("DROP TABLE reviews"); // 일부러 기록 표를 없애서 중간에 실패하게 만든다
    assert.throws(() => applyReview(db, id, "right", TODAY));
    assert.deepEqual({ ...cardRow(id) }, { box: 1, due_date: TODAY }); // 상자·예정일이 그대로
  });
});

describe("오늘의 복습 목록", () => {
  test("오늘 이전(오늘 포함)만, 삭제 제외, 오래된 날짜 → 낮은 상자 → id 순", () => {
    const late = card(4, "2026-11-01", "가장 밀림");
    const todayLow1 = card(1, TODAY, "오늘 상자1 (먼저 만듦)");
    const todayLow2 = card(1, TODAY, "오늘 상자1 (나중에 만듦)");
    const todayHigh = card(3, TODAY, "오늘 상자3");
    card(1, "2026-11-05", "내일");
    softDeleteCard(db, card(1, "2026-10-01", "삭제된 카드"));
    const { cards } = getReviewQueue(db, { today: TODAY });
    assert.deepEqual(cards.map((c) => c.id), [late, todayLow1, todayLow2, todayHigh]);
  });

  test("하루 상한: 상한에서 오늘 이미 한 장수를 뺀 만큼만 나온다", () => {
    for (let i = 0; i < 25; i++) card(1, TODAY, `카드${i}`);
    assert.equal(getReviewQueue(db, { today: TODAY }).cards.length, DEFAULT_DAILY_REVIEW_LIMIT);
    setLimit("5");
    assert.equal(getReviewQueue(db, { today: TODAY }).cards.length, 5);

    // 오늘 3장 했다면 남은 건 2장
    db.exec("INSERT INTO reviews (card_id, result, box_before, box_after, reviewed_at) SELECT id, 'right', 1, 2, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM cards LIMIT 3");
    const today = (db.prepare("SELECT date('now','+9 hours') AS d").get() as { d: string }).d;
    const q = getReviewQueue(db, { today });
    assert.equal(q.overview.doneToday, 3);
    assert.equal(q.overview.remaining, 2);
    assert.equal(q.cards.length, 2);
  });

  test("상한을 다 채우면 목록이 비고, 더 복습하기(extra)는 최대 10장", () => {
    for (let i = 0; i < 15; i++) card(1, TODAY, `카드${i}`);
    setLimit("2");
    db.exec("INSERT INTO reviews (card_id, result, box_before, box_after, reviewed_at) SELECT id, 'wrong', 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM cards LIMIT 2");
    const today = (db.prepare("SELECT date('now','+9 hours') AS d").get() as { d: string }).d;
    db.prepare("UPDATE cards SET due_date = ?").run(today); // 15장 모두 오늘 대상으로
    const normal = getReviewQueue(db, { today });
    assert.equal(normal.cards.length, 0);
    assert.equal(normal.overview.remaining, 0);
    assert.equal(normal.overview.dueTotal, 15);
    assert.equal(normal.overview.toStudy, 0);
    const extra = getReviewQueue(db, { today, extra: true });
    assert.equal(extra.cards.length, EXTRA_BATCH);
  });

  test("overview 의 toStudy = min(대상, 남은 장수)", () => {
    card(1, TODAY);
    card(1, TODAY);
    const o = getReviewOverview(db, TODAY);
    assert.deepEqual({ limit: o.limit, dueTotal: o.dueTotal, toStudy: o.toStudy }, { limit: 20, dueTotal: 2, toStudy: 2 });
  });

  test("다음 예정일", () => {
    assert.equal(nextUpcomingDate(db, TODAY), null);
    card(1, TODAY);
    card(2, "2026-11-09");
    card(2, "2026-11-07");
    assert.equal(nextUpcomingDate(db, TODAY), "2026-11-07");
  });
});

describe("서울 날짜 경계와 요약", () => {
  const addReview = (cardId: number, result: ReviewResult, at: string) =>
    db.prepare("INSERT INTO reviews (card_id, result, box_before, box_after, reviewed_at) VALUES (?, ?, 1, 1, ?)").run(cardId, result, at);

  test("UTC 14:59:59 는 서울 11-04, 15:00:00 부터는 서울 11-05", () => {
    const id = card(1, TODAY);
    addReview(id, "right", "2026-11-04T14:59:59.000Z");
    addReview(id, "right", "2026-11-04T15:00:00.000Z");
    addReview(id, "right", "2026-11-03T15:00:00.000Z"); // 서울 11-04 00:00 (포함)
    addReview(id, "right", "2026-11-03T14:59:59.000Z"); // 서울 11-03 (제외)
    assert.equal(countDoneToday(db, "2026-11-04"), 2);
    assert.equal(countDoneToday(db, "2026-11-05"), 1);
  });

  test("오늘 요약: 맞음/애매/틀림 개수와 합계, 다른 날은 제외", () => {
    const id = card(1, TODAY);
    for (const r of ["right", "right", "unsure", "wrong", "wrong", "wrong"] as const) addReview(id, r, "2026-11-04T03:00:00.000Z");
    addReview(id, "right", "2026-11-03T03:00:00.000Z");
    assert.deepEqual(getTodaySummary(db, TODAY), { right: 2, unsure: 1, wrong: 3, total: 6 });
    assert.deepEqual(getTodaySummary(db, "2030-01-01"), { right: 0, unsure: 0, wrong: 0, total: 0 });
  });
});

describe("설정 daily_review_limit", () => {
  test("기본 20, 정상 값은 그대로, 이상한 값은 20", () => {
    assert.equal(getDailyReviewLimit(db), 20);
    setLimit("7");
    assert.equal(getDailyReviewLimit(db), 7);
    for (const bad of ["0", "201", "-3", "abc", "", "2.5", "1e2x"]) {
      setLimit(bad);
      assert.equal(getDailyReviewLimit(db), 20, `값 "${bad}"`);
    }
    db.exec("DELETE FROM settings WHERE key = 'daily_review_limit'");
    assert.equal(getDailyReviewLimit(db), 20);
  });
});
