"use server";
// 폼에서 부르는 서버 동작(Server Action). 실제 일은 src/lib/cards.ts 가 하고, 여기서는 검사·연결만 한다.
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { parseCardInput, type CardFormState } from "@/lib/card-input.ts";
import { createCard, restoreCard, softDeleteCard, updateCard } from "@/lib/cards.ts";
import { getDb } from "@/lib/db/connection.ts";

function readForm(formData: FormData) {
  return {
    question: formData.get("question"),
    answer: formData.get("answer"),
    source: formData.get("source"),
    tags: formData.get("tags"),
  };
}

function requireId(id: number): number {
  if (!Number.isInteger(id) || id < 1) notFound();
  return id;
}

const SAVE_FAILED = "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.";

export async function createCardAction(_prev: CardFormState, formData: FormData): Promise<CardFormState> {
  const parsed = parseCardInput(readForm(formData));
  if (!parsed.ok) return { errors: parsed.errors, values: parsed.values };

  let id: number;
  try {
    id = createCard(getDb(), parsed.value);
  } catch (error) {
    console.error("카드 만들기 실패", error); // 서버 터미널에만 남는다
    return { message: SAVE_FAILED, values: { ...parsed.value, source: parsed.value.source ?? "", tags: parsed.value.tags.join(", ") } };
  }
  revalidatePath("/", "layout");
  redirect(`/cards/${id}`); // redirect 는 try 밖에서 불러야 한다
}

export async function updateCardAction(
  id: number,
  _prev: CardFormState,
  formData: FormData,
): Promise<CardFormState> {
  requireId(id);
  const parsed = parseCardInput(readForm(formData));
  if (!parsed.ok) return { errors: parsed.errors, values: parsed.values };

  let updated: boolean;
  try {
    updated = updateCard(getDb(), id, parsed.value);
  } catch (error) {
    console.error("카드 수정 실패", error);
    return { message: SAVE_FAILED, values: { ...parsed.value, source: parsed.value.source ?? "", tags: parsed.value.tags.join(", ") } };
  }
  if (!updated) notFound(); // 없는 카드이거나 이미 보관함에 있음
  revalidatePath("/", "layout");
  redirect(`/cards/${id}`);
}

export async function deleteCardAction(id: number): Promise<void> {
  requireId(id);
  softDeleteCard(getDb(), id);
  revalidatePath("/", "layout");
  redirect("/cards");
}

export async function restoreCardAction(id: number): Promise<void> {
  requireId(id);
  restoreCard(getDb(), id);
  revalidatePath("/", "layout");
  redirect("/archive");
}
