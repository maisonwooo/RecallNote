import { Suspense } from "react";
import { connection } from "next/server";
import { ConfirmForm } from "@/components/confirm-form";
import { listArchived } from "@/lib/cards.ts";
import { getDb } from "@/lib/db/connection.ts";
import { formatSeoul } from "@/lib/format.ts";
import { restoreCardAction } from "../cards/actions";

async function ArchiveContent() {
  await connection();
  const cards = listArchived(getDb());

  if (cards.length === 0) {
    return <div className="panel text-muted">보관함이 비어 있어요.</div>;
  }
  return (
    <ul className="space-y-3">
      {cards.map((card) => (
        <li key={card.id} className="panel flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="whitespace-pre-wrap break-words font-medium">{card.question}</p>
            <p className="mt-1 text-sm text-muted">삭제한 때 {formatSeoul(card.deletedAt ?? "")}</p>
          </div>
          <ConfirmForm
            action={restoreCardAction.bind(null, card.id)}
            message="이 카드를 복원할까요? 복습 일정은 그대로 이어집니다."
            className="btn shrink-0"
          >
            복원
          </ConfirmForm>
        </li>
      ))}
    </ul>
  );
}

export default function ArchivePage() {
  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold">보관함</h1>
      <p className="mb-6 text-muted">삭제한 카드가 여기 있어요. 복원하면 카드 목록으로 돌아갑니다.</p>
      <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
        <ArchiveContent />
      </Suspense>
    </>
  );
}
