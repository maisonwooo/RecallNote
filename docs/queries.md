# 핵심 쿼리 모음 (docs/queries.md)

> 쿼리(query) = DB에 하는 질문. SQL로 쓴다.
> 직접 해 볼 때는 **복사본 DB**에서 하세요. 진짜 `data/recallnote.db`는 건드리지 않는 게 안전합니다.
> 연습용 DB 만들기(진짜 DB와 분리됨):
> ```
> RECALLNOTE_DB_PATH=/tmp/practice.db npm run db:seed
> sqlite3 /tmp/practice.db        # sqlite3 명령이 없으면 알려 주세요
> ```
> 날짜 규칙: `due_date`는 서울 날짜 문자열, 시각(`*_at`)은 UTC. "서울 오늘" = `date('now', '+9 hours')`.

---

## 연습 문제 ① 오늘 복습할 카드 (풀이 완료)

삭제되지 않았고, 복습 예정일이 서울 기준 오늘이거나 그 이전인 카드. 가장 오래 밀린 카드부터, 같은 날이면 상자 번호가 낮은 것부터. 하루 상한만큼(앱에서는 `daily_review_limit`에서 오늘 한 장수를 뺀 값).

```sql
SELECT id, question, box, due_date
FROM cards
WHERE deleted_at IS NULL AND due_date <= date('now', '+9 hours')
ORDER BY due_date, box, id
LIMIT 20;
```

- `IS NULL`(비어 있다), `AND`(그리고), `<=`(작거나 같다), `ORDER BY` 뒤에는 열 이름을 쉼표로 이어 2순위를 붙인다.
- 마지막 `id`는 앱에서 순서가 매번 똑같도록 붙인 세 번째 기준이다.
- 예시 데이터 결과: 4장 (3번 → 1번 → 5번 → 2번).
- 앱 코드: `src/lib/review.ts`의 `getReviewQueue`

---

## 연습 문제 ② 태그별 카드 개수 (풀이 완료)

태그 이름마다 카드가 몇 장인지 센다. 삭제된 카드는 빼고, 많은 순으로 보여준다. (카드 목록의 태그 버튼 "보안 (3)"에 쓰인다.)

```sql
SELECT t.name, count(*) AS card_count
FROM tags t
JOIN card_tags ct ON ct.tag_id = t.id
JOIN cards c      ON c.id = ct.card_id
WHERE c.deleted_at IS NULL
GROUP BY t.id
ORDER BY card_count DESC;
```

- `GROUP BY t.id`: 같은 태그끼리 한 묶음으로 만들고, 묶음마다 `count(*)`로 줄 수를 센다.
- `WHERE`는 묶기 **전에** 삭제된 카드를 걸러낸다.
- `AS card_count`는 별명이라 `ORDER BY`에서는 `c.` 없이 이름만 쓴다.
- 문제에 없는 조건(예: `due_date`)을 끼워 넣으면 다른 질문이 된다.
- 예시 데이터 결과: 보안 3, http 2, git 1, 쉘 1.

---

## 연습 문제 ③ 오늘 복습 결과 세기 (직접 써 보기)

**문제**: 서울 기준 오늘 복습한 기록을 결과(`result`)별로 센다. (결과는 `right` / `unsure` / `wrong` 세 줄)

```sql
SELECT result, ______ AS n
FROM reviews
WHERE ______
GROUP BY ______;
```

**힌트**
1. 세기와 묶기는 연습 ②와 같은 모양이에요. 이번엔 `result`별로 묶습니다.
2. `reviewed_at`은 UTC라서 `date(reviewed_at, '+9 hours')`로 서울 날짜로 바꿔요.
3. 서울 오늘은 `date('now', '+9 hours')`. 두 날짜가 같은지 비교합니다.

---

## 연습 문제 ④ 오늘 집중 시간 합계 (직접 써 보기)

