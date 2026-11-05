// 밖에서 온 백업 파일을 엄격하게 검사한다. 하나라도 틀리면 통째로 거부한다.
// 규칙은 DB의 제약(CHECK, UNIQUE, 외래키)과 앱의 입력 제한을 그대로 따른다.
import { LIMITS } from "../card-input.ts";
import { SETTING_RULES } from "../settings.ts";
import {
  BACKUP_FORMAT, BACKUP_VERSION, MAX_BACKUP_BYTES, MAX_ROWS, SETTING_KEYS, SUPPORTED_VERSIONS,
  type BackupCard, type BackupData, type BackupLearningSource, type BackupReview, type BackupSession, type BackupTag, type Counts,
} from "./format.ts";

export type ParseResult = { ok: true; data: BackupData } | { ok: false; errors: string[] };

const MAX_ERRORS = 20;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const validIso = (v: unknown): v is string => typeof v === "string" && ISO.test(v) && !Number.isNaN(Date.parse(v));
const validDate = (v: unknown): v is string =>
  typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/** 오류 문구에 넣을 값은 짧게 줄인다(큰 글이 화면을 채우지 않게). */
function show(v: unknown): string {
  const text = typeof v === "string" ? JSON.stringify(v) : String(JSON.stringify(v) ?? v);
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

export function parseBackup(text: string): ParseResult {
  if (Buffer.byteLength(text, "utf8") > MAX_BACKUP_BYTES) {
    return { ok: false, errors: [`파일이 너무 커요 (최대 ${MAX_BACKUP_BYTES / 1024 / 1024}MB).`] };
  }
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["JSON 파일이 아니거나 내용이 깨져 있어요."] };
  }
  if (!isObj(root)) return { ok: false, errors: ["백업 파일의 모양이 아니에요."] };
  if (root.format !== BACKUP_FORMAT) return { ok: false, errors: ["RecallNote 백업 파일이 아니에요."] };
  if (isInt(root.version) && root.version > BACKUP_VERSION) {
    return { ok: false, errors: ["더 새로운 버전의 앱에서 만든 백업 파일이에요. 앱을 먼저 업데이트해 주세요."] };
  }
  if (!(SUPPORTED_VERSIONS as readonly unknown[]).includes(root.version)) return { ok: false, errors: ["지원하지 않는 백업 파일 버전이에요."] };
  const fileVersion = root.version as number;

  const errors: string[] = [];
  const err = (path: string, message: string) => {
    if (errors.length < MAX_ERRORS) errors.push(`${path}: ${message}`);
  };
  const tooMany = () => errors.length >= MAX_ERRORS;

  if (!validIso(root.exportedAt)) err("exportedAt", "시각 모양이 아니에요.");

  // 버전 2부터 learningSources 목록이 필수다 (버전 1 파일에는 없다)
  const arrays = (fileVersion >= 2 ? ["tags", "cards", "reviews", "studySessions", "learningSources"] : ["tags", "cards", "reviews", "studySessions"]) as readonly (keyof typeof MAX_ROWS)[];
  for (const key of arrays) {
    if (!Array.isArray(root[key])) err(key, "목록이어야 해요.");
    else if ((root[key] as unknown[]).length > MAX_ROWS[key]) err(key, `항목이 너무 많아요 (최대 ${MAX_ROWS[key]}개).`);
  }
  if (!isObj(root.settings)) err("settings", "객체여야 해요.");
  if (errors.length > 0) return { ok: false, errors };

  // ---- 설정 ----
  const settings: Record<string, string> = {};
  for (const [key, value] of Object.entries(root.settings as Obj)) {
    if (!(SETTING_KEYS as readonly string[]).includes(key)) {
      err(`settings.${key}`, "알 수 없는 설정 이름이에요.");
      continue;
    }
    const rule = SETTING_RULES[key as keyof typeof SETTING_RULES];
    const n = typeof value === "string" && /^\d{1,4}$/.test(value) ? Number(value) : NaN;
    if (!(n >= rule.min && n <= rule.max)) err(`settings.${key}`, `${rule.min}~${rule.max} 사이의 숫자 글자여야 해요 (값: ${show(value)}).`);
    else settings[key] = String(n);
  }

  // ---- 태그 ----
  const tags: BackupTag[] = [];
  const tagKeys = new Set<string>();
  (root.tags as unknown[]).forEach((raw, i) => {
    if (tooMany()) return;
    const p = `tags[${i}]`;
    if (!isObj(raw)) return err(p, "객체여야 해요.");
    const name = raw.name;
    if (typeof name !== "string" || name.trim() === "" || name.length > LIMITS.tagLength || name !== name.trim()) {
      return err(`${p}.name`, `앞뒤 공백 없는 1~${LIMITS.tagLength}자 글자여야 해요 (값: ${show(name)}).`);
    }
    if (!validIso(raw.createdAt)) return err(`${p}.createdAt`, "시각 모양이 아니에요.");
    const key = name.toLowerCase();
    if (tagKeys.has(key)) return err(`${p}.name`, `같은 태그가 두 번 있어요 (대소문자 무시): ${show(name)}`);
    tagKeys.add(key);
    tags.push({ name, createdAt: raw.createdAt });
  });

  // ---- 카드 ----
  const cards: BackupCard[] = [];
  const cardIds = new Set<number>();
  (root.cards as unknown[]).forEach((raw, i) => {
    if (tooMany()) return;
    const p = `cards[${i}]`;
    if (!isObj(raw)) return err(p, "객체여야 해요.");
    if (!isInt(raw.id) || raw.id < 1) return err(`${p}.id`, `1 이상의 정수여야 해요 (값: ${show(raw.id)}).`);
    if (cardIds.has(raw.id)) return err(`${p}.id`, `번호 ${raw.id}가 두 번 나와요.`);
    cardIds.add(raw.id);
    if (raw.type !== "qa") return err(`${p}.type`, `지금은 "qa"만 쓸 수 있어요 (값: ${show(raw.type)}).`);
    const text = (field: "question" | "answer", max: number) => {
      const v = raw[field];
      if (typeof v !== "string" || v.trim() === "" || v.length > max) {
        err(`${p}.${field}`, `비어 있지 않은 ${max}자 이하의 글이어야 해요.`);
        return null;
      }
      return v;
    };
    const question = text("question", LIMITS.question);
    const answer = text("answer", LIMITS.answer);
    const source = raw.source;
    if (source !== null && (typeof source !== "string" || source.length > LIMITS.source)) {
      err(`${p}.source`, `비어 있거나(null) ${LIMITS.source}자 이하의 글이어야 해요.`);
    }
    if (!isInt(raw.box) || raw.box < 1 || raw.box > 5) err(`${p}.box`, `상자는 1~5 사이 정수여야 해요 (값: ${show(raw.box)}).`);
    if (!validDate(raw.dueDate)) err(`${p}.dueDate`, `날짜(YYYY-MM-DD)여야 해요 (값: ${show(raw.dueDate)}).`);
    if (!validIso(raw.createdAt)) err(`${p}.createdAt`, "시각 모양이 아니에요.");
    if (!validIso(raw.updatedAt)) err(`${p}.updatedAt`, "시각 모양이 아니에요.");
    if (raw.deletedAt !== null && !validIso(raw.deletedAt)) err(`${p}.deletedAt`, "비어 있거나(null) 시각이어야 해요.");

    let cardTags: string[] = [];
    if (!Array.isArray(raw.tags) || raw.tags.length > LIMITS.tags) {
      err(`${p}.tags`, `태그 목록(최대 ${LIMITS.tags}개)이어야 해요.`);
    } else {
      const seen = new Set<string>();
      for (const t of raw.tags) {
        if (typeof t !== "string" || !tagKeys.has(t.toLowerCase())) err(`${p}.tags`, `태그 목록(tags)에 없는 태그예요: ${show(t)}`);
        else if (seen.has(t.toLowerCase())) err(`${p}.tags`, `같은 태그가 두 번 붙어 있어요: ${show(t)}`);
        else seen.add(t.toLowerCase());
      }
      cardTags = raw.tags.filter((t): t is string => typeof t === "string");
    }
    if (question !== null && answer !== null) {
      cards.push({
        id: raw.id, type: "qa", question, answer,
        source: typeof source === "string" ? source : null,
        box: raw.box as number, dueDate: raw.dueDate as string,
        createdAt: raw.createdAt as string, updatedAt: raw.updatedAt as string,
        deletedAt: (raw.deletedAt as string | null) ?? null, tags: cardTags,
      });
    }
  });

  // ---- 복습 기록 ----
  const reviews: BackupReview[] = [];
  const reviewIds = new Set<number>();
  (root.reviews as unknown[]).forEach((raw, i) => {
    if (tooMany()) return;
    const p = `reviews[${i}]`;
    if (!isObj(raw)) return err(p, "객체여야 해요.");
    if (!isInt(raw.id) || raw.id < 1) return err(`${p}.id`, "1 이상의 정수여야 해요.");
    if (reviewIds.has(raw.id)) return err(`${p}.id`, `번호 ${raw.id}가 두 번 나와요.`);
    reviewIds.add(raw.id);
    if (!isInt(raw.cardId) || !cardIds.has(raw.cardId)) return err(`${p}.cardId`, `없는 카드를 가리켜요 (값: ${show(raw.cardId)}).`);
    if (raw.result !== "wrong" && raw.result !== "unsure" && raw.result !== "right") return err(`${p}.result`, `wrong/unsure/right 중 하나여야 해요 (값: ${show(raw.result)}).`);
    if (!isInt(raw.boxBefore) || raw.boxBefore < 1 || raw.boxBefore > 5) return err(`${p}.boxBefore`, "상자는 1~5 사이 정수여야 해요.");
    if (!isInt(raw.boxAfter) || raw.boxAfter < 1 || raw.boxAfter > 5) return err(`${p}.boxAfter`, "상자는 1~5 사이 정수여야 해요.");
    if (!validIso(raw.reviewedAt)) return err(`${p}.reviewedAt`, "시각 모양이 아니에요.");
    reviews.push({ id: raw.id, cardId: raw.cardId, result: raw.result, boxBefore: raw.boxBefore, boxAfter: raw.boxAfter, reviewedAt: raw.reviewedAt });
  });

  // ---- 타이머 기록 ----
  const sessions: BackupSession[] = [];
  const sessionIds = new Set<number>();
  let running = 0;
  (root.studySessions as unknown[]).forEach((raw, i) => {
    if (tooMany()) return;
    const p = `studySessions[${i}]`;
    if (!isObj(raw)) return err(p, "객체여야 해요.");
    if (!isInt(raw.id) || raw.id < 1) return err(`${p}.id`, "1 이상의 정수여야 해요.");
    if (sessionIds.has(raw.id)) return err(`${p}.id`, `번호 ${raw.id}가 두 번 나와요.`);
    sessionIds.add(raw.id);
    if (!validIso(raw.startedAt)) return err(`${p}.startedAt`, "시각 모양이 아니에요.");
    if (!isInt(raw.plannedMinutes) || raw.plannedMinutes < 1 || raw.plannedMinutes > 1440) return err(`${p}.plannedMinutes`, "1~1440 사이 정수여야 해요.");
    if (raw.status !== "running" && raw.status !== "completed" && raw.status !== "stopped") return err(`${p}.status`, `running/completed/stopped 중 하나여야 해요 (값: ${show(raw.status)}).`);
    if (raw.status === "running") {
      running += 1;
      if (raw.endedAt !== null) return err(`${p}.endedAt`, "진행 중(running)인 기록은 endedAt이 비어 있어야 해요.");
    } else if (!validIso(raw.endedAt)) {
      return err(`${p}.endedAt`, "끝난 기록은 endedAt이 시각이어야 해요.");
    }
    if (!isInt(raw.focusSeconds) || raw.focusSeconds < 0 || raw.focusSeconds > raw.plannedMinutes * 60) return err(`${p}.focusSeconds`, "0 이상, 계획한 시간 이하의 정수여야 해요.");
    sessions.push({
      id: raw.id, startedAt: raw.startedAt, plannedMinutes: raw.plannedMinutes,
      endedAt: raw.status === "running" ? null : (raw.endedAt as string), status: raw.status, focusSeconds: raw.focusSeconds,
    });
  });
  if (running > 1) err("studySessions", "진행 중(running)인 타이머 기록은 하나만 있을 수 있어요.");

  // ---- 학습 기록 표식 (버전 2) ----
  const learningSources: BackupLearningSource[] = [];
  const sourceKeys = new Set<string>();
  if (fileVersion >= 2) {
    (root.learningSources as unknown[]).forEach((raw, i) => {
      if (tooMany()) return;
      const p = `learningSources[${i}]`;
      if (!isObj(raw)) return err(p, "객체여야 해요.");
      if (typeof raw.key !== "string" || !/^[0-9a-f]{16}$/.test(raw.key)) return err(`${p}.key`, `소문자 16진수 16자리여야 해요 (값: ${show(raw.key)}).`);
      if (sourceKeys.has(raw.key)) return err(`${p}.key`, "같은 표식이 두 번 나와요.");
      sourceKeys.add(raw.key);
      if (raw.status !== "imported" && raw.status !== "skipped") return err(`${p}.status`, `imported/skipped 중 하나여야 해요 (값: ${show(raw.status)}).`);
      if (raw.cardId !== null && (!isInt(raw.cardId) || !cardIds.has(raw.cardId))) return err(`${p}.cardId`, `비어 있거나(null) 있는 카드를 가리켜야 해요 (값: ${show(raw.cardId)}).`);
      if (raw.status === "skipped" && raw.cardId !== null) return err(`${p}.cardId`, "건너뜀(skipped)에는 카드가 없어야 해요.");
      if (!validIso(raw.createdAt)) return err(`${p}.createdAt`, "시각 모양이 아니에요.");
      learningSources.push({ key: raw.key, status: raw.status, cardId: raw.cardId as number | null, createdAt: raw.createdAt });
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: root.exportedAt as string, settings, tags, cards, reviews, studySessions: sessions, learningSources },
  };
}

export function countBackup(data: BackupData): Counts {
  return {
    cards: data.cards.filter((c) => c.deletedAt === null).length,
    archived: data.cards.filter((c) => c.deletedAt !== null).length,
    tags: data.tags.length,
    reviews: data.reviews.length,
    sessions: data.studySessions.length,
  };
}
