-- 0002_learning_sources.sql : 학습 기록(confusions.md)에서 카드를 만들 때 "어느 줄을 처리했는지" 기억하는 표
-- 규칙: 이 파일은 적용된 뒤에는 절대 고치지 않는다.
-- 줄마다 고유 표식(source_key: 날짜+프로젝트+주제+몰랐던 점으로 만든 해시 16자리)과 상태를 저장한다.
--   imported = 카드로 만들었음 (카드를 지워도 같은 줄이 다시 카드로 만들어지지 않는다)
--   skipped  = 카드로 안 만들기로 했음 (되돌릴 수 있다)
-- cards 표는 바꾸지 않는다.
CREATE TABLE learning_sources (
  source_key  TEXT    PRIMARY KEY CHECK (length(source_key) = 16 AND source_key NOT GLOB '*[^0-9a-f]*'),
  status      TEXT    NOT NULL CHECK (status IN ('imported', 'skipped')),
  card_id     INTEGER REFERENCES cards (id) ON DELETE SET NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- 건너뛴 줄에는 카드가 없다
  CHECK (status <> 'skipped' OR card_id IS NULL)
);
CREATE INDEX idx_learning_sources_card ON learning_sources (card_id);
