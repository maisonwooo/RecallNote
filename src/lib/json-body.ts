export type JsonBody = { ok: true; value: Record<string, unknown> } | { ok: false; status: number; message: string };

/** 요청 본문을 크기 제한을 지키며 JSON 객체로 읽는다. 크거나 JSON이 아니면 거부한다. */
export async function readJsonBody(request: Request, maxBytes = 3 * 1024 * 1024): Promise<JsonBody> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, status: 413, message: "내용이 너무 커요." };
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) return { ok: false, status: 413, message: "내용이 너무 커요." };
  try {
    const value: unknown = JSON.parse(text === "" ? "{}" : text);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false, status: 400, message: "요청 모양이 맞지 않아요." };
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return { ok: false, status: 400, message: "요청을 읽지 못했어요." };
  }
}
