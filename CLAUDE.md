# CLAUDE.md — RecallNote 작업 규칙

전역 규칙(`~/.claude/CLAUDE.md`)도 함께 따른다. 이 문서는 이 프로젝트 전용 규칙이다.

## 프로젝트 요약
나만 쓰는 로컬 학습 노트 앱. 카드(질문/답) + 라이트너 복습 + 공부 타이머/눈 휴식 + 백업. 자세한 건 `spec.md`.

## 사용자와 일하는 방식
- 사용자는 코딩 초보. **쉬운 한국어**로 설명하고, 전문 용어는 처음 나올 때 짧게 푼다.
- 각 단계 시작 전에 계획을 짧게 보여주고 승인받는다. 끝나면 쉬운 요약 + "내가 직접 할 일"을 정리하고 **멈춰서** 확인을 기다린다.
- 진행 순서: ① 기획 → ② 뼈대·git·마이그레이션·seed → ③ 카드 → ④ 복습 → ⑤ 타이머·통계 → ⑥ 내보내기/가져오기 → ⑦ 화면 다듬기·점검 (모두 완료. 이후는 사용자가 요청할 때마다 계획 보고 → 승인 → 작업)
- 선생님 역할: 구현 중 "직접 써보세요" 문제를 1~2개 낸다. 정답보다 **힌트 먼저**. 사용자가 "그냥 만들어줘"라고 하면 만들어도 된다.
- 새 개념(트랜잭션, 인덱스, 마이그레이션 등)이 코드에 나오면 한두 문장으로 설명한다.

## 절대 규칙
- 로그인, 회원가입, 외부 배포, 외부 API 호출을 만들지 않는다.
- 서버는 `127.0.0.1`에서만 연다. 외부로 데이터를 보내지 않는다. `src/proxy.ts`가 모든 요청의 Host를 검사하므로 없애거나 느슨하게 만들지 않는다(DNS 리바인딩 방어). 규칙 변경은 `tests/backup.test.ts`의 주소 검사 테스트도 함께 고친다. `next.config.ts`의 보안 헤더(iframe 금지 등)도 유지한다.
- **`data/`의 실제 DB는 삭제·덮어쓰기 금지.** 테스트는 임시 DB 파일을 따로 만들어 한다.
- 사용자가 켜 둔 개발 서버는 끄거나 다시 켜지 않는다. 검증은 다른 포트·다른 출력 폴더에서 하고, 내가 만든 것만 정리한다.
- `.env` 값·토큰·키는 출력하지 않는다.
- 사용자 입력 글은 HTML이 실행되지 않게 그린다(`dangerouslySetInnerHTML` 사용 금지. 예외는 화면 규칙의 글자 크기 스크립트 한 곳).

