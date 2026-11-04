import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getDb } from "@/lib/db/connection.ts";
import { formatDuration } from "@/lib/format.ts";
import { getWeekStats } from "@/lib/timer.ts";

const CHART_HEIGHT = 176; // px: 막대가 자라는 영역의 높이

async function StatsContent() {
  await connection();
  const stats = getWeekStats(getDb(), new Date());
  const max = Math.max(...stats.days.map((d) => d.seconds));
  const maxDate = max > 0 ? stats.days.find((d) => d.seconds === max)?.date : undefined;

  return (
    <>
      <div className="mb-8 grid grid-cols-2 gap-3">
        <div className="panel">
          <p className="text-sm text-muted">오늘</p>
          <p className="text-3xl font-semibold">{formatDuration(stats.todaySeconds)}</p>
        </div>
        <div className="panel">
          <p className="text-sm text-muted">이번 주 (월~일)</p>
          <p className="text-3xl font-semibold">{formatDuration(stats.weekSeconds)}</p>
        </div>
      </div>

      <h2 className="mb-4 text-lg font-semibold">이번 주 요일별 집중 시간</h2>
      <figure className="panel">
        <div className="flex items-end gap-2 border-b border-border" style={{ height: CHART_HEIGHT + 28 }}>
          {stats.days.map((day) => {
            const barHeight = day.seconds > 0 ? Math.max(4, Math.round((day.seconds / max) * CHART_HEIGHT)) : 0;
            // 값은 오늘과 가장 많은 날에만 적는다. 나머지는 마우스를 올리거나 아래 표에서 본다.
            const showValue = day.seconds > 0 && (day.isToday || day.date === maxDate);
            return (
              <div
                key={day.date}
                className="flex flex-1 flex-col items-center justify-end"
                title={`${day.weekday}요일 ${day.date} · ${formatDuration(day.seconds)}`}
              >
                <span className="mb-1 h-6 text-sm tabular-nums">{showValue ? formatDuration(day.seconds) : ""}</span>
                <div
                  className="w-full max-w-6 rounded-t bg-accent"
                  style={{ height: barHeight }}
                  aria-hidden="true"
                />
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2">
          {stats.days.map((day) => (
            <p
              key={day.date}
              className={`flex-1 text-center text-sm ${day.isToday ? "font-semibold" : "text-muted"}`}
            >
              {day.weekday}
              {day.isToday && <span className="block text-xs">오늘</span>}
            </p>
          ))}
        </div>
        <figcaption className="mt-4 text-sm text-muted">
          막대는 그날 집중한 시간이에요. 자정을 넘긴 집중은 시작한 날로 세요.
        </figcaption>
      </figure>

      <details className="mt-6">
        <summary className="cursor-pointer">표로 보기</summary>
        <table className="mt-3 w-full text-left">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="py-2 font-normal">날짜</th>
              <th className="py-2 font-normal">집중 시간</th>
            </tr>
          </thead>
          <tbody>
            {stats.days.map((day) => (
              <tr key={day.date} className="border-b border-border">
                <td className="py-2">
                  {day.date} ({day.weekday}){day.isToday && " · 오늘"}
                </td>
                <td className="py-2 tabular-nums">{day.isFuture ? "-" : formatDuration(day.seconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {stats.weekSeconds === 0 && (
        <p className="mt-6 text-muted">
          아직 이번 주 기록이 없어요. <Link href="/timer">타이머를 시작해 보세요.</Link>
        </p>
      )}
    </>
  );
}

export default function StatsPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">통계</h1>
      <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
        <StatsContent />
      </Suspense>
    </>
  );
}
