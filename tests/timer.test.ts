// 타이머·통계·설정 테스트. 항상 임시 DB만 쓰고, 시각은 now 인자로 고정한다.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { openAndMigrate } from "../src/lib/db/connection.ts";
import { formatClock, formatDuration, formatSeoul } from "../src/lib/format.ts";
import {
  getSettings,
  parseSettingsForm,
  saveSettings,
} from "../src/lib/settings.ts";
import { finalizeElapsed, getTimerState, getWeekStats, startSession, stopSession, weekStart } from "../src/lib/timer.ts";

let dir: string;
let db: DatabaseSync;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "recallnote-timer-"));
  db = openAndMigrate(join(dir, "test.db"));
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const T0 = new Date("2026-11-04T01:00:00.000Z"); // 서울 10:00
const at = (minutes: number, seconds = 0) => new Date(T0.getTime() + minutes * 60_000 + seconds * 1000);
const rows = () => db.prepare("SELECT * FROM study_sessions ORDER BY id").all().map((r) => ({ ...r })) as Record<string, unknown>[];

describe("집중 → 휴식 → 대기", () => {
  test("시작 직후와 끝나기 1초 전은 집중 중, 끝나는 순간 완료되고 휴식 시작", () => {
    assert.deepEqual(getTimerState(db, T0, 10), { phase: "idle" });
    const { started, sessionId } = startSession(db, 50, T0);
    assert.equal(started, true);

    const s = getTimerState(db, at(0), 10);
    assert.deepEqual(s, { phase: "focus", sessionId, startedAt: T0.toISOString(), endsAt: at(50).toISOString(), plannedMinutes: 50 });
    assert.equal(getTimerState(db, at(49, 59), 10).phase, "focus");
    assert.equal(rows()[0].status, "running");

    const brk = getTimerState(db, at(50), 10); // 정확히 50분
    assert.deepEqual(brk, { phase: "break", sessionId, endsAt: at(60).toISOString(), breakMinutes: 10 });
    assert.equal(rows()[0].status, "completed");
    assert.equal(rows()[0].ended_at, at(50).toISOString());
    assert.equal(rows()[0].focus_seconds, 3000);

    assert.equal(getTimerState(db, at(59, 59), 10).phase, "break");
    assert.equal(getTimerState(db, at(60), 10).phase, "idle");
  });

  test("한참 뒤에 돌아와도 끝난 시각은 원래 끝났어야 할 시각으로 확정된다", () => {
    startSession(db, 50, T0);
    assert.deepEqual(getTimerState(db, at(5 * 60), 10), { phase: "idle" });
    assert.equal(rows()[0].ended_at, at(50).toISOString()); // "지금"이 아님
    assert.equal(rows()[0].focus_seconds, 3000);
  });

  test("휴식 시간은 설정값을 따른다", () => {
    startSession(db, 1, T0);
    assert.equal(getTimerState(db, at(1), 3).phase, "break");
    assert.equal(getTimerState(db, at(3, 59), 3).phase, "break");
    assert.equal(getTimerState(db, at(4), 3).phase, "idle");
  });

  test("휴식 중에 새 집중을 시작할 수 있다", () => {
    startSession(db, 1, T0);
    getTimerState(db, at(1), 10); // 완료 → 휴식
    const next = startSession(db, 25, at(2));
    assert.equal(next.started, true);
    assert.equal(getTimerState(db, at(3), 10).phase, "focus");
    assert.equal(rows().length, 2);
  });
});