## DB 규칙
- 파일: `data/recallnote.db` (SQLite). `PRAGMA foreign_keys = ON`을 연결마다 켠다.
- 시각은 UTC로 저장, 화면에서 Asia/Seoul로 표시. 예외: `cards.due_date`는 서울 날짜 `YYYY-MM-DD`.
- 마이그레이션: `migrations/0001_...sql` 번호 파일. 앱 시작 시 미적용분만 순서대로 적용. **적용된 파일은 수정하지 않고** 새 번호로 추가한다.
- 정상 카드를 조회할 때는 항상 `deleted_at IS NULL`.
- `cards.type`은 미리 만들어 두었지만 지금은 `qa`만 구현한다.
- 핵심 쿼리는 `docs/queries.md`에 정리한다.
- 카드 SQL은 `src/lib/cards.ts`에만 둔다(db를 첫 인자로 받음). 사용자 입력은 SQL 글자에 이어 붙이지 않고 `?`로 넘긴다. 검색어의 `%`, `_`, `\`는 `escapeLike`로 처리한다.
- 여러 줄을 함께 바꾸는 저장(카드+태그, 복습 평가)은 `withTransaction`으로 묶는다.
- 복습 규칙(상자 이동, 간격 1·2·4·8·16일, 하루 상한, 서울 자정 경계)은 `src/lib/review.ts`에만 둔다. 날짜는 `today` 인자로 받아 테스트에서 고정한다. 평가 저장은 멱등(이미 처리된 카드는 무시)으로 유지한다.
- 타이머는 `src/lib/timer.ts`에만 둔다. 남은 시간은 저장한 시작 시각과 `now`의 차이로 계산하고(`setInterval` 숫자를 믿지 않음) 모든 함수가 `now`를 인자로 받는다. 설정 값은 `src/lib/settings.ts`의 `SETTING_RULES` 범위로 검사한다. 화면의 `useEffect` 안에서 바로 `setState`를 부르지 않는다(린트 규칙): 브라우저 값은 `useSyncExternalStore`로 읽는다.
- 화면 패턴: 페이지는 바깥에서 `Suspense`로 감싸고, 안쪽 async 컴포넌트에서 `await connection()` → `await params/searchParams` → DB 읽기. 폼은 Server Action(`src/app/cards/actions.ts`) + `useActionState`, 성공하면 `revalidatePath` 후 `redirect`(try 밖에서).
- SQLite 라이브러리: **Node 내장 `node:sqlite`로 확정**. 코드는 `src/lib/db/`에 있다.
- DB 접근은 `getDb()`(앱), `openAndMigrate(file)`(스크립트/테스트)만 쓴다. 서버 페이지에서 DB를 읽기 전에 `await connection()`(next/server)을 부른다. 이 Next.js는 Cache Components가 켜져 있어 이걸 빼면 DB 값이 미리 만들어진 화면에 굳을 수 있다.
- `scripts/*.ts`, `tests/*.ts`는 Node가 직접 실행한다(`.ts` 확장자 import, `enum` 등 변환이 필요한 문법 금지).
- 테스트·검증 땐 항상 `RECALLNOTE_DB_PATH`를 임시 파일로 지정하고, 검증 빌드는 `RECALLNOTE_DIST_DIR=.next-verify`, 포트 3100을 쓴다.
- 이 프로젝트의 Next.js 버전은 기존 지식과 다를 수 있다. 코드를 쓰기 전 `node_modules/next/dist/docs/`의 관련 문서를 확인한다(AGENTS.md).

## 백업(가져오기) 안전 규칙
- 백업 코드는 `src/lib/backup/`에만 둔다. 가져오기는 **전체 교체**만 지원하고, 반드시 ① `parseBackup`으로 엄격 검사 ② 바꾸기 직전 **안전 백업 저장**(실패하면 중단) ③ `withTransaction`으로 지우고 넣기 순서를 지킨다. 안전 백업을 끄는 옵션을 만들지 않는다.
- 백업 라우트(`/backup/*`)는 `checkLocalRequest`(Host·Origin 검사)를 거치고, 쓰기 요청은 `x-recallnote: 1` 헤더를 요구한다. GET 라우트는 `await connection()`을 먼저 부른다.
- 새 열·표를 추가하는 마이그레이션을 만들면 같은 작업에서 `format.ts`, `export.ts`, `validate.ts`, `import.ts`와 백업 테스트를 함께 고치고 `BACKUP_VERSION`을 올릴지 정한다(옛 파일을 계속 읽을 수 있게 `SUPPORTED_VERSIONS`에 남긴다). 지금 버전은 2(학습 기록 표식 포함)다.
- 테스트와 검증은 임시 DB·임시 폴더만 쓴다. 가져오기 테스트가 진짜 `data/`나 `data/backups/`에 쓰지 않게 `snapshotDir`을 항상 임시 폴더로 넘긴다.

## 학습 기록 가져오기 규칙
- 코드는 `src/lib/learning-log/`(parse·read·sync·api)와 `src/app/learn/`에 있다. `~/learning-log/confusions.md`는 **읽기만** 하고 앱이 절대 수정하지 않는다(그 파일 하나만, 바로가기 거부, 2MB 제한).
- 카드는 반드시 `importRows`로 만든다: 서버가 파일(또는 글)을 **다시 읽어** 사용자가 고른 표식과 맞는 줄만 처리하고, `learning_sources`에 표식을 남기며, 한 트랜잭션으로 실행한다. 화면이 보낸 질문·답은 쓰지 않는다.
- 표식 계산식(날짜+프로젝트+주제+몰랐던 점)을 바꾸면 기존 표식과 어긋나 같은 줄이 다시 후보가 되므로 바꾸지 않는다. 바꿔야 하면 마이그레이션과 호환 계획을 먼저 보고한다.
- 표 형식(열 이름)은 전역 규칙 `~/.claude/CLAUDE.md`의 학습 기록 형식과 맞춘다. 테스트는 임시 파일(`RECALLNOTE_LEARNING_LOG`)과 임시 DB만 쓴다.

## 자동 백업 규칙
- 로직은 `src/lib/backup/auto.ts`, 실행은 `scripts/auto-backup.ts`다. DB는 **읽기 전용**으로만 열고, 7일 규칙·최근 8개 정리·경로 검증(날짜 폴더 이름만, 바로가기 제외)·지우기 전 로그를 바꾸면 `tests/auto-backup.test.ts`도 함께 고친다.
- launchd 예약(`com.paul.recallnote-auto-backup`)의 설치·제거는 **사용자가 직접** `scripts/install-auto-backup.sh`, `scripts/uninstall-auto-backup.sh`로 실행한다. 이 환경은 예약 등록을 권한 검사에서 막을 수 있으니, 막히면 우회하지 말고 사용자에게 알린다.

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
- Pretendard는 `public/fonts/`의 파일을 쓴다(외부 서버에서 받지 않음, 라이선스 파일 유지). 기본 16px 이상, 줄 간격 넉넉하게. 글자 크기는 `/settings`(14~24px)에서 조절하고 DB가 기준이며, 첫 화면 깜빡임 방지용 `<head>` 스크립트(localStorage `rn-font-size`)가 있다.
- `dangerouslySetInnerHTML`은 이 `<head>`의 **고정된 글자 스크립트 한 곳만** 예외이고, 사용자 입력은 절대 넣지 않는다.
- 숫자는 `tabular-nums`. 애니메이션 최소, `prefers-reduced-motion`을 따른다.
- 복습 키보드: Space 답 보기, 1/2/3 평가.
