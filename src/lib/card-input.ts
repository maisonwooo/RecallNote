// 카드 입력 폼 값을 검사하고 정리한다. DB나 Next.js에 의존하지 않아서 테스트하기 쉽다.

export const LIMITS = {
  question: 500,
  answer: 5000,
  source: 200,
  tags: 10,
  tagLength: 30,
} as const;

/** 화면에 다시 채워 넣을 폼 값(전부 글자) */
export type CardFormValues = { question: string; answer: string; source: string; tags: string };
/** 검사를 통과해 DB에 넣을 수 있는 값 */
export type CardInput = { question: string; answer: string; source: string | null; tags: string[] };
export type CardErrors = Partial<Record<"question" | "answer" | "source" | "tags", string>>;
/** 서버 동작(Server Action)이 폼에 돌려주는 상태 */
export type CardFormState = { errors?: CardErrors; values?: CardFormValues; message?: string } | null;

export type ParseResult =
  | { ok: true; value: CardInput }
  | { ok: false; errors: CardErrors; values: CardFormValues };

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** 줄바꿈을 \n 으로 통일하고 앞뒤 공백만 지운다(글 안쪽의 줄바꿈·들여쓰기는 그대로). */
function cleanBlock(value: unknown): string {
  return asText(value).replace(/\r\n?/g, "\n").trim();
}

/** "보안, http ,Git" 같은 글을 태그 목록으로 바꾼다. 대소문자 다른 중복은 앞의 것만 남긴다. */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const piece of raw.split(/[,，、\n]/)) {
    const name = piece.replace(/\s+/g, " ").trim().replace(/^#+/, "").trim();
    if (name === "") continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

export function parseCardInput(raw: {
  question?: unknown;
  answer?: unknown;
  source?: unknown;
  tags?: unknown;
}): ParseResult {
  const question = cleanBlock(raw.question);
  const answer = cleanBlock(raw.answer);
  const source = cleanBlock(raw.source).replace(/\s*\n\s*/g, " ");
  const tagsText = asText(raw.tags).replace(/\r\n?/g, "\n").trim();
  const tags = parseTags(tagsText);

  const errors: CardErrors = {};
  if (question === "") errors.question = "질문을 입력해 주세요.";
  else if (question.length > LIMITS.question) errors.question = `질문은 ${LIMITS.question}자까지 쓸 수 있어요.`;

  if (answer === "") errors.answer = "답을 입력해 주세요.";
  else if (answer.length > LIMITS.answer) errors.answer = `답은 ${LIMITS.answer}자까지 쓸 수 있어요.`;

  if (source.length > LIMITS.source) errors.source = `출처는 ${LIMITS.source}자까지 쓸 수 있어요.`;

  if (tags.length > LIMITS.tags) errors.tags = `태그는 ${LIMITS.tags}개까지 붙일 수 있어요.`;
  else if (tags.some((tag) => tag.length > LIMITS.tagLength))
    errors.tags = `태그 하나는 ${LIMITS.tagLength}자까지 쓸 수 있어요.`;

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      errors,
      values: { question: asText(raw.question), answer: asText(raw.answer), source: asText(raw.source), tags: tagsText },
    };
  }
  return { ok: true, value: { question, answer, source: source === "" ? null : source, tags } };
}
