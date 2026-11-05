// 학습 기록 → 카드 가져오기 테스트. 항상 임시 폴더·임시 DB만 쓴다 (진짜 ~/learning-log 와 data/ 는 건드리지 않는다).
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { getCard, listCards, softDeleteCard } from "../src/lib/cards.ts";
import { openAndMigrate } from "../src/lib/db/connection.ts";
import { MAX_LOG_BYTES, makeKey, parseLearningLog, toCardInput } from "../src/lib/learning-log/parse.ts";
import { displayPath, learningLogPath, readLearningLog } from "../src/lib/learning-log/read.ts";
import { buildSyncOverview, importRows, MAX_KEYS_PER_CALL, skipRows, unskipRows } from "../src/lib/learning-log/sync.ts";

const HEADER = "| 날짜 | 프로젝트 | 주제 | 몰랐던 점 | 카드 질문 | 내가 이해한 한 줄 | 카드화 |\n|---|---|---|---|---|---|---|";
const row = (date: string, project: string, topic: string, notKnown: string, q: string, a: string, done = "") =>
  `| ${date} | ${project} | ${topic} | ${notKnown} | ${q} | ${a} | ${done} |`;
const table = (...rows: string[]) => `# 제목\n설명 글\n\n${HEADER}\n${rows.join("\n")}\n`;

