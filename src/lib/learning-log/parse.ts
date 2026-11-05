// 학습 기록(confusions.md)의 표를 읽어 "카드 후보"로 바꾼다. 파일이 아니라 글만 다루므로 테스트하기 쉽다.
// 열은 이름(머리글)으로 찾아서, 열 순서가 바뀌어도 읽힌다. 이 모듈은 아무것도 쓰거나 바꾸지 않는다.
import { createHash } from "node:crypto";
import { LIMITS, type CardInput } from "../card-input.ts";

export const MAX_LOG_BYTES = 2 * 1024 * 1024;
export const MAX_LOG_ROWS = 5000;

export type LogRow = {
  key: string; // 16자리 표식. 날짜+프로젝트+주제+몰랐던 점이 같으면 같은 줄이다
  line: number; // 파일의 몇 번째 줄인지 (1부터)
  date: string;
  project: string;
  topic: string;
  notKnown: string;
  question: string;
  answer: string;
};
export type ParsedRow = LogRow & { ready: boolean; reason: string | null };
export type ParsedLog = { rows: ParsedRow[]; problems: string[] };

const COLUMNS = {
  date: "날짜",
  project: "프로젝트",
  topic: "주제",
  notKnown: "몰랐던 점",
  question: "카드 질문",
  answer: "내가 이해한 한 줄",
} as const;

/** 표의 한 줄을 칸으로 나눈다. 칸 안의 \| 는 | 글자 하나로 읽는다. 표 줄이 아니면 null. */
function splitRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;
  let body = trimmed.slice(1);
  if (body.endsWith("|") && !body.endsWith("\\|")) body = body.slice(0, -1);
  return body.split(/(?<!\\)\|/).map((cell) => cell.replaceAll("\\|", "|").trim());
}

const isSeparator = (cells: string[]) => cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));

export function makeKey(date: string, project: string, topic: string, notKnown: string): string {
  return createHash("sha256").update([date, project, topic, notKnown].join("\u0000")).digest("hex").slice(0, 16);
}

export function parseLearningLog(text: string): ParsedLog {
  if (Buffer.byteLength(text, "utf8") > MAX_LOG_BYTES) {
    return { rows: [], problems: [`파일이 너무 커요 (최대 ${MAX_LOG_BYTES / 1024 / 1024}MB).`] };
  }
  const lines = text.split(/\r?\n/);

  // 머리글: '몰랐던 점'과 '내가 이해한 한 줄'이 들어 있는 표 줄
  let headerAt = -1;
  let header: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (cells && cells.includes(COLUMNS.notKnown) && cells.includes(COLUMNS.answer)) {
      headerAt = i;
      header = cells;
      break;
    }
  }
  if (headerAt < 0) return { rows: [], problems: ["학습 기록 표의 머리글을 찾지 못했어요."] };
  const index = {} as Record<keyof typeof COLUMNS, number>;
  const missing: string[] = [];
  for (const [field, name] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, string][]) {
    index[field] = header.indexOf(name);
    if (index[field] < 0) missing.push(name);
  }
  if (missing.length > 0) return { rows: [], problems: [`표에 필요한 열이 없어요: ${missing.join(", ")}`] };

  const rows: ParsedRow[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  let dataRows = 0;
  for (let i = headerAt + 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (!cells || isSeparator(cells)) continue;
    if (++dataRows > MAX_LOG_ROWS) {
      problems.push(`줄이 너무 많아서 ${MAX_LOG_ROWS}줄까지만 읽었어요.`);
      break;
    }
    const line = i + 1;
    if (cells.length !== header.length) {
      problems.push(`${line}번째 줄: 칸 수가 머리글과 달라요 (${cells.length}칸, 머리글은 ${header.length}칸).`);
      continue;
    }
    const get = (field: keyof typeof COLUMNS) => cells[index[field]];
    const date = get("date");
    const project = get("project");
    const topic = get("topic");
    const notKnown = get("notKnown");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !project || !topic || !notKnown) {
      problems.push(`${line}번째 줄: 날짜·프로젝트·주제·몰랐던 점 중 비었거나 모양이 틀린 칸이 있어요.`);
      continue;
    }
    const question = get("question");
    const answer = get("answer");
    const key = makeKey(date, project, topic, notKnown);

    let reason: string | null = null;
    if (seen.has(key)) reason = "같은 줄이 위에도 있어요 (위쪽 줄만 쓰여요)";
    else if (question === "") reason = "카드 질문이 비어 있어요";
    else if (answer === "") reason = "아직 이해한 한 줄이 없어요 (모르는 항목)";
    else if (question.length > LIMITS.question) reason = `카드 질문이 ${LIMITS.question}자를 넘어요`;
    else if (answer.length > LIMITS.answer) reason = `이해한 한 줄이 ${LIMITS.answer}자를 넘어요`;
    seen.add(key);
    rows.push({ key, line, date, project, topic, notKnown, question, answer, ready: reason === null, reason });
  }
  return { rows, problems };
}

/** 이름 하나를 태그로 쓸 수 있게 다듬는다. 쓸 수 없으면 null. */
function tagName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim().replace(/^#+/, "").trim();
  return name !== "" && name.length <= LIMITS.tagLength ? name : null;
}

/** 후보 한 줄을 카드 입력값으로 바꾼다. 태그는 프로젝트와 주제, 출처는 "학습 기록 날짜". */
export function toCardInput(row: LogRow): CardInput {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of [row.project, row.topic]) {
    const name = tagName(raw);
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      tags.push(name);
    }
  }
  return { question: row.question, answer: row.answer, source: `학습 기록 ${row.date}`, tags };
}