**문제**: 서울 기준 오늘 시작한 집중의 `focus_seconds` 합계를 구한다. (진행 중인 `running` 기록은 뺀다)

```sql
SELECT ______ AS seconds
FROM study_sessions
WHERE ______ AND ______;
```

**힌트**
1. 더하는 함수는 `sum(열 이름)`이에요. `count(*)`가 "개수"라면 `sum`은 "합계"입니다.
2. 날짜 비교는 연습 ③과 같은 모양이에요. 이번엔 열 이름이 `started_at`입니다.
3. `running`을 빼려면 `status <> 'running'` (`<>`는 "같지 않다")을 씁니다.

---

## 연습 문제 ⑤ 틀린 횟수가 많은 카드 3개 (직접 써 보기)

**문제**: `reviews`에서 결과가 `wrong`인 기록을 카드별로 세어서, 많은 순으로 3개만 보여준다.

```sql
SELECT c.question, count(*) AS wrong_count
FROM cards c
JOIN reviews r ON r.card_id = ______
WHERE r.result = ______
GROUP BY ______
ORDER BY ______ DESC
LIMIT 3;
```

**힌트**
1. `JOIN ... ON`에는 "두 표에서 같은 카드를 가리키는 열끼리" 같다고 씁니다. 왼쪽은 `r.card_id`, 오른쪽은 `cards`의 번호예요.
2. 결과 글자는 `'wrong'`처럼 따옴표로 감싸요. (연습 ④에서 배운 것!)
3. `ORDER BY`에는 `SELECT`에서 붙인 별명을 이름만 씁니다.

---

## 참고 쿼리 (정답 포함)

### 카드 하나와 그 카드의 태그 이름들
```sql
SELECT c.id, c.question, group_concat(t.name, ', ') AS tags
FROM cards c
LEFT JOIN card_tags ct ON ct.card_id = c.id
LEFT JOIN tags t       ON t.id = ct.tag_id
WHERE c.deleted_at IS NULL
GROUP BY c.id
ORDER BY c.created_at DESC;
```
- `LEFT JOIN`: 태그가 하나도 없는 카드도 목록에 남긴다. (`JOIN`만 쓰면 태그 없는 카드가 사라짐)
- `group_concat`: 여러 줄을 한 줄의 글자로 이어 붙인다.

### 보관함(삭제한 카드) 목록
```sql
SELECT id, question, deleted_at FROM cards WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC;
```

### 소프트 삭제와 복원
```sql
UPDATE cards SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = :id; -- 삭제
UPDATE cards SET deleted_at = NULL WHERE id = :id;                                   -- 복원
```

### 오늘(서울) 복습한 횟수
```sql
SELECT result, count(*) AS n
FROM reviews
WHERE date(reviewed_at, '+9 hours') = date('now', '+9 hours')
GROUP BY result;
```
`reviewed_at`은 UTC라서 `+9 hours`로 서울 시간으로 바꾼 뒤 날짜만 비교한다.

### 데이터 구조 확인 (읽기만)
```sql
SELECT filename, applied_at FROM schema_migrations ORDER BY filename;   -- 적용된 마이그레이션
SELECT * FROM settings;                                                  -- 설정 값
```

### 카드 글자 검색 (질문 또는 답)
```sql
SELECT id, question FROM cards
WHERE deleted_at IS NULL
  AND (question LIKE :pattern ESCAPE '\' OR answer LIKE :pattern ESCAPE '\')
ORDER BY created_at DESC, id DESC;
```
- `LIKE '%해시%'`: "해시"가 들어간 글을 찾는다. `%`는 "아무 글자 여러 개".
- 검색어에 `%`나 `_`가 들어 있으면 의미가 바뀌어서, 앞에 `\`를 붙이고 `ESCAPE '\'`로 알려 준다 (코드의 `escapeLike`).
- 영문 대소문자는 구분하지 않는다(한글은 대소문자가 없음).

