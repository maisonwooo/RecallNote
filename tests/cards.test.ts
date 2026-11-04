// 카드 로직 테스트. 항상 임시 DB만 쓴다.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { parseCardInput, parseTags } from "../src/lib/card-input.ts";
import {
  countCards,
  createCard,
  escapeLike,
  getCard,
  listTagCounts,
  listArchived,
  listCards,
  restoreCard,
  softDeleteCard,
  updateCard,
} from "../src/lib/cards.ts";
import { openAndMigrate } from "../src/lib/db/connection.ts";
import { withTransaction } from "../src/lib/db/transaction.ts";

let dir: string;
let db: DatabaseSync;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "recallnote-cards-"));
  db = openAndMigrate(join(dir, "test.db"));
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const make = (question: string, answer = "답", tags: string[] = [], source: string | null = null) =>
  createCard(db, { question, answer, source, tags });
const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

describe("입력 검사 parseCardInput / parseTags", () => {
  test("태그: 쉼표로 나누고, 공백·#을 정리하고, 대소문자 다른 중복은 하나만", () => {
    assert.deepEqual(parseTags(" 보안, #http ,Git,git,  GIT , ,쉘  스크립트 "), ["보안", "http", "Git", "쉘 스크립트"]);
    assert.deepEqual(parseTags(""), []);
    assert.deepEqual(parseTags("가，나、다"), ["가", "나", "다"]);
  });

  test("정상 값은 다듬어서 통과", () => {
    const r = parseCardInput({ question: "  Q?  ", answer: "A\r\nB", source: " 3주차 \n 4회 ", tags: "a, b" });
    assert.ok(r.ok);
    assert.deepEqual(r.value, { question: "Q?", answer: "A\nB", source: "3주차 4회", tags: ["a", "b"] });
    const empty = parseCardInput({ question: "q", answer: "a", source: "  " });
    assert.ok(empty.ok);
    assert.equal(empty.value.source, null);
  });

  test("필수값·길이 제한 위반은 오류와 함께 입력값을 돌려준다", () => {
    const r = parseCardInput({ question: "  ", answer: "x".repeat(5001), source: "s".repeat(201), tags: "t" });
    assert.ok(!r.ok);
    assert.deepEqual(Object.keys(r.errors).sort(), ["answer", "question", "source"]);
    assert.equal(r.values.tags, "t");
    const manyTags = parseCardInput({ question: "q", answer: "a", tags: "1,2,3,4,5,6,7,8,9,10,11" });
    assert.ok(!manyTags.ok && manyTags.errors.tags);
    const longTag = parseCardInput({ question: "q", answer: "a", tags: "가".repeat(31) });
    assert.ok(!longTag.ok && longTag.errors.tags);
  });

  test("글자가 아닌 값이 와도 죽지 않는다", () => {
    const r = parseCardInput({ question: null, answer: undefined, source: 5, tags: {} });
    assert.ok(!r.ok);
  });
});

describe("카드 만들기·보기·수정", () => {
  test("새 카드는 상자 1, 복습 예정일은 서울 오늘, type 은 qa", () => {
    const id = make("질문", "답", [], "출처");
    const card = getCard(db, id)!;
    const today = (db.prepare("SELECT date('now','+9 hours') AS d").get() as { d: string }).d;
    assert.equal(card.box, 1);
    assert.equal(card.dueDate, today);
    assert.equal(card.type, "qa");
    assert.equal(card.source, "출처");
    assert.equal(card.deletedAt, null);
    assert.deepEqual(Object.getPrototypeOf(card), Object.prototype); // 평범한 객체(화면에 넘겨도 안전)
  });

  test("태그는 대소문자 구분 없이 한 줄만 만들어진다", () => {
    const a = make("a", "a", ["Git", "보안"]);
    const b = make("b", "b", ["git"]);
    assert.equal(count("SELECT count(*) AS n FROM tags"), 2);
    assert.deepEqual(getCard(db, a)!.tags, ["Git", "보안"]);
    assert.deepEqual(getCard(db, b)!.tags, ["Git"]); // 처음 만든 표기를 유지
  });

  test("태그 저장이 실패하면 카드 저장도 통째로 취소된다(트랜잭션)", () => {
    assert.throws(() => make("실패할 카드", "답", ["정상태그", ""]));
    assert.equal(count("SELECT count(*) AS n FROM cards"), 0);
    assert.equal(count("SELECT count(*) AS n FROM tags"), 0);
  });

  test("withTransaction: 오류가 나면 앞의 작업도 취소", () => {
    assert.throws(() =>
      withTransaction(db, () => {
        db.exec("INSERT INTO tags (name) VALUES ('임시')");
        throw new Error("boom");
      }),
    );
    assert.equal(count("SELECT count(*) AS n FROM tags"), 0);
  });

  test("수정: 내용과 태그가 바뀌고 updated_at 이 갱신된다, 상자·예정일은 그대로", () => {
    const id = make("옛 질문", "옛 답", ["a", "b"]);
    db.exec(`UPDATE cards SET box = 3, due_date = '2030-01-01', updated_at = '2000-01-01T00:00:00.000Z' WHERE id = ${id}`);
    assert.equal(updateCard(db, id, { question: "새 질문", answer: "새 답", source: null, tags: ["b", "c"] }), true);
    const card = getCard(db, id)!;
    assert.equal(card.question, "새 질문");
    assert.deepEqual(card.tags, ["b", "c"]);
    assert.equal(card.box, 3);
    assert.equal(card.dueDate, "2030-01-01");
    assert.notEqual(card.updatedAt, "2000-01-01T00:00:00.000Z");
  });

  test("없는 카드·보관함 카드는 수정되지 않는다", () => {
    assert.equal(updateCard(db, 999, { question: "q", answer: "a", source: null, tags: [] }), false);
    const id = make("q");
    softDeleteCard(db, id);
    assert.equal(updateCard(db, id, { question: "x", answer: "a", source: null, tags: [] }), false);
    assert.equal(getCard(db, id)!.question, "q");
  });
});