let dir: string;
let db: DatabaseSync;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "recallnote-learn-"));
  db = openAndMigrate(join(dir, "test.db"));
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("표 읽기", () => {
  test("정상 줄은 후보(ready)가 되고, 칸이 다듬어진다", () => {
    const log = parseLearningLog(table(row("2026-11-05", "RecallNote", "SQL 별명", "`AS n`이 뭔지 몰랐음", "SQL의 `AS 이름`은 무엇인가요?", "별명이다")));
    assert.deepEqual(log.problems, []);
    assert.equal(log.rows.length, 1);
    const r = log.rows[0];
    assert.deepEqual(
      { date: r.date, project: r.project, topic: r.topic, question: r.question, answer: r.answer, ready: r.ready, reason: r.reason },
      { date: "2026-11-05", project: "RecallNote", topic: "SQL 별명", question: "SQL의 `AS 이름`은 무엇인가요?", answer: "별명이다", ready: true, reason: null },
    );
    assert.equal(r.key, makeKey("2026-11-05", "RecallNote", "SQL 별명", "`AS n`이 뭔지 몰랐음"));
    assert.match(r.key, /^[0-9a-f]{16}$/);
    assert.equal(r.line, 6); // 파일의 6번째 줄
  });

  test("칸 안의 \\| 는 | 글자로 읽고, 카드화 칸 내용은 상관없다", () => {
    const log = parseLearningLog(table(row("2026-11-04", "RecallNote", "SQL 조건", "`\\|\\|`로 이으려 함", "조건은 무엇으로 잇나요? (`\\|\\|`는?)", "AND/OR이고 `\\|\\|`는 글자 잇기", "완료")));
    assert.equal(log.rows[0].notKnown, "`||`로 이으려 함");
    assert.equal(log.rows[0].question, "조건은 무엇으로 잇나요? (`||`는?)");
    assert.equal(log.rows[0].answer, "AND/OR이고 `||`는 글자 잇기");
    assert.ok(log.rows[0].ready);
  });

  test("열 순서가 바뀌어도, 오른쪽 끝 | 가 없어도 이름으로 찾아 읽는다", () => {
    const text = [
      "| 카드 질문 | 내가 이해한 한 줄 | 날짜 | 주제 | 프로젝트 | 몰랐던 점",
      "|---|---|---|---|---|---",
      "| 질문? | 답이다 | 2026-11-05 | 주제 | P | 몰랐던 것",
    ].join("\n");
    const log = parseLearningLog(text);
    assert.equal(log.rows.length, 1);
    assert.deepEqual({ q: log.rows[0].question, a: log.rows[0].answer, p: log.rows[0].project, ready: log.rows[0].ready }, { q: "질문?", a: "답이다", p: "P", ready: true });
  });

  test("윈도우 줄바꿈(CRLF)과 표 밖의 글은 무시한다", () => {
    const log = parseLearningLog(table(row("2026-11-05", "P", "T", "N", "Q?", "A")).replaceAll("\n", "\r\n") + "\r\n표가 끝난 뒤의 글\r\n");
    assert.equal(log.rows.length, 1);
    assert.deepEqual(log.problems, []);
  });

  test("후보가 못 되는 줄: 답 없음, 질문 없음, 너무 긺, 같은 줄 중복 (이유가 붙는다)", () => {
    const log = parseLearningLog(
      table(
        row("2026-11-05", "P", "답없음", "N1", "질문1?", ""),
        row("2026-11-05", "P", "질문없음", "N2", "", "답"),
        row("2026-11-05", "P", "긴질문", "N3", "가".repeat(501), "답"),
        row("2026-11-05", "P", "긴답", "N4", "Q?", "가".repeat(5001)),
        row("2026-11-05", "P", "중복", "N5", "Q?", "A"),
        row("2026-11-05", "P", "중복", "N5", "Q?", "A"),
      ),
    );
    assert.deepEqual(log.rows.map((r) => r.ready), [false, false, false, false, true, false]);
    assert.match(log.rows[0].reason ?? "", /이해한 한 줄이 없어요/);
    assert.match(log.rows[1].reason ?? "", /카드 질문이 비어/);
    assert.match(log.rows[2].reason ?? "", /500자/);
    assert.match(log.rows[3].reason ?? "", /5000자/);
    assert.match(log.rows[5].reason ?? "", /같은 줄이 위에도/);
  });

  test("읽을 수 없는 줄은 문제로 알려 주고 나머지는 계속 읽는다", () => {
    const log = parseLearningLog(
      table(
        "| 2026-11-05 | P | 칸이 모자람 | N |",
        row("11/05/2026", "P", "날짜모양", "N", "Q?", "A"),
        row("2026-11-05", "", "프로젝트없음", "N", "Q?", "A"),
        row("2026-11-05", "P", "정상", "N", "Q?", "A"),
      ),
    );
    assert.equal(log.rows.length, 1);
    assert.equal(log.problems.length, 3);
    assert.match(log.problems[0], /칸 수가/);
  });

  test("머리글이 없거나 열이 모자라면 이유를 알려 준다", () => {
    assert.match(parseLearningLog("그냥 글").problems[0], /머리글을 찾지 못했어요/);
    const noQuestion = "| 날짜 | 프로젝트 | 주제 | 몰랐던 점 | 내가 이해한 한 줄 | 카드화 |\n|---|---|---|---|---|---|\n| 2026-11-05 | P | T | N | A | |";
    const r = parseLearningLog(noQuestion);
    assert.equal(r.rows.length, 0);
    assert.match(r.problems[0], /카드 질문/);
    assert.deepEqual(parseLearningLog("").rows, []);
  });

  test("너무 큰 글은 거부한다", () => {
    assert.match(parseLearningLog("x".repeat(MAX_LOG_BYTES + 1)).problems[0], /너무 커요/);
  });

  test("표식(key): 같은 칸이면 같고, 하나라도 다르면 다르다. 질문·답을 고쳐도 표식은 그대로", () => {
    const a = makeKey("2026-11-05", "P", "T", "N");
    assert.equal(a, makeKey("2026-11-05", "P", "T", "N"));
    for (const other of [makeKey("2026-11-06", "P", "T", "N"), makeKey("2026-11-05", "Q", "T", "N"), makeKey("2026-11-05", "P", "U", "N"), makeKey("2026-11-05", "P", "T", "M")]) assert.notEqual(a, other);
    const k1 = parseLearningLog(table(row("2026-11-05", "P", "T", "N", "질문 v1", "답 v1"))).rows[0].key;
    const k2 = parseLearningLog(table(row("2026-11-05", "P", "T", "N", "질문 v2", "답 v2"))).rows[0].key;
    assert.equal(k1, k2);
  });

  test("카드 입력값: 태그는 프로젝트와 주제, 출처는 '학습 기록 날짜', 긴 태그는 뺀다", () => {
    const [r] = parseLearningLog(table(row("2026-11-05", "RecallNote", "SQL 별명", "N", "Q?", "A"))).rows;
    assert.deepEqual(toCardInput(r), { question: "Q?", answer: "A", source: "학습 기록 2026-11-05", tags: ["RecallNote", "SQL 별명"] });
    const [long] = parseLearningLog(table(row("2026-11-05", "P", "가".repeat(31), "N", "Q?", "A"))).rows;
    assert.deepEqual(toCardInput(long).tags, ["P"]);
    const [same] = parseLearningLog(table(row("2026-11-05", "git", "GIT", "N", "Q?", "A"))).rows;
    assert.deepEqual(toCardInput(same).tags, ["git"]); // 대소문자만 다른 중복은 하나만
  });
});

