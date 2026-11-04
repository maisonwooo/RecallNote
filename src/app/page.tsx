import { Suspense } from "react";
import { connection } from "next/server";
import { getDb } from "@/lib/db/connection.ts";

// ②단계 확인용 임시 화면. ③단계에서 진짜 홈 화면으로 바뀐다.
async function DbStatus() {
  await connection(); // DB는 요청마다 읽는다 (미리 만들어 둔 화면에 묻어 두지 않음)
  const db = getDb();
  const migrations = db
    .prepare("SELECT filename, applied_at FROM schema_migrations ORDER BY filename")
    .all() as { filename: string; applied_at: string }[];
  const cardCount = (
    db.prepare("SELECT count(*) AS n FROM cards WHERE deleted_at IS NULL").get() as { n: number }
  ).n;

  return (
    <ul className="space-y-2">
      <li>DB 연결: 정상</li>
      <li>
        카드: <span className="tabular-nums">{cardCount}</span>장
      </li>
      <li>
        적용된 마이그레이션:{" "}
        {migrations.length === 0 ? "없음" : migrations.map((m) => m.filename).join(", ")}
      </li>
    </ul>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="mb-2 text-3xl font-semibold">RecallNote</h1>
      <p className="mb-8 text-muted">② 단계 확인용 임시 화면입니다.</p>
      <Suspense fallback={<p className="text-muted">DB 확인 중…</p>}>
        <DbStatus />
      </Suspense>
    </main>
  );
}
