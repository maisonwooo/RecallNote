import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { TimerPanel } from "@/components/timer-panel";
import { getDb } from "@/lib/db/connection.ts";
import { formatDuration } from "@/lib/format.ts";
import { getSettings } from "@/lib/settings.ts";
import { getTimerState, getWeekStats } from "@/lib/timer.ts";

async function TimerContent() {
  await connection();
  const db = getDb();
  const settings = getSettings(db);
  const now = new Date();
  // 집중 시간이 이미 지난 타이머가 있으면 여기서 완료로 확정된다(탭을 닫았다 돌아온 경우).
  const state = getTimerState(db, now, settings.breakMinutes);
  const stats = getWeekStats(db, now);

  return (
    <>
      <TimerPanel
        key={state.phase === "idle" ? "idle" : `${state.phase}-${state.sessionId}`}
        initial={state}
        serverNow={now.toISOString()}
        focusMinutes={settings.focusMinutes}
        breakMinutes={settings.breakMinutes}
      />
      <p className="mt-6 text-muted">
        오늘 집중 <span className="tabular-nums">{formatDuration(stats.todaySeconds)}</span> · 이번 주{" "}
        <span className="tabular-nums">{formatDuration(stats.weekSeconds)}</span> ·{" "}
        <Link href="/stats">통계 보기</Link>
      </p>
    </>
  );
}

export default function TimerPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">공부 타이머</h1>
      <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
        <TimerContent />
      </Suspense>
    </>
  );
}
