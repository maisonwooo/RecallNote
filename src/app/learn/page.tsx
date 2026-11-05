import { Suspense } from "react";
import { connection } from "next/server";
import { LearnPanel } from "@/components/learn-panel";
import { getDb } from "@/lib/db/connection.ts";
import { loadLog, toClientOverview } from "@/lib/learning-log/api.ts";

async function LearnContent() {
  await connection(); // 파일과 DB는 요청마다 읽는다
  const loaded = loadLog();
  if (!loaded.ok) return <LearnPanel initial={null} initialError={loaded.error} />;
  return <LearnPanel initial={toClientOverview(getDb(), loaded)} initialError={null} />;
}

export default function LearnPage() {
  return (
    <>
      <h1 className="page-title mb-2 text-2xl font-semibold">학습 기록에서 카드 만들기</h1>
      <p className="mb-8 text-muted">
        <code>~/learning-log/confusions.md</code>의 “카드 질문”과 “내가 이해한 한 줄”로 카드를 만들어요. 파일은 읽기만 하고 바꾸지 않아요. 한 번
        처리한 줄은 다시 나오지 않아요.
      </p>
      <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
        <LearnContent />
      </Suspense>
    </>
  );
}
