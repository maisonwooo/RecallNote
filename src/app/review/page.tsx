import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ReviewSession } from "@/components/review-session";
import { getDb } from "@/lib/db/connection.ts";
import { EXTRA_BATCH, getReviewQueue, getTodaySummary, nextUpcomingDate } from "@/lib/review.ts";

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function SummaryNumber({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel text-center">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

async function ReviewContent({ searchParams }: { searchParams: PageProps<"/review">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const extra = first(sp.extra) === "1";

  const db = getDb();
  const { cards, overview } = getReviewQueue(db, { extra });

  if (cards.length > 0) {
    // 화면(클라이언트)에는 필요한 값만 평범한 객체로 넘긴다.
    const data = cards.map((c) => ({
      id: c.id,
      question: c.question,
      answer: c.answer,
      source: c.source,
      box: c.box,
      tags: c.tags,
    }));
    return <ReviewSession key={`${extra}-${data.map((c) => c.id).join(",")}`} cards={data} />;
  }

  // 볼 카드가 없을 때: 오늘 결과 요약과 안내
  const summary = getTodaySummary(db, overview.today);
  const upcoming = nextUpcomingDate(db, overview.today);
  const capReached = overview.remaining === 0 && overview.dueTotal > 0;

  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold">오늘의 복습</h1>
      {summary.total > 0 ? (
        <>
          <p className="mb-6 text-muted">
            오늘 <span className="tabular-nums">{summary.total}</span>장을 복습했어요. 수고했어요!
          </p>
          <div className="mb-8 grid grid-cols-3 gap-3">
            <SummaryNumber label="맞음" value={summary.right} />
            <SummaryNumber label="애매" value={summary.unsure} />
            <SummaryNumber label="틀림" value={summary.wrong} />
          </div>
        </>
      ) : (
        <p className="mb-6 text-muted">오늘 복습할 카드가 없어요.</p>
      )}

      {capReached && (
        <div className="panel mb-6">
          <p className="mb-3">
            오늘 상한 <span className="tabular-nums">{overview.limit}</span>장을 채웠어요. 아직 복습할 카드가{" "}
            <span className="tabular-nums">{overview.dueTotal}</span>장 남아 있어요.
          </p>
          <Link href="/review?extra=1" className="btn btn-primary">
            더 복습하기 (최대 {EXTRA_BATCH}장)
          </Link>
        </div>
      )}
      {!capReached && overview.dueTotal > 0 && (
        <div className="panel mb-6">
          <p className="mb-3">
            이어서 복습할 카드가 <span className="tabular-nums">{overview.dueTotal}</span>장 있어요.
          </p>
          <Link href={extra ? "/review?extra=1" : "/review"} className="btn btn-primary">
            계속 복습하기
          </Link>
        </div>
      )}
      {overview.dueTotal === 0 && upcoming && (
        <p className="mb-6 text-muted">
          다음 복습 예정일은 <span className="tabular-nums">{upcoming}</span>이에요.
        </p>
      )}
      {overview.dueTotal === 0 && !upcoming && summary.total === 0 && (
        <p className="mb-6">
          <Link href="/cards/new">카드를 만들면</Link> 여기서 복습할 수 있어요.
        </p>
      )}
      <Link href="/" className="btn">
        홈으로
      </Link>
    </>
  );
}

export default function ReviewPage(props: PageProps<"/review">) {
  return (
    <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
      <ReviewContent searchParams={props.searchParams} />
    </Suspense>
  );
}
