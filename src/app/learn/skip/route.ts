import { getDb } from "@/lib/db/connection.ts";
import { readJsonBody } from "@/lib/json-body.ts";
import { loadLog } from "@/lib/learning-log/api.ts";
import { skipRows, unskipRows } from "@/lib/learning-log/sync.ts";
import { checkLocalRequest } from "@/lib/local-guard.ts";

const NO_STORE = { "Cache-Control": "no-store" };

/** 고른 줄을 "카드로 안 만들기"로 표시하거나(undo 가 아니면), 그 표시를 되돌린다(undo: true). */
export async function POST(request: Request) {
  const blocked = checkLocalRequest(request, { requireHeader: true });
  if (blocked) return Response.json({ ok: false, error: blocked }, { status: 403, headers: NO_STORE });
  const body = await readJsonBody(request);
  if (!body.ok) return Response.json({ ok: false, error: body.message }, { status: body.status, headers: NO_STORE });
  const keys = body.value.keys;
  if (!Array.isArray(keys) || !keys.every((k) => typeof k === "string")) {
    return Response.json({ ok: false, error: "고른 줄 목록이 올바르지 않아요." }, { status: 400, headers: NO_STORE });
  }
  try {
    if (body.value.undo === true) return Response.json({ ok: true, changed: unskipRows(getDb(), keys as string[]) }, { headers: NO_STORE });
    const loaded = loadLog(body.value.text);
    if (!loaded.ok) return Response.json({ ok: false, error: loaded.error }, { status: 422, headers: NO_STORE });
    return Response.json({ ok: true, changed: skipRows(getDb(), loaded.log, keys as string[]) }, { headers: NO_STORE });
  } catch (error) {
    console.error("건너뛰기 실패", error);
    const tooMany = error instanceof Error && /개까지만/.test(error.message);
    return Response.json({ ok: false, error: tooMany ? (error as Error).message : "처리하지 못했어요." }, { status: tooMany ? 400 : 500, headers: NO_STORE });
  }
}