describe("시작·중지", () => {
  test("이미 진행 중이면 새로 만들지 않는다(더블 클릭)", () => {
    const a = startSession(db, 50, T0);
    const b = startSession(db, 50, at(1));
    assert.equal(b.started, false);
    assert.equal(b.sessionId, a.sessionId);
    assert.equal(rows().length, 1);
  });

  test("중지하면 지금까지 집중한 시간만 기록하고, 휴식은 없다", () => {
    const { sessionId } = startSession(db, 50, T0);
    assert.deepEqual(stopSession(db, at(10, 30)), { sessionId, focusSeconds: 630 });
    const row = rows()[0];
    assert.equal(row.status, "stopped");
    assert.equal(row.ended_at, at(10, 30).toISOString());
    assert.equal(row.focus_seconds, 630);
    assert.deepEqual(getTimerState(db, at(11), 10), { phase: "idle" });
  });

  test("진행 중이 아니면 중지는 아무 일도 안 한다", () => {
    assert.equal(stopSession(db, T0), null);
    startSession(db, 1, T0);
    stopSession(db, at(0, 30));
    assert.equal(stopSession(db, at(0, 40)), null);
    assert.equal(rows().length, 1);
  });

  test("이미 끝났어야 하는 타이머를 늦게 중지하면 '완료'(계획 시간)로 처리된다", () => {
    startSession(db, 50, T0);
    assert.equal(stopSession(db, at(80)), null);
    assert.equal(rows()[0].status, "completed");
    assert.equal(rows()[0].focus_seconds, 3000);
  });

  test("DB에 이미 진행 중인 줄이 있어도(다른 요청이 먼저) 안전하다", () => {
    db.prepare("INSERT INTO study_sessions (started_at, planned_minutes) VALUES (?, 50)").run(T0.toISOString());
    const r = startSession(db, 50, at(1));
    assert.equal(r.started, false);
    assert.equal(rows().length, 1);
    assert.equal(finalizeElapsed(db, at(1)), false);
  });
});

describe("통계: 서울 날짜와 월요일 시작 주", () => {
  test("weekStart: 월요일은 그대로, 일요일은 그 주 월요일, 다음 월요일부터 새 주", () => {
    assert.equal(weekStart(db, "2026-11-02"), "2026-11-02"); // 월
    assert.equal(weekStart(db, "2026-11-04"), "2026-11-02"); // 수
    assert.equal(weekStart(db, "2026-11-08"), "2026-11-02"); // 일
    assert.equal(weekStart(db, "2026-11-09"), "2026-11-09"); // 다음 월
  });

  const add = (startedAt: string, seconds: number, status = "completed") =>
    db
      .prepare("INSERT INTO study_sessions (started_at, planned_minutes, ended_at, status, focus_seconds) VALUES (?, 60, ?, ?, ?)")
      .run(startedAt, startedAt, status, seconds);

  test("요일별 합계, 이번 주 합계, 오늘 합계", () => {
    add("2026-11-02T01:00:00.000Z", 3000); // 월 (서울 10시)
    add("2026-11-02T05:00:00.000Z", 1200); // 월
    add("2026-11-04T01:00:00.000Z", 600, "stopped"); // 수 (오늘)
    add("2026-10-30T01:00:00.000Z", 9999); // 지난주 금 → 제외
    add("2026-11-09T01:00:00.000Z", 7777); // 다음 주 월 → 제외
    const w = getWeekStats(db, new Date("2026-11-04T06:00:00.000Z"));
    assert.equal(w.today, "2026-11-04");
    assert.deepEqual(w.days.map((d) => d.weekday), ["월", "화", "수", "목", "금", "토", "일"]);
    assert.deepEqual(w.days.map((d) => d.seconds), [4200, 0, 600, 0, 0, 0, 0]);
    assert.deepEqual(w.days.map((d) => [d.isToday, d.isFuture]), [
      [false, false], [false, false], [true, false], [false, true], [false, true], [false, true], [false, true],
    ]);
    assert.equal(w.todaySeconds, 600);
    assert.equal(w.weekSeconds, 4800);
  });

  test("서울 자정 경계: UTC 14:59:59 는 서울 일요일, 15:00:00 부터 서울 월요일(새 주)", () => {
    add("2026-11-01T14:59:59.000Z", 100); // 서울 일요일 11-01 23:59:59 (지난주)
    add("2026-11-01T15:00:00.000Z", 200); // 서울 월요일 11-02 00:00:00 (이번 주)
    const w = getWeekStats(db, new Date("2026-11-03T03:00:00.000Z"));
    assert.equal(w.days[0].date, "2026-11-02");
    assert.equal(w.days[0].seconds, 200);
    assert.equal(w.weekSeconds, 200);
  });

  test("자정을 넘긴 집중은 시작한 날로 센다", () => {
    add("2026-11-03T14:30:00.000Z", 3000); // 서울 11-03 23:30 시작, 자정 넘어 이어짐
    const w = getWeekStats(db, new Date("2026-11-04T03:00:00.000Z"));
    assert.equal(w.days[1].date, "2026-11-03");
    assert.equal(w.days[1].seconds, 3000);
    assert.equal(w.days[2].seconds, 0);
  });

  test("진행 중인 집중은 지금까지 흐른 시간만큼 더해서 보여준다", () => {
    startSession(db, 50, T0);
    const w = getWeekStats(db, at(12, 30));
    assert.equal(w.todaySeconds, 750);
    assert.equal(w.weekSeconds, 750);
  });
});

