// 백업(내보내기/가져오기/CSV) 테스트. 항상 임시 폴더의 임시 DB만 쓴다. 내 진짜 data/ 는 절대 건드리지 않는다.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { createCard, restoreCard, softDeleteCard } from "../src/lib/cards.ts";
import { openAndMigrate } from "../src/lib/db/connection.ts";
import { applyBackup, buildPreview, writeSnapshot } from "../src/lib/backup/import.ts";
import { buildBackup } from "../src/lib/backup/export.ts";
import { cardsToCsv, csvCell } from "../src/lib/backup/csv.ts";
import { checkLocalRequest } from "../src/lib/backup/guard.ts";
import { MAX_BACKUP_BYTES, seoulStamp, type BackupData } from "../src/lib/backup/format.ts";
import { parseBackup } from "../src/lib/backup/validate.ts";
import { applyReview } from "../src/lib/review.ts";
import { saveSettings } from "../src/lib/settings.ts";
import { startSession } from "../src/lib/timer.ts";

let dir: string;
let a: DatabaseSync; // 원본 데이터를 가진 DB
let b: DatabaseSync; // 가져오기 대상 DB
const NOW = new Date("2026-11-05T05:30:12.000Z");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "recallnote-backup-"));
  a = openAndMigrate(join(dir, "a.db"));
  b = openAndMigrate(join(dir, "b.db"));
});
afterEach(() => {
  a.close();
  b.close();
  rmSync(dir, { recursive: true, force: true });
});

const mk = (db: DatabaseSync, q: string, ans = "답", tags: string[] = [], source: string | null = null) =>
  createCard(db, { question: q, answer: ans, source, tags });
const count = (db: DatabaseSync, sql: string) => (db.prepare(sql).get() as { n: number }).n;

/** a 에 다양한 데이터를 채운다 */
function fill(db: DatabaseSync) {
  const c1 = mk(db, "<script>alert(1)</script> 해시란?", "한 방향 계산\n둘째 줄\t탭", ["보안", "Git"], "6회차 \"보안\", 기본");
  const c2 = mk(db, "이모지 😀와 한글, 쉼표, 따옴표 \"인용\"", "=1+1 수식처럼 보이는 답", ["git"]);
  const c3 = mk(db, "삭제할 카드", "답");
  db.prepare("INSERT INTO tags (name) VALUES ('안 쓰는 태그')").run();
  db.prepare("UPDATE cards SET box = 3, due_date = '2026-11-05' WHERE id = ?").run(c1);
  applyReview(db, c1, "right", "2026-11-05");
  applyReview(db, c2, "wrong", (db.prepare("SELECT date('now','+9 hours') AS d").get() as { d: string }).d);
  softDeleteCard(db, c3);
  saveSettings(db, { dailyReviewLimit: 33, focusMinutes: 25, breakMinutes: 5 });
  db.prepare("INSERT INTO study_sessions (started_at,planned_minutes,ended_at,status,focus_seconds) VALUES ('2026-11-02T01:00:00.000Z',50,'2026-11-02T01:50:00.000Z','completed',3000)").run();
  startSession(db, 50, NOW); // 진행 중 1개
}

const strip = (d: BackupData) => ({ ...d, exportedAt: "-" });
// 검사 테스트에서 일부러 틀린 값을 넣어 보려고 느슨한 타입을 쓴다
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const valid = (db: DatabaseSync = a): Record<string, any> => JSON.parse(JSON.stringify(buildBackup(db, NOW)));
const parse = (obj: unknown) => parseBackup(JSON.stringify(obj));

