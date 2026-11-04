// 공부 타이머 로직. "남은 시간"을 숫자로 세지 않고, 저장한 시작 시각과 지금 시각의 차이로 계산한다.
// 모든 함수가 now(지금 시각)를 인자로 받아서 테스트에서 시간을 고정할 수 있다.
import type { DatabaseSync } from "node:sqlite";

const MINUTE_MS = 60_000;

type SessionRow = {
  id: number;
  started_at: string;
  planned_minutes: number;
  ended_at: string | null;
  status: "running" | "completed" | "stopped";
  focus_seconds: number;
};

/** 화면(클라이언트)으로 넘겨도 되는 평범한 값 */
export type TimerState =
  | { phase: "idle" }
  | { phase: "focus"; sessionId: number; startedAt: string; endsAt: string; plannedMinutes: number }
  | { phase: "break"; sessionId: number; endsAt: string; breakMinutes: number };

const iso = (ms: number) => new Date(ms).toISOString(); // DB의 시각 형식(2026-11-04T05:30:00.000Z)과 같다

function runningSession(db: DatabaseSync): SessionRow | undefined {
  return db.prepare("SELECT * FROM study_sessions WHERE status = 'running'").get() as SessionRow | undefined;
}

function focusEndMs(row: SessionRow): number {
  return Date.parse(row.started_at) + Number(row.planned_minutes) * MINUTE_MS;
}

/**
 * 집중 시간이 이미 지났는데 아직 'running' 인 기록을 완료로 확정한다.
 * 끝난 시각은 "지금"이 아니라 "원래 끝났어야 할 시각"으로 적는다.
 * (Mac이 잠들었거나 탭을 닫았다가 돌아와도 집중 시간이 부풀지 않는다)
 */
export function finalizeElapsed(db: DatabaseSync, now: Date): boolean {
  const row = runningSession(db);
  if (!row || now.getTime() < focusEndMs(row)) return false;
  db.prepare(
    "UPDATE study_sessions SET status = 'completed', ended_at = ?, focus_seconds = ? WHERE id = ? AND status = 'running'",
  ).run(iso(focusEndMs(row)), Number(row.planned_minutes) * 60, row.id);
  return true;
}

/** 지금 타이머 상태: 집중 중 / 휴식 중 / 대기. */
export function getTimerState(db: DatabaseSync, now: Date, breakMinutes: number): TimerState {
  finalizeElapsed(db, now);
  const running = runningSession(db);
  if (running) {
    return {
      phase: "focus",
      sessionId: Number(running.id),
      startedAt: running.started_at,
      endsAt: iso(focusEndMs(running)),
      plannedMinutes: Number(running.planned_minutes),
    };
  }
  // 휴식은 "끝까지 완료한" 마지막 집중 뒤에만 시작된다. 중간에 중지한 경우는 휴식 없음.
  const last = db.prepare("SELECT * FROM study_sessions ORDER BY id DESC LIMIT 1").get() as SessionRow | undefined;
  if (last && last.status === "completed" && last.ended_at) {
    const breakEnd = Date.parse(last.ended_at) + breakMinutes * MINUTE_MS;
    if (now.getTime() < breakEnd) {
      return { phase: "break", sessionId: Number(last.id), endsAt: iso(breakEnd), breakMinutes };
    }
  }
  return { phase: "idle" };
}

/**
 * 집중을 시작한다. 이미 진행 중이면 새로 만들지 않고 그대로 돌려준다(더블 클릭, 탭 두 개).
 * DB에도 "진행 중은 하나만" 규칙(부분 유니크 인덱스)이 있어서 마지막 방어선이 된다.
 */
export function startSession(
  db: DatabaseSync,
  plannedMinutes: number,
  now: Date,
): { started: boolean; sessionId: number } {
  finalizeElapsed(db, now);
  const existing = runningSession(db);
  if (existing) return { started: false, sessionId: Number(existing.id) };
  try {
    const result = db
      .prepare("INSERT INTO study_sessions (started_at, planned_minutes) VALUES (?, ?)")
      .run(iso(now.getTime()), plannedMinutes);
    return { started: true, sessionId: Number(result.lastInsertRowid) };
  } catch (error) {
    // 거의 동시에 다른 요청이 먼저 만든 경우
    const raced = runningSession(db);
    if (raced) return { started: false, sessionId: Number(raced.id) };
    throw error;
  }
}

