-- 0001_init.sql : RecallNote 첫 번째 DB 구조
-- 규칙: 이 파일은 적용된 뒤에는 절대 고치지 않는다. 바꿀 일이 있으면 0002_...sql 을 새로 만든다.
-- (마이그레이션 실행기가 이 파일 전체를 트랜잭션 하나로 묶어 실행하므로 BEGIN/COMMIT은 쓰지 않는다.)
-- 시각은 UTC ISO 문자열(예: 2026-11-04T05:30:00.000Z). 예외: cards.due_date 는 서울 날짜(YYYY-MM-DD).

-- 카드
CREATE TABLE cards (
  id          INTEGER PRIMARY KEY,
  type        TEXT    NOT NULL DEFAULT 'qa' CHECK (type IN ('qa')),
  question    TEXT    NOT NULL CHECK (length(trim(question)) > 0),
  answer      TEXT    NOT NULL CHECK (length(trim(answer)) > 0),
  source      TEXT,
  box         INTEGER NOT NULL DEFAULT 1 CHECK (box BETWEEN 1 AND 5),
  due_date    TEXT    NOT NULL CHECK (due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT
);

-- 오늘 복습할 카드를 빨리 찾기 위한 인덱스(책의 찾아보기 같은 것)
CREATE INDEX idx_cards_deleted_due ON cards (deleted_at, due_date);

-- 태그 (대소문자 구분 없이 같은 이름은 하나만)
CREATE TABLE tags (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) > 0),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 카드-태그 연결 (다대다)
CREATE TABLE card_tags (
  card_id  INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags (id)  ON DELETE CASCADE,
  PRIMARY KEY (card_id, tag_id)
);
CREATE INDEX idx_card_tags_tag ON card_tags (tag_id);

-- 복습 기록
CREATE TABLE reviews (
  id           INTEGER PRIMARY KEY,
  card_id      INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  result       TEXT    NOT NULL CHECK (result IN ('wrong', 'unsure', 'right')),
  box_before   INTEGER NOT NULL CHECK (box_before BETWEEN 1 AND 5),
  box_after    INTEGER NOT NULL CHECK (box_after BETWEEN 1 AND 5),
  reviewed_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_reviews_card_time ON reviews (card_id, reviewed_at);
CREATE INDEX idx_reviews_time ON reviews (reviewed_at);

-- 공부 타이머 기록 (집중만)
CREATE TABLE study_sessions (
  id               INTEGER PRIMARY KEY,
  started_at       TEXT    NOT NULL,
  planned_minutes  INTEGER NOT NULL CHECK (planned_minutes > 0),
  ended_at         TEXT,
  status           TEXT    NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'stopped')),
  focus_seconds    INTEGER NOT NULL DEFAULT 0 CHECK (focus_seconds >= 0),
  -- 진행 중이면 ended_at 이 비어 있고, 끝났으면 ended_at 이 있어야 한다
  CHECK ((status = 'running' AND ended_at IS NULL) OR (status <> 'running' AND ended_at IS NOT NULL))
);
-- 동시에 진행 중인 타이머는 하나만 (status 가 'running' 인 줄은 최대 1개)
CREATE UNIQUE INDEX idx_study_sessions_one_running ON study_sessions (status) WHERE status = 'running';
CREATE INDEX idx_study_sessions_started ON study_sessions (started_at);

-- 설정 (key-value)
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO settings (key, value) VALUES
  ('daily_review_limit', '20'),
  ('focus_minutes', '50'),
  ('break_minutes', '10'),
  ('font_size', '16');