describe("왕복: 내보내기 → 가져오기", () => {
  test("모든 데이터가 똑같이 돌아온다 (번호, 보관함, 안 쓰는 태그, 설정, 진행 중 타이머 포함)", () => {
    fill(a);
    mk(b, "가져오면 사라질 카드", "옛 데이터", ["옛태그"]);
    const original = buildBackup(a, NOW);
    const parsed = parseBackup(JSON.stringify(original, null, 2));
    assert.ok(parsed.ok);
    const result = applyBackup(b, parsed.data, { snapshotDir: join(dir, "snap"), now: NOW });
    assert.deepEqual(strip(buildBackup(b, NOW)), strip(original));
    assert.deepEqual(result.counts, { cards: 2, archived: 1, tags: 3, reviews: 2, sessions: 2 });
    assert.equal(count(b, "SELECT count(*) AS n FROM cards WHERE question LIKE '%가져오면%'"), 0);
    assert.equal(count(b, "SELECT count(*) AS n FROM tags WHERE name = '옛태그'"), 0);
  });

  test("글자는 한 글자도 바뀌지 않는다 (HTML, 이모지, 줄바꿈, 탭, 따옴표)", () => {
    fill(a);
    const parsed = parseBackup(JSON.stringify(buildBackup(a, NOW)));
    assert.ok(parsed.ok);
    applyBackup(b, parsed.data, { snapshotDir: join(dir, "snap") });
    const row = b.prepare("SELECT question, answer, source FROM cards WHERE id = 1").get() as Record<string, string>;
    assert.equal(row.question, "<script>alert(1)</script> 해시란?");
    assert.equal(row.answer, "한 방향 계산\n둘째 줄\t탭");
    assert.equal(row.source, "6회차 \"보안\", 기본");
  });

  test("가져온 뒤 새로 만드는 카드 번호가 겹치지 않는다", () => {
    fill(a);
    const parsed = parseBackup(JSON.stringify(buildBackup(a, NOW)));
    assert.ok(parsed.ok);
    applyBackup(b, parsed.data, { snapshotDir: join(dir, "snap") });
    assert.equal(mk(b, "새 카드"), 4);
    restoreCard(b, 3); // 보관함 카드도 정상 동작
    assert.equal(count(b, "SELECT count(*) AS n FROM cards WHERE deleted_at IS NULL"), 4);
  });

  test("빈 DB를 가져와도 동작한다 (전부 비우기)", () => {
    mk(b, "지워질 카드");
    const parsed = parseBackup(JSON.stringify(buildBackup(a, NOW)));
    assert.ok(parsed.ok);
    applyBackup(b, parsed.data, { snapshotDir: join(dir, "snap") });
    assert.equal(count(b, "SELECT count(*) AS n FROM cards"), 0);
  });

  test("파일에 없는 설정은 현재 값을 유지한다", () => {
    saveSettings(b, { dailyReviewLimit: 77, focusMinutes: 20, breakMinutes: 4 });
    const data = valid();
    data.settings = { focus_minutes: "45" };
    const parsed = parse(data);
    assert.ok(parsed.ok);
    applyBackup(b, parsed.data, { snapshotDir: join(dir, "snap") });
    const get = (k: string) => (b.prepare("SELECT value FROM settings WHERE key = ?").get(k) as { value: string }).value;
    assert.equal(get("focus_minutes"), "45");
    assert.equal(get("daily_review_limit"), "77");
  });
});