describe("소프트 삭제와 복원", () => {
  test("삭제하면 목록에서 빠지고 보관함에 나오고, 복원하면 돌아온다", () => {
    const id = make("지울 카드", "답", ["x"]);
    make("남을 카드");
    assert.equal(softDeleteCard(db, id), true);
    assert.equal(softDeleteCard(db, id), false); // 두 번째는 변화 없음
    assert.deepEqual(listCards(db).cards.map((c) => c.question), ["남을 카드"]);
    assert.deepEqual(listArchived(db).map((c) => c.id), [id]);
    assert.deepEqual(countCards(db), { active: 1, archived: 1 });
    assert.equal(count("SELECT count(*) AS n FROM cards"), 2); // 진짜로 지워지지 않음
    assert.equal(restoreCard(db, id), true);
    assert.equal(restoreCard(db, id), false);
    assert.equal(listCards(db).cards.length, 2);
    assert.equal(getCard(db, id)!.deletedAt, null);
  });
});

describe("목록·검색·태그 거르기", () => {
  test("최근 만든 순", () => {
    const a = make("첫째");
    const b = make("둘째");
    const c = make("셋째");
    db.exec(`UPDATE cards SET created_at = '2026-01-01T00:00:00.000Z' WHERE id = ${a}`);
    db.exec(`UPDATE cards SET created_at = '2026-03-01T00:00:00.000Z' WHERE id = ${b}`);
    db.exec(`UPDATE cards SET created_at = '2026-02-01T00:00:00.000Z' WHERE id = ${c}`);
    assert.deepEqual(listCards(db).cards.map((x) => x.question), ["둘째", "셋째", "첫째"]);
  });

  test("질문·답 글자 검색, 특수문자(% _ \\)는 그냥 글자로 찾는다", () => {
    make("해시란?", "한 방향 계산");
    make("100% 확률", "퍼센트 기호");
    make("snake_case", "밑줄");
    make("경로 a\\b", "역슬래시");
    make("그냥 카드", "내용 abc");
    const find = (q: string) => listCards(db, { q }).cards.map((c) => c.question);
    assert.deepEqual(find("해시"), ["해시란?"]);
    assert.deepEqual(find("방향"), ["해시란?"]); // 답에서도 찾음
    assert.deepEqual(find("ABC"), ["그냥 카드"]); // 영문 대소문자 무시
    assert.deepEqual(find("%"), ["100% 확률"]);
    assert.deepEqual(find("_"), ["snake_case"]);
    assert.deepEqual(find("\\"), ["경로 a\\b"]);
    assert.deepEqual(find("' OR 1=1 --"), []); // SQL 주입 시도는 그냥 글자
    assert.equal(find("   ").length, 5); // 공백만이면 검색 안 한 것과 같음
    assert.equal(escapeLike("a%b_c\\"), "a\\%b\\_c\\\\");
  });

  test("태그로 거르기(대소문자 무시)와 검색 동시 사용, 삭제된 카드 제외", () => {
    make("g1", "x", ["Git"]);
    make("g2 해시", "x", ["git", "보안"]);
    const gone = make("g3", "x", ["git"]);
    make("other", "x", ["http"]);
    softDeleteCard(db, gone);
    assert.deepEqual(listCards(db, { tag: "GIT" }).cards.map((c) => c.question).sort(), ["g1", "g2 해시"]);
    assert.deepEqual(listCards(db, { tag: "git", q: "해시" }).cards.map((c) => c.question), ["g2 해시"]);
    assert.deepEqual(listCards(db, { tag: "없는태그" }).cards, []);
  });

  test("태그별 카드 장수: 삭제된 카드에만 붙은 태그와 안 쓰는 태그는 빠지고, 많은 순으로 나온다", () => {
    make("a", "x", ["보안", "Git"]);
    make("a2", "x", ["보안"]);
    const del = make("a3", "x", ["보안", "Git"]);
    softDeleteCard(db, del); // 삭제된 카드는 세지 않는다
    const only = make("b", "x", ["지워질태그"]);
    softDeleteCard(db, only);
    const id = make("c", "x", ["잠깐"]);
    updateCard(db, id, { question: "c", answer: "x", source: null, tags: [] }); // 태그만 빠지고 tags 행은 남음
    assert.equal(count("SELECT count(*) AS n FROM tags WHERE name = '잠깐'"), 1);
    assert.deepEqual(listTagCounts(db), [
      { name: "보안", count: 2 },
      { name: "Git", count: 1 },
    ]);
  });

  test("더 보기: limit 보다 많으면 hasMore", () => {
    for (let i = 0; i < 5; i++) make(`카드${i}`);
    const r = listCards(db, { limit: 3 });
    assert.equal(r.cards.length, 3);
    assert.equal(r.hasMore, true);
    assert.equal(listCards(db, { limit: 5 }).hasMore, false);
  });

  test("HTML 같은 글도 그대로 저장된다(화면에서 이스케이프는 React가 담당)", () => {
    const id = make("<script>alert(1)</script>", "<img src=x onerror=alert(1)>");
    assert.equal(getCard(db, id)!.question, "<script>alert(1)</script>");
  });
});
