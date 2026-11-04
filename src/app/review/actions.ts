"use server";
// 복습 화면이 "평가"를 저장할 때 부르는 서버 동작. 실제 계산·저장은 src/lib/review.ts 가 한다.
import { applyReview, isReviewResult } from "@/lib/review.ts";
import { getDb } from "@/lib/db/connection.ts";

export type SubmitReviewResult =
  | { status: "saved"; boxAfter: number; nextDue: string }
  | { status: "already" } // 이미 처리된 카드 (다른 탭에서 평가했거나 더블 클릭)
  | { status: "error"; message: string };

export async function submitReviewAction(cardId: number, result: string): Promise<SubmitReviewResult> {
  // 서버 동작은 밖에서 직접 부를 수도 있으니, 받은 값을 항상 다시 검사한다.
  if (!Number.isInteger(cardId) || cardId < 1 || !isReviewResult(result)) {
    return { status: "error", message: "잘못된 요청이에요." };
  }
  try {
    const applied = applyReview(getDb(), cardId, result);
    if (!applied.ok) return { status: "already" };
    return { status: "saved", boxAfter: applied.boxAfter, nextDue: applied.nextDue };
  } catch (error) {
    console.error("복습 저장 실패", error); // 서버 터미널에만 남는다
    return { status: "error", message: "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요." };
  }
}
