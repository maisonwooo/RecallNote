// /learn 화면과 길(route)이 함께 쓰는 도우미: 글(파일 또는 붙여넣기)을 읽어 화면용 값으로 바꾼다.
import type { DatabaseSync } from "node:sqlite";
import { MAX_LOG_BYTES, parseLearningLog, type ParsedLog, type ParsedRow } from "./parse.ts";
import { displayPath, readLearningLog } from "./read.ts";
import { buildSyncOverview } from "./sync.ts";

export type ClientRow = { key: string; line: number; date: string; project: string; topic: string; question: string; answer: string };
export type ClientOverview = {
  source: "file" | "paste";
  path: string | null; // 파일일 때만 (~ 로 줄인 모양)
  total: number;
  imported: number;
  fresh: ClientRow[];
  skipped: ClientRow[];
  notReady: { line: number; topic: string; reason: string }[];
  problems: string[];
};

export type LoadedLog = { ok: true; log: ParsedLog; source: "file" | "paste"; path: string | null } | { ok: false; error: string };

/** text 가 글이면 붙여넣은 글을, 없으면(undefined/null) 학습 기록 파일을 읽어서 표를 해석한다. */
export function loadLog(text?: unknown): LoadedLog {
  if (typeof text === "string") {
    if (text.trim() === "") return { ok: false, error: "붙여넣은 글이 비어 있어요." };
    if (Buffer.byteLength(text, "utf8") > MAX_LOG_BYTES) return { ok: false, error: `글이 너무 커요 (최대 ${MAX_LOG_BYTES / 1024 / 1024}MB).` };
    return { ok: true, log: parseLearningLog(text), source: "paste", path: null };
  }
  if (text !== undefined && text !== null) return { ok: false, error: "요청 모양이 맞지 않아요." };
  const file = readLearningLog();
  if (!file.ok) return { ok: false, error: file.reason };
  return { ok: true, log: parseLearningLog(file.text), source: "file", path: displayPath(file.path) };
}

const clientRow = (r: ParsedRow): ClientRow => ({ key: r.key, line: r.line, date: r.date, project: r.project, topic: r.topic, question: r.question, answer: r.answer });

export function toClientOverview(db: DatabaseSync, loaded: Extract<LoadedLog, { ok: true }>): ClientOverview {
  const o = buildSyncOverview(db, loaded.log);
  return {
    source: loaded.source,
    path: loaded.path,
    total: o.total,
    imported: o.imported,
    fresh: o.fresh.map(clientRow),
    skipped: o.skipped.map(clientRow),
    notReady: o.notReady.map((r) => ({ line: r.line, topic: r.topic, reason: r.reason ?? "" })),
    problems: o.problems,
  };
}

/** 홈 화면 알림용: 아직 처리 안 한 후보 개수. 파일이 없거나 읽을 수 없으면 0 (알림만 안 뜨고 화면은 정상). */
export function countFresh(db: DatabaseSync): number {
  try {
    const file = readLearningLog();
    if (!file.ok) return 0;
    return buildSyncOverview(db, parseLearningLog(file.text)).fresh.length;
  } catch {
    return 0;
  }
}
