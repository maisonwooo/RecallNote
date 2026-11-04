"use server";
// 타이머 화면이 부르는 서버 동작. 계산·저장은 src/lib/timer.ts 가 한다.
import { getDb } from "@/lib/db/connection.ts";
import { getSettings } from "@/lib/settings.ts";
import { getTimerState, startSession, stopSession, type TimerState } from "@/lib/timer.ts";

export type TimerActionResult = { ok: true; state: TimerState } | { ok: false; message: string };

const FAILED = "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.";

function run(fn: (now: Date, settings: ReturnType<typeof getSettings>) => void): TimerActionResult {
  try {
    const db = getDb();
    const settings = getSettings(db);
    const now = new Date();
    fn(now, settings);
    return { ok: true, state: getTimerState(db, now, settings.breakMinutes) };
  } catch (error) {
    console.error("타이머 처리 실패", error); // 서버 터미널에만 남는다
    return { ok: false, message: FAILED };
  }
}

/** 집중 시작 (이미 진행 중이면 그대로 둔다) */
export async function startTimerAction(): Promise<TimerActionResult> {
  return run((now, settings) => {
    startSession(getDb(), settings.focusMinutes, now);
  });
}

/** 중지: 지금까지 집중한 시간만 기록 */
export async function stopTimerAction(): Promise<TimerActionResult> {
  return run((now) => {
    stopSession(getDb(), now);
  });
}

/** 현재 상태를 다시 계산해서 돌려준다 (집중 시간이 끝났을 때 화면이 부름) */
export async function refreshTimerAction(): Promise<TimerActionResult> {
  return run(() => {});
}