describe("자동 안전 백업과 트랜잭션", () => {
  test("바꾸기 직전의 현재 데이터가 안전 백업 파일로 저장된다 (나만 읽기 권한)", () => {
    mk(b, "내 소중한 카드", "답", ["중요"]);
    const before = buildBackup(b, NOW);
    const parsed = parseBackup(JSON.stringify(buildBackup(a, NOW)));
    assert.ok(parsed.ok);
    const { snapshotPath } = applyBackup(b, parsed.data, { snapshotDir: join(dir, "snap"), now: NOW });
    assert.match(snapshotPath, /before-import-20261105-143012\.json$/); // 서울 시각 14:30:12
    assert.equal(statSync(snapshotPath).mode & 0o777, 0o600);
    const saved = parseBackup(readFileSync(snapshotPath, "utf8"));
    assert.ok(saved.ok);
    assert.deepEqual(strip(saved.data), strip(before));
  });

  test("같은 이름이 있으면 덮어쓰지 않고 번호를 붙인다", () => {
    const p1 = writeSnapshot(b, join(dir, "snap"), NOW);
    const p2 = writeSnapshot(b, join(dir, "snap"), NOW);
    assert.notEqual(p1, p2);
    assert.match(p2, /-1\.json$/);
    assert.equal(readdirSync(join(dir, "snap")).length, 2);
  });

  test("안전 백업을 저장하지 못하면 DB를 건드리지 않고 중단한다", () => {
    mk(b, "지켜야 할 카드");
    writeFileSync(join(dir, "not-a-dir"), "x"); // 폴더 자리에 파일이 있어서 만들 수 없음
    const parsed = parseBackup(JSON.stringify(buildBackup(a, NOW)));
    assert.ok(parsed.ok);
    assert.throws(() => applyBackup(b, parsed.data, { snapshotDir: join(dir, "not-a-dir", "snap") }));
    assert.equal(count(b, "SELECT count(*) AS n FROM cards WHERE question = '지켜야 할 카드'"), 1);
  });

  test("가져오는 도중 실패하면 전부 취소되어 DB가 그대로다", () => {
    fill(b);
    const before = buildBackup(b, NOW);
    // 검사를 통과하지 못할 데이터를 일부러 직접 만든다: 없는 카드를 가리키는 복습 기록 (DB의 외래키가 막는다)
    const bad = valid();
    bad.reviews = [{ id: 1, cardId: 9999, result: "right", boxBefore: 1, boxAfter: 2, reviewedAt: "2026-11-05T00:00:00.000Z" }];
    assert.throws(() => applyBackup(b, bad as BackupData, { snapshotDir: join(dir, "snap"), now: NOW }));
    assert.deepEqual(strip(buildBackup(b, NOW)), strip(before));
    assert.equal(readdirSync(join(dir, "snap")).length, 1); // 안전 백업은 남아 있다
  });
});

describe("미리보기", () => {
  test("현재와 가져올 개수를 나란히, 최근 활동이 더 새로우면 경고 표시", () => {
    fill(a);
    const x = mk(b, "x");
    b.prepare("UPDATE cards SET created_at = '2026-11-05T10:00:00.000Z', updated_at = '2026-11-05T10:00:00.000Z' WHERE id = ?").run(x);
    const data = valid();
    const parsed = parse(data);
    assert.ok(parsed.ok);
    const pv = buildPreview(b, parsed.data);
    assert.deepEqual(pv.current, { cards: 1, archived: 0, tags: 0, reviews: 0, sessions: 0 });
    assert.deepEqual(pv.incoming, { cards: 2, archived: 1, tags: 3, reviews: 2, sessions: 2 });
    assert.equal(pv.exportedAt, NOW.toISOString());
    assert.equal(pv.currentIsNewer, true); // b 의 카드(10:00)가 백업을 만든 시각(05:30)보다 새롭다
    const future = valid();
    future.exportedAt = "2099-01-01T00:00:00.000Z";
    const p2 = parse(future);
    assert.ok(p2.ok);
    assert.equal(buildPreview(b, p2.data).currentIsNewer, false);
  });
});

