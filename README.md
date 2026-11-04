# RecallNote

배운 개념을 "질문/답" 카드로 저장하고, 매일 복습하고, 공부 타이머와 눈 휴식까지 챙기는 **나만 쓰는 로컬 학습 노트 앱**.

> 상태: ⑥ 백업(내보내기/가져오기)까지 완료. 남은 일: Pretendard 글꼴, 글자 크기 설정, 전체 점검.
> 자세한 내용: [spec.md](spec.md)

## 준비물
- Node.js 22.5 이상 (이 프로젝트는 v26에서 확인). SQLite는 Node 내장(`node:sqlite`)을 쓰므로 따로 설치할 DB 프로그램이 없습니다.

## 실행 방법
```
npm install
npm run dev        # http://127.0.0.1:3000 (내 컴퓨터 안에서만 열림)
```
처음 실행해서 화면을 열면 빈 DB(`data/recallnote.db`)가 자동으로 만들어지고 `migrations/`의 SQL이 순서대로 적용됩니다.

### 자주 쓰는 명령
| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 (127.0.0.1에서만) |
| `npm run db:migrate` | 서버 없이 DB 만들기/마이그레이션 적용 확인 |
| `npm run db:seed` | 예시 카드 6장 넣기. **카드나 태그가 이미 있으면 거부**함 |
| `npm test` | DB 테스트 (임시 DB만 사용. 내 `data/`는 건드리지 않음) |
| `npm run lint` | 코드 검사 |

### 예시 데이터로 먼저 둘러보기 (내 진짜 DB 대신 연습용 DB)
```
RECALLNOTE_DB_PATH=/tmp/practice.db npm run db:seed
RECALLNOTE_DB_PATH=/tmp/practice.db npm run dev
```
`RECALLNOTE_DB_PATH`로 DB 파일 위치를 바꿀 수 있어서, 진짜 기록과 섞이지 않습니다.

## 지금 쓸 수 있는 것
- `/cards` 카드 목록: 검색(질문·답), 태그로 거르기, 최근 순, 50장씩 "더 보기"
- `/cards/new` 새 카드, `/cards/[id]` 보기, `/cards/[id]/edit` 수정
- 삭제하면 `/archive`(보관함)로 가고, 거기서 복원할 수 있어요 (완전 삭제는 없음)

- `/review` 오늘의 복습: 한 장씩 질문 → 답 보기(`Space`) → 틀림/애매/맞음(`1`/`2`/`3`). 끝나면 오늘 결과 요약. 하루 상한(기본 20장)을 채우면 "더 복습하기"(10장씩)
- `/timer` 공부 타이머: 집중 → 휴식(눈 휴식 안내). 새로고침해도 이어지고, 허용하면 끝날 때 알림(탭이 열려 있을 때만)
- `/stats` 오늘·이번 주 집중 시간과 요일별 막대 그래프
- `/settings` 하루 복습 상한, 집중·휴식 시간
- `/backup` JSON 내보내기·가져오기, 카드 CSV 내보내기

## 폴더 구조
```
migrations/   DB 구조를 만드는 번호 붙은 SQL (0001_init.sql ...)  ← 적용된 파일은 수정 금지
seed/         예시 데이터 SQL
src/lib/db/   DB 연결, 마이그레이션 실행기, seed 실행기, 트랜잭션 도우미
src/lib/      cards.ts(카드 SQL 모음), card-input.ts(입력 검사), review.ts(복습 규칙·SQL), timer.ts(타이머·통계), settings.ts(설정)
src/app/      화면(홈, review, cards, archive, timer, stats, settings)
src/components/ 폼·확인 창 등 화면 조각
scripts/      db:migrate, db:seed 명령
tests/        DB 테스트
docs/         화면 목록, DB 설계, 핵심 쿼리 모음(queries.md)
data/         내 DB 파일이 생기는 곳 (git에 올라가지 않음)
```

## ⚠️ 백업 (꼭 읽어 주세요)
**DB 파일은 git에 없으니 가끔 백업하세요.**
`data/` 폴더와 `*.db`는 개인 학습 기록이라 일부러 git에서 뺐습니다. 컴퓨터가 고장 나거나 폴더를 지우면 기록이 사라집니다.

### 내보내기
1. 앱의 **백업** 화면(`/backup`)을 연다.
2. **전체 JSON 받기**를 눌러 파일을 저장한다. (카드만 엑셀 등에서 보고 싶으면 **카드만 CSV 받기**. CSV는 가져오기에 쓸 수 없다.)
3. 저장한 파일을 git 밖(외장 디스크, 클라우드 등 내가 믿는 곳)에 보관한다. **파일에 내 학습 기록이 그대로 들어 있으니 git에 올리거나 남에게 보내지 마세요.**

### 가져오기 (지금 데이터를 파일 내용으로 통째로 바꿈)
1. **백업** 화면에서 JSON 파일을 고른다. 이 앱이 만든 파일만 가져올 수 있고, 내용이 하나라도 틀리면 거부된다.
2. 미리보기(지금 → 가져온 뒤 카드·복습 기록 개수)를 확인한다.
3. "이해했어요"를 체크하고 **이 파일로 바꾸기**를 누른다.
4. 바꾸기 **직전**의 데이터는 자동으로 `data/backups/before-import-날짜시각.json`에 저장된다. 잘못 가져왔다면 그 파일을 다시 가져오면 돌아간다. (이 폴더도 git에 올라가지 않는다. 오래된 안전 백업은 직접 지워도 된다.)

### 지금 당장 할 수 있는 백업: 파일 복사
앱을 끈 상태에서 `data/` 폴더를 통째로 다른 곳에 복사하세요. (WAL 방식을 쓰므로 `recallnote.db` 옆의 `-wal`, `-shm` 파일도 같이 복사하는 게 안전합니다. 앱을 끄면 보통 하나로 합쳐집니다.)
```
cp -R data ~/Desktop/recallnote-data-backup
```

## 문서
- [spec.md](spec.md) 기획서
- [docs/screens.md](docs/screens.md) 화면 목록
- [docs/db-design.md](docs/db-design.md) DB 설계
- [docs/queries.md](docs/queries.md) 핵심 쿼리 모음과 연습 문제
- [CLAUDE.md](CLAUDE.md) 작업 규칙
