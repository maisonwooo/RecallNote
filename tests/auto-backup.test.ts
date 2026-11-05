// 자동 백업 테스트. 항상 임시 폴더만 쓴다 (진짜 data/ 와 ~/recallnote-backup 은 건드리지 않는다).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { createCard } from "../src/lib/cards.ts";
import { openAndMigrate } from "../src/lib/db/connection.ts";
import { KEEP_BACKUPS, listBackupDays, runAutoBackup } from "../src/lib/backup/auto.ts";
import { buildBackup } from "../src/lib/backup/export.ts";
import { parseBackup } from "../src/lib/backup/validate.ts";

let dir: string;
let dbFile: string;
let root: string;
let logFile: string;
let db: DatabaseSync;

const NOW = new Date("2026-11-05T05:30:12.000Z"); // 서울 2026-11-05 14:30
const run = (now = NOW) => runAutoBackup({ dbFile, root, logFile, now });
const log = () => (existsSync(logFile) ? readFileSync(logFile, "utf8") : "");
const sha = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "recallnote-auto-"));
  dbFile = join(dir, "data", "recallnote.db");
  root = join(dir, "recallnote-backup");
  logFile = join(dir, "backup.log");
  db = openAndMigrate(dbFile);
  createCard(db, { question: "자동 백업 테스트", answer: "답", source: null, tags: ["백업"] });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("백업 만들기", () => {
  test("첫 실행: 오늘 날짜 폴더에 가져오기에 쓸 수 있는 JSON 한 개, 권한은 나만", () => {
    const r = run();
    assert.equal(r.status, "backed-up");
    assert.deepEqual(readdirSync(root), ["20261105"]);
    const files = readdirSync(join(root, "20261105"));
    assert.deepEqual(files, ["recallnote-backup-20261105-143012.json"]);
    const file = join(root, "20261105", files[0]);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(statSync(join(root, "20261105")).mode & 0o777, 0o700);
    const parsed = parseBackup(readFileSync(file, "utf8"));
    assert.ok(parsed.ok);
    assert.deepEqual({ ...parsed.data, exportedAt: "-" }, { ...buildBackup(db, NOW), exportedAt: "-" });
    assert.match(log(), /2026-11-05 14:30:12 KST OK 백업 완료/);
    assert.equal(readdirSync(root).filter((n) => n.startsWith(".tmp")).length, 0); // 임시 파일 없음
  });

  test("DB를 바꾸지 않는다 (읽기 전용): 실행 전후 DB 파일 내용이 같다", () => {
    db.close();
    const before = sha(dbFile);
    run();
    assert.equal(sha(dbFile), before);
    db = openAndMigrate(dbFile); // afterEach 에서 닫을 수 있게 다시 연다
  });

  test("DB 파일이 아직 없으면 건너뛴다 (앱을 한 번도 안 켠 경우)", () => {
    const r = runAutoBackup({ dbFile: join(dir, "nope.db"), root, logFile, now: NOW });
    assert.equal(r.status, "skipped");
    assert.equal(existsSync(root), false);
    assert.match(log(), /SKIP DB 파일이 아직 없어요/);
  });

  test("DB가 깨져 있으면 실패하고, 가짜 백업 폴더나 임시 파일을 남기지 않는다", () => {
    const bad = join(dir, "broken.db");
    writeFileSync(bad, "이건 SQLite 파일이 아니에요".repeat(50));
    const r = runAutoBackup({ dbFile: bad, root, logFile, now: NOW });
    assert.equal(r.status, "failed");
    assert.ok(!existsSync(root) || readdirSync(root).length === 0);
    assert.match(log(), /FAIL DB를 읽지 못했어요/);
  });
});

