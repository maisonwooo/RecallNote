import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CardForm } from "@/components/card-form";
import { getCard } from "@/lib/cards.ts";
import { getDb } from "@/lib/db/connection.ts";
import { updateCardAction } from "../../actions";

async function EditCard({ params }: { params: PageProps<"/cards/[id]/edit">["params"] }) {
  await connection();
  const { id: rawId } = await params;
  const id = /^\d+$/.test(rawId) ? Number(rawId) : 0;
  const card = id > 0 ? getCard(getDb(), id) : null;
  if (!card || card.deletedAt) notFound();

  return (
    <CardForm
      action={updateCardAction.bind(null, card.id)}
      initial={{ question: card.question, answer: card.answer, source: card.source ?? "", tags: card.tags.join(", ") }}
      submitLabel="저장"
      cancelHref={`/cards/${card.id}`}
    />
  );
}

export default function EditCardPage(props: PageProps<"/cards/[id]/edit">) {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold page-title">카드 수정</h1>
      <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
        <EditCard params={props.params} />
      </Suspense>
    </>
  );
}
