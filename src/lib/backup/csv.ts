import type { BackupCard } from "./format.ts";

/**
 * CSV 한 칸을 안전하게 만든다.
 * - 엑셀이 =, +, -, @ 로 시작하는 칸을 수식으로 실행할 수 있어서(CSV 주입), 앞에 ' 를 붙여 막는다.
 * - 쉼표·따옴표·줄바꿈이 있으면 큰따옴표로 감싸고, 안의 큰따옴표는 두 번 쓴다.
 */
export function csvCell(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const HEADER = ["번호", "질문", "답", "출처", "태그", "상자", "복습 예정일", "만든 때(KST)", "고친 때(KST)", "보관함"];

function seoul(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : new Date(ms + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
}

/** 카드 목록을 CSV 글로 만든다. 맨 앞의 BOM(﻿)은 엑셀이 한글을 안 깨뜨리게 하는 UTF-8 표시다. */
export function cardsToCsv(cards: BackupCard[]): string {
  const lines = [HEADER.map(csvCell).join(",")];
  for (const c of cards) {
    lines.push(
      [c.id, c.question, c.answer, c.source, c.tags.join("; "), c.box, c.dueDate, seoul(c.createdAt), seoul(c.updatedAt), c.deletedAt ? "예" : ""]
        .map((v) => csvCell(v as string | number | null))
        .join(","),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}
