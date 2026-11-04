import type { DatabaseSync } from "node:sqlite";

/**
 * fn 안의 SQL을 트랜잭션 하나로 묶는다: 끝까지 성공하면 COMMIT(확정), 중간에 오류가 나면 ROLLBACK(전부 취소).
 * 예) 카드는 저장됐는데 태그 저장에서 실패하면, 카드 저장도 같이 취소된다.
 * 주의: 트랜잭션 안에서 또 withTransaction 을 부르면(중첩) 안 된다.
 */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
