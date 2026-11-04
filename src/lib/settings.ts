import type { DatabaseSync } from "node:sqlite";

export const DEFAULT_DAILY_REVIEW_LIMIT = 20;

/**
 * settings 표의 daily_review_limit(하루 복습 상한)을 읽는다.
 * 값이 없거나 이상하면(숫자가 아니거나 1~200 밖) 기본값 20을 쓴다. (설정은 글자로 저장돼 있어서 검사가 필요하다)
 */
export function getDailyReviewLimit(db: DatabaseSync): number {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'daily_review_limit'").get() as
    | { value: string }
    | undefined;
  const n = Number(row?.value);
  return Number.isInteger(n) && n >= 1 && n <= 200 ? n : DEFAULT_DAILY_REVIEW_LIMIT;
}