describe("7일 규칙", () => {
  const seedDay = (name: string) => {
    mkdirSync(join(root, name), { recursive: true });
    writeFileSync(join(root, name, "x.json"), "{}");
  };

  test("같은 날 두 번째 실행은 건너뛴다 (덮어쓰기 없음)", () => {
    assert.equal(run().status, "backed-up");
    const r = run(new Date(NOW.getTime() + 3600_000));
    assert.equal(r.status, "skipped");
    assert.match(log(), /SKIP 오늘 백업이 이미 있어요/);
    assert.equal(readdirSync(join(root, "20261105")).length, 1);
  });

  test("마지막 백업이 6일 전이면 건너뛰고, 7일 전이면 새로 만든다", () => {
    seedDay("20261030"); // 6일 전
    assert.equal(run().status, "skipped");
    assert.match(log(), /6일 — 7일 미만/);
    rmSync(join(root, "20261030"), { recursive: true });
    seedDay("20261029"); // 7일 전
    assert.equal(run().status, "backed-up");
    assert.deepEqual(listBackupDays(root), ["20261029", "20261105"]);
  });

  test("월말·연말을 넘어도 날짜 차이를 맞게 센다", () => {
    seedDay("20261228");
    assert.equal(runAutoBackup({ dbFile, root, logFile, now: new Date("2027-01-03T03:00:00.000Z") }).status, "skipped"); // 6일
    assert.equal(runAutoBackup({ dbFile, root, logFile, now: new Date("2027-01-04T03:00:00.000Z") }).status, "backed-up"); // 7일
  });

  test("시계가 거꾸로 가서 마지막 백업이 미래 날짜여도 건너뛴다", () => {
    seedDay("20270101");
    assert.equal(run().status, "skipped");
  });

  test("서울 자정 기준으로 '오늘'을 정한다 (UTC 15:00 = 서울 다음 날 00:00)", () => {
    const r = runAutoBackup({ dbFile, root, logFile, now: new Date("2026-11-05T15:00:00.000Z") });
    assert.equal(r.status, "backed-up");
    assert.deepEqual(readdirSync(root), ["20261106"]);
  });
});

describe("오래된 백업 정리 (최근 8개만 남김)", () => {
  test("9개째가 되면 가장 오래된 것만 지우고, 지우기 전에 목록을 로그에 남긴다", () => {
    for (let i = 1; i <= KEEP_BACKUPS; i++) {
      const name = `2026${String(i).padStart(2, "0")}01`; // 20260101 ... 20260801
      mkdirSync(join(root, name), { recursive: true });
      writeFileSync(join(root, name, "x.json"), "{}");
    }
    const r = run();
    assert.equal(r.status, "backed-up");
    assert.ok(r.status === "backed-up" && r.deleted.length === 1 && r.deleted[0].endsWith("20260101"));
    const days = listBackupDays(root);
    assert.equal(days.length, KEEP_BACKUPS);
    assert.equal(days[0], "20260201");
    assert.equal(days.at(-1), "20261105");
    const text = log();
    assert.ok(text.indexOf("PRUNE 지울 폴더 목록") < text.indexOf("DELETED"), "목록이 먼저, 삭제가 나중");
  });

  test("날짜 폴더가 아닌 것(파일, 다른 이름, 바로가기)은 절대 건드리지 않는다", () => {
    for (let i = 1; i <= KEEP_BACKUPS; i++) {
      mkdirSync(join(root, `2026${String(i).padStart(2, "0")}01`), { recursive: true });
    }
    mkdirSync(join(root, "내 메모"));
    writeFileSync(join(root, "keep.txt"), "중요");
    mkdirSync(join(root, "2026110"));
    const outside = join(dir, "outside");
    mkdirSync(outside);
    writeFileSync(join(outside, "소중한 파일"), "삭제되면 안 됨");
    symlinkSync(outside, join(root, "20200101")); // 날짜 이름의 바로가기: 목록에서 제외되어야 한다
    run();
    assert.ok(existsSync(join(root, "내 메모")) && existsSync(join(root, "keep.txt")) && existsSync(join(root, "2026110")));
    assert.ok(lstatSync(join(root, "20200101")).isSymbolicLink());
    assert.equal(readFileSync(join(outside, "소중한 파일"), "utf8"), "삭제되면 안 됨");
  });

  test("백업이 8개 이하이면 아무것도 지우지 않는다", () => {
    mkdirSync(join(root, "20260101"), { recursive: true });
    const r = run();
    assert.ok(r.status === "backed-up" && r.deleted.length === 0);
    assert.doesNotMatch(log(), /PRUNE/);
  });
});

describe("안전장치", () => {
  test("백업 폴더가 바로가기(symlink)면 중단한다", () => {
    const real = join(dir, "real");
    mkdirSync(real);
    symlinkSync(real, root);
    assert.equal(run().status, "failed");
    assert.deepEqual(readdirSync(real), []);
  });

  test("상대 경로나 루트(/)는 거부한다", () => {
    assert.equal(runAutoBackup({ dbFile, root: "relative/path", logFile, now: NOW }).status, "failed");
    assert.equal(runAutoBackup({ dbFile, root: "/", logFile, now: NOW }).status, "failed");
  });

  test("로그 파일을 못 써도 백업은 된다", () => {
    const r = runAutoBackup({ dbFile, root, logFile: join(dir, "no-such-dir", "x.log"), now: NOW });
    assert.equal(r.status, "backed-up");
  });

  test("테스트가 진짜 data/ 를 만들지 않았다", () => {
    assert.equal(existsSync(join(process.cwd(), "data")), false);
  });
});
