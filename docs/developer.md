# 개발자 안내

코드를 고치거나 테스트를 돌리고 싶은 사람을 위한 문서입니다. 앱을 그냥 쓰기만 한다면 [README.md](../README.md)만 보면 됩니다.

작업 규칙(안전 규칙 포함)은 [CLAUDE.md](../CLAUDE.md), 기획은 [spec.md](../spec.md)에 있습니다.

## 준비물
- Node.js 22.5 이상 (이 프로젝트는 v26에서 확인). SQLite는 Node 내장(`node:sqlite`)을 쓰므로 따로 설치할 DB 프로그램이 없습니다.

## 자주 쓰는 명령
| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 (127.0.0.1에서만) |
| `npm run db:migrate` | 서버 없이 DB 만들기/마이그레이션 적용 확인 |
| `npm run db:seed` | 예시 카드 6장 넣기. **카드나 태그가 이미 있으면 거부**함 |
| `npm run backup:auto` | 자동 백업 한 번 실행 (마지막 백업 후 7일이 안 지났으면 건너뜀) |
| `npm test` | 전체 테스트 (임시 DB·임시 폴더만 사용. 내 `data/`는 건드리지 않음) |
| `npm run lint` | 코드 검사 |

## 환경 변수
| 이름 | 뜻 |
|---|---|
| `RECALLNOTE_DB_PATH` | DB 파일 위치. 테스트·검증 때는 항상 임시 파일로 지정 |
| `RECALLNOTE_DIST_DIR` | 빌드 출력 폴더. 검증 빌드는 `.next-verify`처럼 따로 지정 |
| `RECALLNOTE_LEARNING_LOG` | 학습 기록 표 파일 위치 (기본 `~/learning-log/confusions.md`) |

검증용 서버는 사용 중인 개발 서버와 겹치지 않게 다른 포트(예: 3100)를 씁니다.

## 폴더 구조
```
migrations/   DB 구조를 만드는 번호 붙은 SQL (0001_init.sql ...)  ← 적용된 파일은 수정 금지
seed/         예시 데이터 SQL
src/lib/db/   DB 연결, 마이그레이션 실행기, seed 실행기, 트랜잭션 도우미
src/lib/backup/ 백업 파일 형식·내보내기·검사·가져오기·CSV·자동 백업
src/lib/local-guard.ts 요청 주소(Host·Origin) 검사 / src/proxy.ts 모든 요청에 적용
src/lib/      cards.ts(카드 SQL 모음), card-input.ts(입력 검사), review.ts(복습 규칙·SQL), timer.ts(타이머·통계), settings.ts(설정)
src/lib/learning-log/ 학습 기록 표 읽기·후보 만들기·카드로 가져오기
src/app/      화면(홈, review, cards, archive, timer, stats, backup, settings, learn)
src/components/ 폼·확인 창 등 화면 조각
scripts/      db:migrate, db:seed, backup:auto 명령과 자동 백업 설치·제거 스크립트
public/fonts/ Pretendard 글꼴(라이선스 포함)
tests/        테스트 (DB, 카드, 복습, 타이머·설정, 백업, 자동 백업, 주소 검사, 학습 기록)
docs/         화면 목록, DB 설계, 핵심 쿼리 모음(queries.md)
data/         내 DB 파일이 생기는 곳 (git에 올라가지 않음)
```

## 학습 기록 표 형식 (선택 기능 `/learn`)
`/learn`은 마크다운 표 파일(`~/learning-log/confusions.md`)에서 카드 후보를 만드는 **선택 기능**입니다. 이 파일이 없어도 앱은 평소처럼 동작합니다. 앱은 이 파일을 **읽기만 하고 절대 수정하지 않습니다.**

### 열
열은 **이름으로** 찾으므로 순서가 달라도 됩니다.

| 열 이름 | 필수 | 뜻 |
|---|---|---|
| `날짜` | 필수 | 배운 날 |
| `프로젝트` | 필수 | 어느 프로젝트에서 나왔는지 (복습 앞면의 태그가 됨) |
| `주제` | 필수 | 주제 (태그가 됨) |
| `몰랐던 점` | 필수 | 무엇이 헷갈렸는지 |
| `카드 질문` | 필수 | 카드 앞면. 질문만 봐도 이해되게 한 문장으로 |
| `내가 이해한 한 줄` | 필수 | 카드 뒷면(답). **비어 있으면 후보에서 제외** |
| `맥락` | 선택 | 카드의 **출처**가 됨 (140자 제한) |

예시:
```
| 날짜 | 프로젝트 | 주제 | 몰랐던 점 | 카드 질문 | 맥락 | 내가 이해한 한 줄 | 카드화 |
|---|---|---|---|---|---|---|---|
| 2026-11-04 | MyApp | 재시도 | 실패하면 바로 다시 해도 되는지 | MyApp의 backoff.js에서 재시도 간격을 점점 늘리는 이유는? | MyApp 4회차 (backoff.js) | 서버가 숨 돌릴 시간을 주려고 | |
```

### 동작 규칙
- 파일 크기는 2MB까지, 바로가기(심볼릭 링크)는 거부합니다.
- 카드는 반드시 `importRows`로 만듭니다. 서버가 파일을 **다시 읽어** 사용자가 고른 줄과 맞는 것만 처리하고, 화면이 보낸 질문·답은 쓰지 않습니다.
- 한 번 처리한 줄은 `learning_sources`에 표식(날짜+프로젝트+주제+몰랐던 점으로 계산)을 남겨 다시 나오지 않습니다. 이 계산식을 바꾸면 같은 줄이 다시 후보가 되므로 바꾸지 않습니다.

## 백업 구조 (코드 쪽)
- 백업 코드는 `src/lib/backup/`에만 둡니다. 가져오기는 **전체 교체**만 지원하며 ① `parseBackup`으로 엄격 검사 ② 바꾸기 직전 안전 백업 저장(실패하면 중단) ③ `withTransaction`으로 지우고 넣기 순서를 지킵니다.
- 새 열·표를 추가하는 마이그레이션을 만들면 같은 작업에서 `format.ts`, `export.ts`, `validate.ts`, `import.ts`와 백업 테스트를 함께 고치고 `BACKUP_VERSION`을 올릴지 정합니다.
- 자동 백업 로직은 `src/lib/backup/auto.ts`, 실행은 `scripts/auto-backup.ts`입니다. DB는 읽기 전용으로만 엽니다.

## 문서
- [spec.md](../spec.md) 기획서
- [screens.md](screens.md) 화면 목록
- [db-design.md](db-design.md) DB 설계
- [queries.md](queries.md) 핵심 쿼리 모음과 연습 문제
- [CLAUDE.md](../CLAUDE.md) 작업 규칙
