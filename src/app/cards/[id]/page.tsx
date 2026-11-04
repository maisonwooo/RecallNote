import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ConfirmForm } from "@/components/confirm-form";
import { getCard } from "@/lib/cards.ts";
import { getDb } from "@/lib/db/connection.ts";
import { formatSeoul } from "@/lib/format.ts";
import { deleteCardAction } from "../actions";

async function CardDetail({ params }: { params: PageProps<"/cards/[id]">["params"] }) {
  await connection();
  const { id: rawId } = await params;
  const id = /^\d+$/.test(rawId) ? Number(rawId) : 0;
  const card = id > 0 ? getCard(getDb(), id) : null;
  if (!card || card.deletedAt) notFound();

  return (
    <article>
      <h1 className="mb-1 text-sm font-normal text-muted">질문</h1>
      <p className="mb-8 whitespace-pre-wrap break-words text-2xl font-semibold leading-snug">{card.question}</p>

      <h2 className="mb-1 text-sm font-normal text-muted">내가 쓴 답</h2>
      <p className="panel mb-8 whitespace-pre-wrap break-words">{card.answer}</p>

      <dl className="mb-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-muted">
        {card.source && (
          <>
            <dt>출처</dt>
            <dd className="break-words">{card.source}</dd>
          </>
        )}
        <dt>태그</dt>
        <dd className="flex flex-wrap gap-2">
          {card.tags.length === 0 ? "없음" : card.tags.map((name) => (
            <Link key={name} href={`/cards?tag=${encodeURIComponent(name)}`} className="chip">
              {name}
            </Link>
          ))}
        </dd>
        <dt>상자</dt>
        <dd>{card.box} / 5</dd>
        <dt>복습 예정</dt>
        <dd>{card.dueDate}</dd>
        <dt>만든 때</dt>
        <dd>{formatSeoul(card.createdAt)}</dd>
        <dt>고친 때</dt>
        <dd>{formatSeoul(card.updatedAt)}</dd>
      </dl>

      <div className="flex flex-wrap gap-3">
        <Link href={`/cards/${card.id}/edit`} className="btn btn-primary">
          수정
        </Link>
        <ConfirmForm
          action={deleteCardAction.bind(null, card.id)}
          message="이 카드를 보관함으로 보낼까요? 보관함에서 다시 복원할 수 있어요."
          className="btn btn-danger"
        >
          삭제
        </ConfirmForm>
        <Link href="/cards" className="btn">
          목록으로
        </Link>
      </div>
    </article>
  );
}

export default function CardPage(props: PageProps<"/cards/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
      <CardDetail params={props.params} />
    </Suspense>
  );
}