describe("파일 읽기", () => {
  test("정상 파일, 없는 파일, 바로가기, 폴더, 너무 큰 파일", () => {
    const file = join(dir, "confusions.md");
    writeFileSync(file, "내용");
    const ok = readLearningLog(file);
    assert.ok(ok.ok && ok.text === "내용");
    const missing = readLearningLog(join(dir, "없음.md"));
    assert.ok(!missing.ok && /찾지 못했어요/.test(missing.reason));
    symlinkSync(file, join(dir, "link.md"));
    const link = readLearningLog(join(dir, "link.md"));
    assert.ok(!link.ok && /바로가기/.test(link.reason));
    const folder = readLearningLog(dir);
    assert.ok(!folder.ok);
    writeFileSync(join(dir, "big.md"), "x".repeat(MAX_LOG_BYTES + 1));
    const big = readLearningLog(join(dir, "big.md"));
    assert.ok(!big.ok && /너무 커요/.test(big.reason));
  });

  test("기본 위치는 ~/learning-log/confusions.md 이고, 환경변수로 바꿀 수 있다", () => {
    const saved = process.env.RECALLNOTE_LEARNING_LOG;
    delete process.env.RECALLNOTE_LEARNING_LOG;
    assert.match(learningLogPath(), /learning-log\/confusions\.md$/);
    assert.match(displayPath(learningLogPath()), /^~\/learning-log\/confusions\.md$/);
    process.env.RECALLNOTE_LEARNING_LOG = join(dir, "x.md");
    assert.equal(learningLogPath(), join(dir, "x.md"));
    if (saved === undefined) delete process.env.RECALLNOTE_LEARNING_LOG;
    else process.env.RECALLNOTE_LEARNING_LOG = saved;
  });
});