/** 진행 중인 집중을 중지한다. 지금까지 집중한 시간만 기록한다. 진행 중이 아니면 null. */
export function stopSession(db: DatabaseSync, now: Date): { sessionId: number; focusSeconds: number } | null {
  finalizeElapsed(db, now); // 이미 끝났어야 하는 경우는 '완료'로 처리되어 아래에서 null 이 된다
  const row = runningSession(db);
  if (!row) return null;
  const elapsed = Math.floor((now.getTime() - Date.parse(row.started_at)) / 1000);
  const focusSeconds = Math.max(0, Math.min(elapsed, Number(row.planned_minutes) * 60));
  db.prepare("UPDATE study_sessions SET status = 'stopped', ended_at = ?, focus_seconds = ? WHERE id = ?").run(
    iso(now.getTime()),
    focusSeconds,
    row.id,
  );
  return { sessionId: Number(row.id), focusSeconds };
}

// ---------- 통계 ----------

/** 서울 기준 오늘 날짜 (now 로 고정 가능) */
export function seoulDate(db: DatabaseSync, now: Date): string {
  return (db.prepare("SELECT date(?, '+9 hours') AS d").get(iso(now.getTime())) as { d: string }).d;
}

/** 그 날짜가 속한 주의 월요일 (월~일이 한 주). 일요일이면 그 주의 월요일로 돌아간다. */
export function weekStart(db: DatabaseSync, date: string): string {
  return (db.prepare("SELECT date(?, 'weekday 0', '-6 days') AS d").get(date) as { d: string }).d;
}

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;

export type WeekStats = {
  today: string;
  todaySeconds: number;
  weekSeconds: number;
  days: { date: string; weekday: string; seconds: number; isToday: boolean; isFuture: boolean }[];
};

/**
 * 이번 주(월~일) 요일별 집중 시간. 자정을 넘긴 집중은 "시작한 날"로 센다.
 * 진행 중인 집중은 지금까지 흐른 시간만큼 더해서 보여준다.
 */
export function getWeekStats(db: DatabaseSync, now: Date): WeekStats {
  finalizeElapsed(db, now);
  const today = seoulDate(db, now);
  const start = weekStart(db, today);
  const end = (db.prepare("SELECT date(?, '+6 days') AS d").get(start) as { d: string }).d;

  const perDay = new Map<string, number>();
  const rows = db
    .prepare(
      `SELECT date(started_at, '+9 hours') AS day, sum(focus_seconds) AS seconds
       FROM study_sessions
       WHERE status <> 'running' AND date(started_at, '+9 hours') BETWEEN ? AND ?
       GROUP BY day`,
    )
    .all(start, end) as { day: string; seconds: number }[];
  for (const row of rows) perDay.set(row.day, Number(row.seconds));

  const running = runningSession(db);
  if (running) {
    const day = seoulDate(db, new Date(running.started_at));
    const elapsed = Math.floor((now.getTime() - Date.parse(running.started_at)) / 1000);
    const live = Math.max(0, Math.min(elapsed, Number(running.planned_minutes) * 60));
    if (day >= start && day <= end) perDay.set(day, (perDay.get(day) ?? 0) + live);
  }

  const days = WEEKDAYS.map((weekday, i) => {
    const date = (db.prepare("SELECT date(?, ?) AS d").get(start, `+${i} days`) as { d: string }).d;
    return { date, weekday, seconds: perDay.get(date) ?? 0, isToday: date === today, isFuture: date > today };
  });
  return {
    today,
    todaySeconds: perDay.get(today) ?? 0,
    weekSeconds: days.reduce((sum, d) => sum + d.seconds, 0),
    days,
  };
}