describe("설정", () => {
  test("기본값", () => {
    assert.deepEqual(getSettings(db), { dailyReviewLimit: 20, focusMinutes: 50, breakMinutes: 10 });
  });

  test("저장하면 읽힌다(다시 저장해도 덮어씀)", () => {
    saveSettings(db, { dailyReviewLimit: 30, focusMinutes: 25, breakMinutes: 5 });
    saveSettings(db, { dailyReviewLimit: 31, focusMinutes: 25, breakMinutes: 5 });
    assert.deepEqual(getSettings(db), { dailyReviewLimit: 31, focusMinutes: 25, breakMinutes: 5 });
    assert.equal((db.prepare("SELECT count(*) AS n FROM settings").get() as { n: number }).n, 4);
  });

  test("폼 검사: 범위·숫자 아님·소수·빈칸은 오류, 하나라도 틀리면 통째로 거부", () => {
    const ok = parseSettingsForm({ dailyReviewLimit: " 20 ", focusMinutes: "1", breakMinutes: "60" });
    assert.ok(ok.ok && ok.value.focusMinutes === 1 && ok.value.breakMinutes === 60);
    for (const bad of ["0", "201", "-1", "abc", "2.5", "", "  ", "1e2", "٣"]) {
      const r = parseSettingsForm({ dailyReviewLimit: bad, focusMinutes: "50", breakMinutes: "10" });
      assert.ok(!r.ok && r.errors.dailyReviewLimit, `복습 상한 "${bad}"`);
    }
    const r = parseSettingsForm({ dailyReviewLimit: "20", focusMinutes: "181", breakMinutes: "61" });
    assert.ok(!r.ok);
    assert.deepEqual(Object.keys(r.errors).sort(), ["breakMinutes", "focusMinutes"]);
    assert.equal(r.values.focusMinutes, "181"); // 입력한 값을 돌려줘서 화면에 남긴다
    assert.ok(!parseSettingsForm({}).ok);
  });

  test("DB의 설정 값이 이상하면 기본값을 쓴다", () => {
    db.prepare("UPDATE settings SET value = 'x' WHERE key = 'focus_minutes'").run();
    db.prepare("UPDATE settings SET value = '999' WHERE key = 'break_minutes'").run();
    assert.deepEqual(getSettings(db), { dailyReviewLimit: 20, focusMinutes: 50, breakMinutes: 10 });
  });
});

describe("시간 표시", () => {
  test("formatSeoul: UTC를 KST(서울)로 바꾸고 KST 표시를 붙인다", () => {
    assert.equal(formatSeoul("2026-11-04T05:30:00.000Z"), "2026. 11. 4. 오후 2:30 KST");
    assert.equal(formatSeoul("2026-11-04T15:00:00.000Z"), "2026. 11. 5. 오전 12:00 KST"); // 서울 자정 넘김
    assert.equal(formatSeoul("이상한 값"), "이상한 값"); // 읽을 수 없으면 그대로
  });

  test("formatDuration / formatClock", () => {
    assert.deepEqual([0, 30, 60, 1500, 3600, 6000, 7260].map(formatDuration), ["0분", "1분 미만", "1분", "25분", "1시간", "1시간 40분", "2시간 1분"]);
    assert.deepEqual([-5, 0, 1, 999, 1000, 61_000, 3_000_000].map(formatClock), ["00:00", "00:00", "00:01", "00:01", "00:01", "01:01", "50:00"]);
  });
});
