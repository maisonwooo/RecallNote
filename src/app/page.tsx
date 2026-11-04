import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { countCards } from "@/lib/cards.ts";
import { getDb } from "@/lib/db/connection.ts";

async function Overview() {
  await connection(); // DB는 요청마다 읽는다 (미리 만들어 둔 화면에 묻어 두지 않음)
  const { active, archived } = countCards(getDb());
  return (
    <div className="panel">
      <p>
        카드 <span className="text-xl font-semibold">{active}</span>장
        {archived > 0 && (
          <span className="text-muted">
            {" "}
            · 보관함 {archived}장
          </span>
        )}
      </p>
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
      <p className="mt-10 text-sm text-muted">오늘의 복습과 공부 타이머는 다음 단계에서 만듭니다.</p>
    </>
  );
}