describe("파일 검사: 틀린 파일은 통째로 거부", () => {
  beforeEach(() => fill(a));

  test("정상 파일은 통과하고, 모르는 항목은 버려진다", () => {
    const data = valid();
    data.evil = "x";
    data.cards[0].extra = "y";
    const r = parse(data);
    assert.ok(r.ok);
    assert.ok(!("evil" in r.data) && !("extra" in r.data.cards[0]));
  });

  test("파일 모양이 아닌 경우", () => {
    const bad = (text: string, pattern: RegExp) => {
      const r = parseBackup(text);
      assert.ok(!r.ok && pattern.test(r.errors.join("\n")), text.slice(0, 30));
    };
    bad("이건 JSON이 아님", /JSON/);
    bad("[]", /모양/);
    bad("null", /모양/);
    bad('{"format":"other"}', /백업 파일이 아니에요/);
    bad(JSON.stringify({ ...valid(), version: 2 }), /더 새로운 버전/);
    bad(JSON.stringify({ ...valid(), version: 0 }), /지원하지 않는/);
    const noVersion = valid(); delete noVersion.version;
    bad(JSON.stringify(noVersion), /지원하지 않는/);
    bad("x".repeat(MAX_BACKUP_BYTES + 1), /너무 커요/);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutate: [string, (d: Record<string, any>) => void, RegExp][] = [
    ["exportedAt 모양", (d) => { d.exportedAt = "어제"; }, /exportedAt/],
    ["목록 빠짐", (d) => { delete d.cards; }, /cards/],
    ["상자 9", (d) => { d.cards[0].box = 9; }, /cards\[0\]\.box/],
    ["상자 문자", (d) => { d.cards[0].box = "3"; }, /cards\[0\]\.box/],
    ["없는 날짜 2월 30일", (d) => { d.cards[0].dueDate = "2026-02-30"; }, /dueDate/],
    ["날짜 모양", (d) => { d.cards[0].dueDate = "11/05/2026"; }, /dueDate/],
    ["빈 질문", (d) => { d.cards[0].question = "   "; }, /question/],
    ["너무 긴 답", (d) => { d.cards[0].answer = "가".repeat(5001); }, /answer/],
    ["너무 긴 출처", (d) => { d.cards[0].source = "s".repeat(201); }, /source/],
    ["종류 cloze", (d) => { d.cards[0].type = "cloze"; }, /type/],
    ["카드 번호 중복", (d) => { d.cards[1].id = d.cards[0].id; }, /번호/],
    ["카드 번호 0", (d) => { d.cards[0].id = 0; }, /id/],
    ["태그 목록에 없는 태그", (d) => { d.cards[0].tags = ["없는태그"]; }, /없는 태그/],
    ["같은 태그 두 번", (d) => { d.cards[0].tags = ["보안", "보안"]; }, /두 번/],
    ["태그 이름 중복(대소문자)", (d) => { d.tags.push({ name: "GIT", createdAt: "2026-11-05T00:00:00.000Z" }); }, /두 번/],
    ["태그 이름 공백", (d) => { d.tags[0].name = " 보안"; }, /tags\[0\]\.name/],
    ["삭제 시각 모양", (d) => { d.cards[0].deletedAt = "삭제됨"; }, /deletedAt/],
    ["없는 카드를 가리키는 복습", (d) => { d.reviews[0].cardId = 9999; }, /없는 카드/],
    ["복습 결과 값", (d) => { d.reviews[0].result = "great"; }, /result/],
    ["복습 상자 0", (d) => { d.reviews[0].boxAfter = 0; }, /boxAfter/],
    ["진행 중 타이머 2개", (d) => { d.studySessions.push({ ...d.studySessions[1], id: 99 }); }, /하나만/],
    ["진행 중인데 종료 시각 있음", (d) => { d.studySessions[1].endedAt = "2026-11-05T06:00:00.000Z"; }, /endedAt/],
    ["끝난 기록인데 종료 시각 없음", (d) => { d.studySessions[0].endedAt = null; }, /endedAt/],
    ["집중 초가 계획보다 큼", (d) => { d.studySessions[0].focusSeconds = 999999; }, /focusSeconds/],
    ["타이머 상태 값", (d) => { d.studySessions[0].status = "paused"; }, /status/],
    ["모르는 설정 이름", (d) => { d.settings.evil = "1"; }, /settings\.evil/],
    ["설정 범위 밖", (d) => { d.settings.focus_minutes = "9999"; }, /focus_minutes/],
    ["설정이 숫자 아님", (d) => { d.settings.break_minutes = "abc"; }, /break_minutes/],
  ];
  for (const [name, change, pattern] of mutate) {
    test(name, () => {
      const data = valid();
      change(data);
      const r = parse(data);
      assert.ok(!r.ok, "거부되어야 한다");
      assert.match(r.errors.join("\n"), pattern);
    });
  }

  test("오류가 아주 많아도 20개까지만 알려 준다", () => {
    const data = valid();
    data.cards = Array.from({ length: 200 }, (_, i) => ({ ...data.cards[0], id: i + 1, box: 99 }));
    data.reviews = [];
    const r = parse(data);
    assert.ok(!r.ok && r.errors.length <= 20);
  });

  test("__proto__ 같은 위험한 이름이 들어 있어도 안전하다", () => {
    const text = JSON.stringify(valid()).replace('"settings":{', '"settings":{"__proto__":"1",');
    const r = parseBackup(text);
    assert.ok(!r.ok); // 모르는 설정 이름으로 거부
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
  });
});

describe("CSV", () => {
  /** 테스트용 간단한 CSV 읽기 (따옴표·줄바꿈 처리) */
  function readCsv(text: string): string[][] {
    const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\r") { /* 무시 */ }
      else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    return rows;
  }

  test("칸 처리: 쉼표·따옴표·줄바꿈은 감싸고, 수식으로 시작하면 ' 를 붙인다", () => {
    assert.equal(csvCell("plain"), "plain");
    assert.equal(csvCell("a,b"), '"a,b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell("줄1\n줄2"), '"줄1\n줄2"');
    for (const bad of ["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"]) assert.ok(csvCell(bad).replace(/^"/, "").startsWith("'"), bad);
    assert.equal(csvCell("a=b"), "a=b"); // 중간의 = 는 그대로
    assert.equal(csvCell(null), "");
    assert.equal(csvCell(3), "3");
  });

  test("전체: BOM, 한글, 줄바꿈 CRLF, 열 개수, 보관함 표시, 서울 시각", () => {
    fill(a);
    const csv = cardsToCsv(buildBackup(a, NOW).cards);
    assert.ok(csv.startsWith("﻿번호,질문,답,출처,태그,상자,복습 예정일,만든 때(KST),고친 때(KST),보관함\r\n"));
    const rows = readCsv(csv.slice(1));
    assert.equal(rows.length, 4); // 머리글 + 카드 3장
    assert.ok(rows.every((r) => r.length === 10), "모든 줄이 10칸");
    assert.equal(rows[1][1], "<script>alert(1)</script> 해시란?");
    assert.equal(rows[1][2], "한 방향 계산\n둘째 줄\t탭");
    assert.equal(rows[1][3], '6회차 "보안", 기본');
    assert.equal(rows[1][4], "Git; 보안");
    assert.equal(rows[2][2], "'=1+1 수식처럼 보이는 답"); // 수식 방어
    assert.equal(rows[3][9], "예"); // 삭제한 카드
    assert.equal(rows[1][9], "");
    assert.match(rows[1][7], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  test("카드가 없어도 머리글만 나온다", () => {
    assert.equal(cardsToCsv([]), "﻿번호,질문,답,출처,태그,상자,복습 예정일,만든 때(KST),고친 때(KST),보관함\r\n");
  });
});

describe("요청 검사 (다른 사이트가 몰래 보내는 요청 막기)", () => {
  const req = (headers: Record<string, string>) => ({ headers: new Headers(headers) });
  test("정상 요청", () => {
    assert.equal(checkLocalRequest(req({ host: "127.0.0.1:3000" })), null);
    assert.equal(checkLocalRequest(req({ host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin" })), null);
    assert.equal(checkLocalRequest(req({ host: "[::1]:3000", "x-recallnote": "1" }), { requireHeader: true }), null);
    assert.equal(checkLocalRequest(req({ host: "127.0.0.1:3000", "sec-fetch-site": "none" })), null); // 주소창으로 직접 연 경우
  });
  test("거부", () => {
    assert.ok(checkLocalRequest(req({ host: "evil.example:3000" })));
    assert.ok(checkLocalRequest(req({ host: "127.0.0.1.evil.example" })));
    assert.ok(checkLocalRequest(req({})));
    assert.ok(checkLocalRequest(req({ host: "127.0.0.1:3000", origin: "https://evil.example" })));
    assert.ok(checkLocalRequest(req({ host: "127.0.0.1:3000", origin: "not a url" })));
    assert.ok(checkLocalRequest(req({ host: "127.0.0.1:3000", "sec-fetch-site": "cross-site" })));
    assert.ok(checkLocalRequest(req({ host: "127.0.0.1:3000" }), { requireHeader: true })); // 헤더 없음
    assert.ok(checkLocalRequest(req({ host: "127.0.0.1:3000", "x-recallnote": "0" }), { requireHeader: true }));
  });
});

describe("파일 이름", () => {
  test("seoulStamp", () => {
    assert.equal(seoulStamp(new Date("2026-11-05T05:30:12.000Z")), "20261105-143012");
    assert.equal(seoulStamp(new Date("2026-11-05T15:00:00.000Z")), "20261106-000000"); // 서울 자정 넘김
  });
  test("테스트가 진짜 data/ 를 만들지 않았다", () => {
    assert.equal(existsSync(join(process.cwd(), "data")), false);
  });
});