describe("카드로 만들기 / 건너뛰기", () => {
  const sample = () =>
    parseLearningLog(
      table(
        row("2026-11-05", "RecallNote", "A주제", "A몰랐음", "A 질문?", "A 답"),
        row("2026-11-05", "RecallNote", "B주제", "B몰랐음", "B 질문?", "B 답"),
        row("2026-11-05", "ClaudeMeter", "C주제", "C몰랐음", "C 질문?", ""),
      ),
    );
  const keysOf = (log: ReturnType<typeof sample>) => log.rows.map((r) => r.key);

  test("처음에는 후보 2개, 답 없는 1개는 후보 아님", () => {
    const o = buildSyncOverview(db, sample());
    assert.deepEqual({ total: o.total, fresh: o.fresh.length, notReady: o.notReady.length, imported: o.imported, skipped: o.skipped.length }, { total: 3, fresh: 2, notReady: 1, imported: 0, skipped: 0 });
  });

  test("고른 줄만 카드가 된다: 상자 1, 오늘 복습, 태그·출처 자동, 표식 기록", () => {
    const log = sample();
    const r = importRows(db, log, [keysOf(log)[0]]);
    assert.equal(r.created, 1);
    const card = getCard(db, r.cardIds[0])!;
    assert.deepEqual({ q: card.question, a: card.answer, source: card.source, tags: card.tags, box: card.box }, { q: "A 질문?", a: "A 답", source: "학습 기록 2026-11-05", tags: ["A주제", "RecallNote"], box: 1 }); // 태그는 이름순
    assert.equal(card.dueDate, (db.prepare("SELECT date('now','+9 hours') AS d").get() as { d: string }).d);
    const o = buildSyncOverview(db, log);
    assert.deepEqual({ fresh: o.fresh.length, imported: o.imported }, { fresh: 1, imported: 1 });
  });

  test("같은 줄을 두 번 눌러도 카드는 한 장 (멱등)", () => {
    const log = sample();
    const key = keysOf(log)[0];
    assert.equal(importRows(db, log, [key]).created, 1);
    const again = importRows(db, log, [key, key]);
    assert.equal(again.created, 0);
    assert.deepEqual(again.ignored, [{ key, reason: "already" }]);
    assert.equal(count(db, "SELECT count(*) AS n FROM cards"), 1);
  });

  test("카드를 삭제(보관함)해도, 진짜로 지워도 같은 줄이 다시 만들어지지 않는다", () => {
    const log = sample();
    const key = keysOf(log)[0];
    const { cardIds } = importRows(db, log, [key]);
    softDeleteCard(db, cardIds[0]);
    assert.equal(importRows(db, log, [key]).created, 0);
    db.prepare("DELETE FROM cards WHERE id = ?").run(cardIds[0]); // 진짜 삭제
    assert.equal(importRows(db, log, [key]).created, 0);
    assert.equal(buildSyncOverview(db, log).imported, 1);
  });

  test("파일에 없는 표식, 후보 아닌 줄, 이상한 표식, 중복 표식은 무시한다 (화면 값을 믿지 않는다)", () => {
    const log = sample();
    const [a, , c] = keysOf(log);
    const r = importRows(db, log, ["0123456789abcdef", c, "BAD", "../../x", a, a]);
    assert.equal(r.created, 1);
    assert.deepEqual(r.ignored.map((i) => i.reason).sort(), ["invalid", "invalid", "not-in-file", "not-ready"]);
    assert.equal(count(db, "SELECT count(*) AS n FROM cards"), 1);
  });

  test("한 번에 200개를 넘으면 거부한다", () => {
    const keys = Array.from({ length: MAX_KEYS_PER_CALL + 1 }, (_, i) => i.toString(16).padStart(16, "0"));
    assert.throws(() => importRows(db, sample(), keys), /200개/);
    assert.throws(() => skipRows(db, sample(), keys), /200개/);
  });

  test("도중에 실패하면 카드도 표식도 전부 취소된다", () => {
    const log = sample();
    db.exec("CREATE TRIGGER boom BEFORE INSERT ON learning_sources WHEN NEW.source_key = '" + keysOf(log)[1] + "' BEGIN SELECT RAISE(ABORT, 'boom'); END;");
    assert.throws(() => importRows(db, log, keysOf(log).slice(0, 2)), /boom/);
    assert.equal(count(db, "SELECT count(*) AS n FROM cards"), 0);
    assert.equal(count(db, "SELECT count(*) AS n FROM learning_sources"), 0);
    assert.equal(count(db, "SELECT count(*) AS n FROM tags"), 0);
  });

  test("건너뛰기와 되돌리기", () => {
    const log = sample();
    const [a, b, c] = keysOf(log);
    assert.equal(skipRows(db, log, [a, c, "0123456789abcdef"]), 1); // 후보인 a 만 (c 는 후보 아님, 없는 표식)
    let o = buildSyncOverview(db, log);
    assert.deepEqual({ fresh: o.fresh.map((r) => r.key), skipped: o.skipped.map((r) => r.key) }, { fresh: [b], skipped: [a] });
    assert.equal(importRows(db, log, [a]).created, 0); // 건너뛴 줄은 카드로 안 만든다
    assert.equal(skipRows(db, log, [a]), 0); // 두 번 눌러도 그대로
    assert.equal(unskipRows(db, [a]), 1);
    o = buildSyncOverview(db, log);
    assert.equal(o.fresh.length, 2);
    importRows(db, log, [b]);
    assert.equal(unskipRows(db, [b]), 0); // 카드로 만든 줄은 되돌리기 대상이 아니다
    assert.equal(buildSyncOverview(db, log).imported, 1);
  });

  test("답을 나중에 채우면 같은 표식 그대로 후보가 된다", () => {
    const before = parseLearningLog(table(row("2026-11-05", "P", "T", "N", "Q?", "")));
    assert.equal(buildSyncOverview(db, before).fresh.length, 0);
    const after = parseLearningLog(table(row("2026-11-05", "P", "T", "N", "Q?", "이제 안다")));
    assert.equal(before.rows[0].key, after.rows[0].key);
    assert.equal(buildSyncOverview(db, after).fresh.length, 1);
  });

  test("파일의 몰랐던 점을 고치면 표식이 바뀌어 새 후보로 보인다 (알려진 동작)", () => {
    importRows(db, parseLearningLog(table(row("2026-11-05", "P", "T", "원래 문장", "Q?", "A"))), [makeKey("2026-11-05", "P", "T", "원래 문장")]);
    const edited = parseLearningLog(table(row("2026-11-05", "P", "T", "고친 문장", "Q?", "A")));
    assert.equal(buildSyncOverview(db, edited).fresh.length, 1);
  });

  test("HTML 같은 글도 그대로 카드에 저장된다 (화면에서 이스케이프는 React가 한다)", () => {
    const log = parseLearningLog(table(row("2026-11-05", "P", "T", "N", "<script>alert(1)</script> 질문?", "<img src=x onerror=alert(1)>")));
    const { cardIds } = importRows(db, log, [log.rows[0].key]);
    assert.equal(getCard(db, cardIds[0])!.question, "<script>alert(1)</script> 질문?");
    assert.equal(listCards(db).cards.length, 1);
  });

  test("테스트가 진짜 data/ 나 ~/learning-log 를 건드리지 않았다", () => {
    assert.equal(existsSync(join(process.cwd(), "data")), false);
  });
});

function count(db: DatabaseSync, sql: string): number {
  return (db.prepare(sql).get() as { n: number }).n;
}
