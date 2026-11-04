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

## 연습 문제 ① 오늘 복습할 카드 (직접 써 보기)

**조건**: 삭제되지 않았고(소프트 삭제 아님), 복습 예정일이 오늘(서울) 이전이거나 오늘인 카드.
**순서**: 가장 오래 밀린 카드부터. 같은 날이면 상자 번호가 낮은 것부터.
**개수**: 하루 상한 20장 (설정값 `daily_review_limit`을 쓰는 건 ④단계에서. 지금은 숫자 20을 직접 써도 됩니다.)

```sql
SELECT id, question, box, due_date
FROM cards
-- 여기를 채워 보세요
;
```

힌트 (필요할 때만 펼쳐 보세요)
1. `WHERE` 조건이 2개 필요해요. 하나는 `deleted_at`이 **비어 있는지**, 하나는 `due_date`와 "서울 오늘" 비교입니다.
2. "비어 있다"는 `= NULL`이 아니라 `IS NULL`이에요. (NULL은 "값 없음"이라 `=`로 비교가 안 됩니다.)
3. 서울 오늘은 `date('now', '+9 hours')`. `due_date`는 `YYYY-MM-DD` 문자열이라 `<=`로 비교하면 날짜 순서와 같아요.
4. 정렬은 `ORDER BY` 뒤에 열을 쉼표로 이어요. 개수 제한은 `LIMIT`.

정답은 직접 써서 보내 주시면 확인해 드릴게요. (정답을 바로 알고 싶으면 "정답 보여줘"라고 하세요.)

---

## 연습 문제 ② 태그별 카드 개수 (③단계에서 출제)

`tags`, `card_tags`, `cards`를 이어서(`JOIN`) 태그 이름마다 카드가 몇 장인지 세는 문제예요. 핵심 단어는 `GROUP BY`와 `count(*)`. 삭제된 카드는 빼야 합니다.

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

> 이후 단계에서 채울 쿼리: 복습 결과 반영(트랜잭션), 이번 주 집중 시간 합계, 태그 검색, 글자 검색.