### 특정 태그가 붙은 카드만
```sql
SELECT c.id, c.question FROM cards c
WHERE c.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM card_tags ct JOIN tags t ON t.id = ct.tag_id
              WHERE ct.card_id = c.id AND t.name = :tag);
```
- `EXISTS (...)`: 안쪽 질문에 해당하는 줄이 하나라도 있으면 참. 태그가 여러 개 붙은 카드가 중복으로 나오지 않는다.
- `tags.name`은 대소문자 무시(`COLLATE NOCASE`) 열이라 `GIT`로 찾아도 `git`이 걸린다.

### 카드 저장 (트랜잭션 안에서)
```sql
BEGIN;
INSERT INTO cards (question, answer, source, due_date) VALUES (?, ?, ?, date('now', '+9 hours'));
DELETE FROM card_tags WHERE card_id = :id;                      -- 수정할 때: 태그 연결을 지우고 새로 만든다
INSERT INTO tags (name) VALUES (:name) ON CONFLICT (name) DO NOTHING;   -- 이미 있으면 그대로 둔다
INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (:id, :tag_id);
COMMIT;                                                         -- 중간에 오류가 나면 ROLLBACK 으로 전부 취소
```

### 복습 평가 저장 (트랜잭션 안에서, `applyReview`)
```sql
BEGIN;
SELECT box, due_date FROM cards WHERE id = :id AND deleted_at IS NULL;   -- 오늘 대상(due_date <= 오늘)이 아니면 여기서 끝
UPDATE cards SET box = :new_box, due_date = date(:today, '+4 days') WHERE id = :id;   -- 간격은 새 상자 기준: 1,2,4,8,16일
INSERT INTO reviews (card_id, result, box_before, box_after) VALUES (:id, :result, :old_box, :new_box);
COMMIT;
```
- 이미 오늘 처리된 카드는 `due_date`가 미래라서 첫 `SELECT` 뒤에 멈춘다. 그래서 같은 요청이 두 번 와도 한 번만 반영된다(**멱등**).

### 오늘 복습한 횟수 (하루 상한 계산용)
```sql
SELECT count(*) FROM reviews WHERE date(reviewed_at, '+9 hours') = date('now', '+9 hours');
```

### 오늘 복습 결과 요약 (앱이 쓰는 방식: FILTER)
```sql
SELECT count(*) FILTER (WHERE result = 'right')  AS right_n,
       count(*) FILTER (WHERE result = 'unsure') AS unsure_n,
       count(*) FILTER (WHERE result = 'wrong')  AS wrong_n
FROM reviews
WHERE date(reviewed_at, '+9 hours') = date('now', '+9 hours');
```
- `FILTER (WHERE ...)`: 이 묶음에서 조건에 맞는 줄만 센다. 한 줄에 세 숫자를 구할 때 편하다. (연습 ③은 같은 걸 `GROUP BY`로 구하는 문제)

### 백업에 쓰이는 쿼리
```sql
-- 현재 데이터에서 가장 최근에 일어난 일의 시각 (가져오기 미리보기 경고용)
SELECT max(t) FROM (
  SELECT max(created_at) AS t FROM cards
  UNION ALL SELECT max(updated_at) FROM cards
  UNION ALL SELECT max(reviewed_at) FROM reviews
  UNION ALL SELECT max(started_at) FROM study_sessions);

-- 보관함과 정상 카드를 한 번에 세기
SELECT count(*) FILTER (WHERE deleted_at IS NULL)     AS active,
       count(*) FILTER (WHERE deleted_at IS NOT NULL) AS archived
FROM cards;
```
- `UNION ALL`: 여러 질문의 결과를 위아래로 이어 붙인다.
- 가져오기는 `DELETE FROM ...`로 자식 표(`card_tags`, `reviews`, `study_sessions`)부터 지운 뒤 부모 표(`cards`, `tags`)를 지우고, 파일 내용을 `INSERT` 한다. 전체가 트랜잭션 하나다.
