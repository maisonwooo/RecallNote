// npm test : 항상 임시 폴더의 임시 DB 파일만 쓴다. 내 진짜 data/ 는 건드리지 않는다.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { openAndMigrate, openDatabase } from "../src/lib/db/connection.ts";
import { runMigrations } from "../src/lib/db/migrate.ts";
import { seedDatabase } from "../src/lib/db/seed.ts";

const MIGRATIONS = join(process.cwd(), "migrations");
const SEED = join(process.cwd(), "seed", "seed.sql");

let dir: string;
let db: DatabaseSync;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "recallnote-test-"));
  db = openAndMigrate(join(dir, "nested", "test.db")); // nested 폴더도 자동 생성되는지 함께 확인
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

function throwsSql(sql: string, pattern: RegExp) {
  assert.throws(() => db.exec(sql), pattern);
}

describe("마이그레이션", () => {
  test("빈 DB가 자동으로 만들어지고 0001, 0002가 순서대로 적용된다", () => {
    const rows = db.prepare("SELECT filename FROM schema_migrations").all() as { filename: string }[];
    assert.deepEqual(rows.map((r) => r.filename).sort(), ["0001_init.sql", "0002_learning_sources.sql"]);
    assert.equal(count("SELECT count(*) AS n FROM settings"), 4);
  });

  test("다시 실행해도 중복 적용되지 않는다", () => {
    assert.deepEqual(runMigrations(db, MIGRATIONS), []);
    assert.equal(count("SELECT count(*) AS n FROM schema_migrations"), 2);
  });

  test("새 번호 파일만 추가로 적용되고, 실패하면 통째로 취소된다", () => {
    const tmp = join(dir, "mig");
    mkdirSync(tmp);
    writeFileSync(join(tmp, "0001_init.sql"), "CREATE TABLE should_not_run (a INTEGER);");
    writeFileSync(join(tmp, "0002_ok.sql"), "CREATE TABLE extra (a INTEGER);");
    assert.deepEqual(runMigrations(db, tmp), ["0002_ok.sql"]); // 0001은 이미 적용돼 있어 건너뜀
    assert.equal(count("SELECT count(*) AS n FROM sqlite_master WHERE name='should_not_run'"), 0);

    writeFileSync(join(tmp, "0003_bad.sql"), "CREATE TABLE half (a INTEGER); THIS IS NOT SQL;");
    assert.throws(() => runMigrations(db, tmp), /0003_bad\.sql/);
    assert.equal(count("SELECT count(*) AS n FROM sqlite_master WHERE name='half'"), 0);
    assert.equal(count("SELECT count(*) AS n FROM schema_migrations WHERE filename='0003_bad.sql'"), 0);
  });

  test("외래키 검사가 켜져 있다", () => {
    assert.equal(count("SELECT foreign_keys AS n FROM pragma_foreign_keys"), 1);
    const another = openDatabase(join(dir, "another.db"));
    assert.equal((another.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys, 1);
    another.close();
  });
});

describe("learning_sources 표 (0002)", () => {
  const ins = (key: string, status: string, cardId: string) =>
    `INSERT INTO learning_sources (source_key, status, card_id) VALUES ('${key}', '${status}', ${cardId})`;
  const K = "0123456789abcdef";

  test("표식은 소문자 16진수 16자리만, 상태는 imported/skipped 만", () => {
    db.exec("INSERT INTO cards (id, question, answer, due_date) VALUES (1, 'q', 'a', '2026-11-05')");
    db.exec(ins(K, "imported", "1"));
    throwsSql(ins("0123456789ABCDEF", "imported", "1"), /CHECK/); // 대문자 거부
    throwsSql(ins("0123456789abcde", "imported", "1"), /CHECK/); // 15자리
    throwsSql(ins("0123456789abcdeg", "imported", "1"), /CHECK/); // 16진수 아님
    throwsSql(ins("fedcba9876543210", "pending", "1"), /CHECK/);
    throwsSql(ins(K, "imported", "1"), /UNIQUE|PRIMARY/); // 같은 표식 두 번
  });

  test("건너뜀(skipped)에는 카드가 없어야 하고, 없는 카드는 가리킬 수 없다", () => {
    db.exec("INSERT INTO cards (id, question, answer, due_date) VALUES (1, 'q', 'a', '2026-11-05')");
    throwsSql(ins(K, "skipped", "1"), /CHECK/);
    throwsSql(ins(K, "imported", "99"), /FOREIGN KEY/);
    db.exec(ins(K, "skipped", "NULL"));
  });

  test("카드가 지워져도(진짜 삭제) 표식은 남고 card_id 만 비워진다 → 같은 줄이 다시 만들어지지 않는다", () => {
    db.exec("INSERT INTO cards (id, question, answer, due_date) VALUES (1, 'q', 'a', '2026-11-05')");
    db.exec(ins(K, "imported", "1"));
    db.exec("DELETE FROM cards WHERE id = 1");
    const row = db.prepare("SELECT status, card_id FROM learning_sources").get() as { status: string; card_id: number | null };
    assert.deepEqual({ ...row }, { status: "imported", card_id: null });
  });
});

describe("예시 데이터(seed)", () => {
  test("빈 DB에는 들어가고, 이미 데이터가 있으면 거부한다", () => {
    assert.equal(seedDatabase(db, SEED), true);
    assert.equal(count("SELECT count(*) AS n FROM cards"), 6);
    assert.equal(count("SELECT count(*) AS n FROM tags"), 4);
    assert.equal(seedDatabase(db, SEED), false);
    assert.equal(count("SELECT count(*) AS n FROM cards"), 6);
  });

  test("오늘(서울) 복습할 카드가 조회된다", () => {
    seedDatabase(db, SEED);
    const due = count(
      "SELECT count(*) AS n FROM cards WHERE deleted_at IS NULL AND due_date <= date('now', '+9 hours')",
    );
    assert.equal(due, 4); // 카드 4번(3일 뒤)과 6번(10일 뒤)은 아직 아님
  });
});

describe("제약(규칙)이 잘못된 값을 막는다", () => {
  const card = (cols: string, vals: string) =>
    `INSERT INTO cards (${cols}) VALUES (${vals})`;

  test("cards", () => {
    throwsSql(card("question, answer, due_date", "'', 'a', '2026-11-04'"), /CHECK/);
    throwsSql(card("question, answer, due_date", "'q', '   ', '2026-11-04'"), /CHECK/);
    throwsSql(card("question, answer, due_date, box", "'q', 'a', '2026-11-04', 6"), /CHECK/);
    throwsSql(card("question, answer, due_date", "'q', 'a', '11/04/2026'"), /CHECK/);
    throwsSql(card("question, answer, due_date, type", "'q', 'a', '2026-11-04', 'cloze'"), /CHECK/);
    throwsSql(card("answer, due_date", "'a', '2026-11-04'"), /NOT NULL/);
    db.exec(card("question, answer, due_date", "'q', 'a', '2026-11-04'"));
    const row = db.prepare("SELECT type, box FROM cards").get() as { type: string; box: number };
    assert.deepEqual({ ...row }, { type: "qa", box: 1 });
  });

  test("tags: 대소문자 구분 없이 중복 금지", () => {
    db.exec("INSERT INTO tags (name) VALUES ('Git')");
    throwsSql("INSERT INTO tags (name) VALUES ('git')", /UNIQUE/);
  });

  test("card_tags: 같은 연결 중복 금지, 없는 카드/태그 금지", () => {
    db.exec("INSERT INTO cards (id, question, answer, due_date) VALUES (1, 'q', 'a', '2026-11-04')");
    db.exec("INSERT INTO tags (id, name) VALUES (1, 'x')");
    db.exec("INSERT INTO card_tags (card_id, tag_id) VALUES (1, 1)");
    throwsSql("INSERT INTO card_tags (card_id, tag_id) VALUES (1, 1)", /UNIQUE|PRIMARY/);
    throwsSql("INSERT INTO card_tags (card_id, tag_id) VALUES (99, 1)", /FOREIGN KEY/);
    db.exec("DELETE FROM tags WHERE id = 1"); // 태그를 지우면 연결도 같이 사라진다
    assert.equal(count("SELECT count(*) AS n FROM card_tags"), 0);
  });

  test("reviews", () => {
    db.exec("INSERT INTO cards (id, question, answer, due_date) VALUES (1, 'q', 'a', '2026-11-04')");
    throwsSql("INSERT INTO reviews (card_id, result, box_before, box_after) VALUES (1, 'great', 1, 2)", /CHECK/);
    throwsSql("INSERT INTO reviews (card_id, result, box_before, box_after) VALUES (1, 'right', 1, 7)", /CHECK/);
    throwsSql("INSERT INTO reviews (card_id, result, box_before, box_after) VALUES (99, 'right', 1, 2)", /FOREIGN KEY/);
    db.exec("INSERT INTO reviews (card_id, result, box_before, box_after) VALUES (1, 'right', 1, 2)");
  });

  test("study_sessions: 상태와 종료 시각이 맞아야 하고, 진행 중은 하나만", () => {
    const t = "'2026-11-04T01:00:00.000Z'";
    throwsSql(`INSERT INTO study_sessions (started_at, planned_minutes, status, ended_at) VALUES (${t}, 50, 'running', ${t})`, /CHECK/);
    throwsSql(`INSERT INTO study_sessions (started_at, planned_minutes, status) VALUES (${t}, 50, 'completed')`, /CHECK/);
    throwsSql(`INSERT INTO study_sessions (started_at, planned_minutes) VALUES (${t}, 0)`, /CHECK/);
    db.exec(`INSERT INTO study_sessions (started_at, planned_minutes) VALUES (${t}, 50)`);
    throwsSql(`INSERT INTO study_sessions (started_at, planned_minutes) VALUES (${t}, 50)`, /UNIQUE/);
    db.exec(
      `INSERT INTO study_sessions (started_at, planned_minutes, status, ended_at, focus_seconds) VALUES (${t}, 50, 'stopped', ${t}, 600)`,
    );
  });
});
