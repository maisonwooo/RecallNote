-- 예시 데이터 (연습용). 카드/태그가 비어 있는 DB에만 들어간다: npm run db:seed
-- 날짜는 서울 기준 오늘(date('now','+9 hours'))을 기준으로 잡는다.

INSERT INTO tags (id, name) VALUES
  (1, '보안'),
  (2, 'http'),
  (3, '쉘'),
  (4, 'git');

INSERT INTO cards (id, question, answer, source, box, due_date) VALUES
  (1, '해시(hash)란 무엇인가요?',
      '데이터를 고정된 길이의 값으로 바꾸는 한 방향 계산. 결과로 원래 값을 되돌릴 수 없다.',
      '예시 · 보안 기본', 1, date('now', '+9 hours')),
  (2, '비밀번호를 해시할 때 솔트(salt)를 왜 쓰나요?',
      '같은 비밀번호도 해시가 다르게 나오게 해서, 미리 계산해 둔 표로 맞춰 보는 공격을 막는다.',
      '예시 · 보안 기본', 2, date('now', '+9 hours')),
  (3, 'HTTP 상태코드 404는 무슨 뜻인가요?',
      '요청한 주소에 해당하는 것이 서버에 없다(Not Found).',
      '예시 · HTTP 기초', 3, date('now', '+9 hours', '-1 day')),
  (4, '쿠키에 httpOnly 옵션을 켜면 무엇이 좋은가요?',
      '브라우저의 JS가 쿠키를 읽지 못해서, 토큰을 훔쳐 가는 공격을 막는 데 도움이 된다.',
      '예시 · HTTP 기초', 4, date('now', '+9 hours', '+3 days')),
  (5, '쉘에서 현재 폴더의 파일 목록을 보는 명령은?',
      'ls (자세히 보려면 ls -la)',
      '예시 · 쉘', 1, date('now', '+9 hours')),
  (6, 'git에서 "저장 후보 목록(스테이징)"에 파일을 올리는 명령은?',
      'git add <파일>',
      NULL, 5, date('now', '+9 hours', '+10 days'));

INSERT INTO card_tags (card_id, tag_id) VALUES
  (1, 1),
  (2, 1),
  (3, 2),
  (4, 1), (4, 2),
  (5, 3),
  (6, 4);
