# CLAUDE.md — RecallNote 작업 규칙

전역 규칙(`~/.claude/CLAUDE.md`)도 함께 따른다. 이 문서는 이 프로젝트 전용 규칙이다.

## 프로젝트 요약
나만 쓰는 로컬 학습 노트 앱. 카드(질문/답) + 라이트너 복습 + 공부 타이머/눈 휴식 + 백업. 자세한 건 `spec.md`.

## 사용자와 일하는 방식
- 사용자는 코딩 초보. **쉬운 한국어**로 설명하고, 전문 용어는 처음 나올 때 짧게 푼다.
- 각 단계 시작 전에 계획을 짧게 보여주고 승인받는다. 끝나면 쉬운 요약 + "내가 직접 할 일"을 정리하고 **멈춰서** 확인을 기다린다.
- 진행 순서: ① 기획 → ② 뼈대·git·마이그레이션·seed → ③ 카드 → ④ 복습 → ⑤ 타이머·통계 → ⑥ 내보내기/가져오기 → ⑦ 화면 다듬기·점검
- 선생님 역할: 구현 중 "직접 써보세요" 문제를 1~2개 낸다. 정답보다 **힌트 먼저**. 사용자가 "그냥 만들어줘"라고 하면 만들어도 된다.
- 새 개념(트랜잭션, 인덱스, 마이그레이션 등)이 코드에 나오면 한두 문장으로 설명한다.

## 절대 규칙
- 로그인, 회원가입, 외부 배포, 외부 API 호출을 만들지 않는다.
- 서버는 `127.0.0.1`에서만 연다. 외부로 데이터를 보내지 않는다.
- **`data/`의 실제 DB는 삭제·덮어쓰기 금지.** 테스트는 임시 DB 파일을 따로 만들어 한다.
- 사용자가 켜 둔 개발 서버는 끄거나 다시 켜지 않는다. 검증은 다른 포트·다른 출력 폴더에서 하고, 내가 만든 것만 정리한다.
- `.env` 값·토큰·키는 출력하지 않는다.
- 사용자 입력 글은 HTML이 실행되지 않게 그린다(`dangerouslySetInnerHTML` 사용 금지).

## DB 규칙
- 파일: `data/recallnote.db` (SQLite). `PRAGMA foreign_keys = ON`을 연결마다 켠다.
- 시각은 UTC로 저장, 화면에서 Asia/Seoul로 표시. 예외: `cards.due_date`는 서울 날짜 `YYYY-MM-DD`.
- 마이그레이션: `migrations/0001_...sql` 번호 파일. 앱 시작 시 미적용분만 순서대로 적용. **적용된 파일은 수정하지 않고** 새 번호로 추가한다.
- 정상 카드를 조회할 때는 항상 `deleted_at IS NULL`.
- `cards.type`은 미리 만들어 두었지만 지금은 `qa`만 구현한다.
- 핵심 쿼리는 `docs/queries.md`에 정리한다.
- 카드 SQL은 `src/lib/cards.ts`에만 둔다(db를 첫 인자로 받음). 사용자 입력은 SQL 글자에 이어 붙이지 않고 `?`로 넘긴다. 검색어의 `%`, `_`, `\`는 `escapeLike`로 처리한다.
- 여러 줄을 함께 바꾸는 저장(카드+태그)은 `withTransaction`으로 묶는다.
- 화면 패턴: 페이지는 바깥에서 `Suspense`로 감싸고, 안쪽 async 컴포넌트에서 `await connection()` → `await params/searchParams` → DB 읽기. 폼은 Server Action(`src/app/cards/actions.ts`) + `useActionState`, 성공하면 `revalidatePath` 후 `redirect`(try 밖에서).
- SQLite 라이브러리: **Node 내장 `node:sqlite`로 확정**. 코드는 `src/lib/db/`에 있다.
- DB 접근은 `getDb()`(앱), `openAndMigrate(file)`(스크립트/테스트)만 쓴다. 서버 페이지에서 DB를 읽기 전에 `await connection()`(next/server)을 부른다. 이 Next.js는 Cache Components가 켜져 있어 이걸 빼면 DB 값이 미리 만들어진 화면에 굳을 수 있다.
- `scripts/*.ts`, `tests/*.ts`는 Node가 직접 실행한다(`.ts` 확장자 import, `enum` 등 변환이 필요한 문법 금지).
- 테스트·검증 땐 항상 `RECALLNOTE_DB_PATH`를 임시 파일로 지정하고, 검증 빌드는 `RECALLNOTE_DIST_DIR=.next-verify`, 포트 3100을 쓴다.
- 이 프로젝트의 Next.js 버전은 기존 지식과 다를 수 있다. 코드를 쓰기 전 `node_modules/next/dist/docs/`의 관련 문서를 확인한다(AGENTS.md).

## git 규칙
- `.gitignore`에 `data/`, `*.db`, `*.db-journal`, `node_modules`, `.next`, `.env*` 를 넣고, 첫 커밋 전에 `git status`로 빠졌는지 보여준다.
- 큰 기능은 `feature/...` 브랜치에서 작업하고, 사용자가 확인하면 main에 merge한다.
- 커밋은 단계가 끝나고 **사용자가 확인한 뒤** 한국어 메시지로 한다.
- **push는 사용자가 말할 때만.** 나중에 GitHub Private 저장소에 올릴 예정.
- 올리기 전에는 `/secret-check`를 제안한다.

## 문서 규칙
- 코드가 바뀌면 같은 작업에서 `spec.md`, `README.md`, 필요한 `docs/`도 같이 고친다.
- README에는 "DB 파일은 git에 없으니 가끔 백업하세요"와 내보내기 사용법을 항상 유지한다.

## 화면 규칙
- 다크/라이트는 시스템 설정을 따른다. 부드러운 배경색(순수 흰색/검정 금지).
- Pretendard(없으면 시스템 글꼴), 기본 16px 이상, 줄 간격 넉넉하게, 설정에서 글자 크기 조절.
- 숫자는 `tabular-nums`. 애니메이션 최소, `prefers-reduced-motion`을 따른다.
- 복습 키보드: Space 답 보기, 1/2/3 평가.
