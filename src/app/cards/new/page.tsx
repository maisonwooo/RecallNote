import { CardForm } from "@/components/card-form";
import { createCardAction } from "../actions";

export default function NewCardPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold page-title">새 카드</h1>
      <CardForm
        action={createCardAction}
        initial={{ question: "", answer: "", source: "", tags: "" }}
        submitLabel="저장"
        cancelHref="/cards"
      />
    </>
  );
}
