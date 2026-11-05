import { lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { MAX_LOG_BYTES } from "./parse.ts";

/** 읽을 파일 위치. 기본은 ~/learning-log/confusions.md. 테스트나 다른 위치는 RECALLNOTE_LEARNING_LOG 로 바꾼다. */
export function learningLogPath(): string {
  return process.env.RECALLNOTE_LEARNING_LOG ? resolve(process.env.RECALLNOTE_LEARNING_LOG) : join(homedir(), "learning-log", "confusions.md");
}

/** 화면에 보여줄 때는 집 폴더를 ~ 로 줄인다 */
export function displayPath(path: string): string {
  const home = homedir();
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

export type ReadResult = { ok: true; text: string; path: string } | { ok: false; reason: string };

/** 학습 기록 파일 하나를 읽기 전용으로 읽는다. 없거나, 바로가기(symlink)거나, 너무 크면 이유와 함께 거부한다. */
export function readLearningLog(path: string = learningLogPath()): ReadResult {
  let info;
  try {
    info = lstatSync(path);
  } catch {
    return { ok: false, reason: `파일을 찾지 못했어요: ${displayPath(path)}` };
  }
  if (info.isSymbolicLink()) return { ok: false, reason: "바로가기(symlink) 파일은 읽지 않아요." };
  if (!info.isFile()) return { ok: false, reason: "파일이 아니에요." };
  if (info.size > MAX_LOG_BYTES) return { ok: false, reason: `파일이 너무 커요 (최대 ${MAX_LOG_BYTES / 1024 / 1024}MB).` };
  try {
    return { ok: true, text: readFileSync(path, "utf8"), path };
  } catch {
    return { ok: false, reason: "파일을 읽지 못했어요." };
  }
}
