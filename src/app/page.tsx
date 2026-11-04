import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { countCards } from "@/lib/cards.ts";
import { getDb } from "@/lib/db/connection.ts";
import { formatDuration } from "@/lib/format.ts";
import { EXTRA_BATCH, getReviewOverview } from "@/lib/review.ts";
import { getWeekStats } from "@/lib/timer.ts";

async function Overview() {
  await connection(); // DB는 요청마다 읽는다 (미리 만들어 둔 화면에 묻어 두지 않음)
  const db = getDb();
  const { active, archived } = countCards(db);
  const review = getReviewOverview(db);
  const focus = getWeekStats(db, new Date());
  const capReached = review.remaining === 0 && review.dueTotal > 0;

  return (
    <div className="space-y-4">
      <div className="panel">
        <h2 className="mb-1 text-sm font-normal text-muted">오늘의 복습</h2>
        {review.toStudy > 0 ? (
          <>
            <p className="mb-4">
              복습할 카드 <span className="text-2xl font-semibold tabular-nums">{review.toStudy}</span>장
              <span className="text-muted">
                {" "}
                · 오늘 {review.doneToday}장 했음 (상한 {review.limit}장)
              </span>
            </p>
            <Link href="/review" className="btn btn-primary">
              복습 시작
            </Link>
          </>
        ) : capReached ? (
          <>
            <p className="mb-4">
              오늘 상한 <span className="tabular-nums">{review.limit}</span>장을 채웠어요. 남은 카드{" "}
              <span className="tabular-nums">{review.dueTotal}</span>장
            </p>
            <Link href="/review?extra=1" className="btn">
              더 복습하기 (최대 {EXTRA_BATCH}장)
            </Link>
          </>
        ) : (
          <p className="text-muted">
            {review.doneToday > 0
              ? `오늘 ${review.doneToday}장을 복습했고, 남은 카드는 없어요.`
              : "오늘 복습할 카드가 없어요."}
          </p>
        )}
      </div>

      <div className="panel">
        <h2 className="mb-1 text-sm font-normal text-muted">공부 타이머</h2>
        <p className="mb-4">
          오늘 집중 <span className="text-xl font-semibold tabular-nums">{formatDuration(focus.todaySeconds)}</span>
          <span className="text-muted"> · 이번 주 {formatDuration(focus.weekSeconds)}</span>
        </p>
        <Link href="/timer" className="btn">
          타이머 열기
        </Link>
      </div>

      <div className="panel">
        <p>
          카드 <span className="text-xl font-semibold tabular-nums">{active}</span>장
          {archived > 0 && <span className="text-muted"> · 보관함 {archived}장</span>}
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <h1 className="mb-2 text-3xl font-semibold">RecallNote</h1>
      <p className="mb-8 text-muted">배운 것을 카드로 남기고, 잊기 전에 다시 봅니다.</p>
      <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
        <Overview />
      </Suspense>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/cards/new" className="btn btn-primary">
          새 카드 만들기
        </Link>
        <Link href="/cards" className="btn">
          카드 목록
        </Link>
      </div>
    </>
  );
}
