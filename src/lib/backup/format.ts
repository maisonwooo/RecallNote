// 백업 파일의 형식(모양)과 제한. 파일 형식 번호(version)가 있어야 앱이 바뀌어도 옛 파일을 읽을 수 있다.

export const BACKUP_FORMAT = "recallnote-backup" as const;
export const BACKUP_VERSION = 2 as const;
/** 읽을 수 있는 파일 형식 번호들 (옛 번호도 계속 읽는다). 1: 처음 형식, 2: 학습 기록 가져오기 표식(learningSources) 추가 */
export const SUPPORTED_VERSIONS = [1, 2] as const;

/** 백업 파일 최대 크기 (바이트) */
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

/** 항목 수 제한 (이상한 파일이 컴퓨터를 느리게 만들지 못하게) */
export const MAX_ROWS = { cards: 100_000, tags: 10_000, reviews: 1_000_000, studySessions: 100_000, learningSources: 100_000 } as const;

/** 백업에 담을 수 있는 설정 이름. 이 밖의 이름은 거부한다. */
export const SETTING_KEYS = ["daily_review_limit", "focus_minutes", "break_minutes", "font_size"] as const;

export type BackupTag = { name: string; createdAt: string };

export type BackupCard = {
  id: number;
  type: "qa";
  question: string;
  answer: string;
  source: string | null;
  box: number;
  dueDate: string; // 서울 날짜 YYYY-MM-DD
  createdAt: string; // UTC ISO
  updatedAt: string;
  deletedAt: string | null; // 값이 있으면 보관함
  tags: string[]; // 태그 이름들
};

export type BackupReview = {
  id: number;
  cardId: number;
  result: "wrong" | "unsure" | "right";
  boxBefore: number;
  boxAfter: number;
  reviewedAt: string;
};

export type BackupSession = {
  id: number;
  startedAt: string;
  plannedMinutes: number;
  endedAt: string | null;
  status: "running" | "completed" | "stopped";
  focusSeconds: number;
};

export type BackupLearningSource = {
  key: string; // 16자리 소문자 16진수
  status: "imported" | "skipped";
  cardId: number | null;
  createdAt: string;
};

export type BackupData = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string; // UTC ISO
  settings: Record<string, string>;
  tags: BackupTag[];
  cards: BackupCard[];
  reviews: BackupReview[];
  studySessions: BackupSession[];
  learningSources: BackupLearningSource[]; // 버전 1 파일에는 없고, 읽을 때 빈 목록이 된다
};

export type Counts = { cards: number; archived: number; tags: number; reviews: number; sessions: number };

/** 서울 시각을 20261105-143012 모양으로 (파일 이름용) */
export function seoulStamp(now: Date): string {
  const text = new Date(now.getTime() + 9 * 3600_000).toISOString(); // 2026-11-05T14:30:12.345Z
  return `${text.slice(0, 10).replaceAll("-", "")}-${text.slice(11, 19).replaceAll(":", "")}`;
}
