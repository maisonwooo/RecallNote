import { getDb } from "@/lib/db/connection.ts";
import { readJsonBody } from "@/lib/json-body.ts";
import { loadLog } from "@/lib/learning-log/api.ts";
import { importRows } from "@/lib/learning-log/sync.ts";
import { checkLocalRequest } from "@/lib/local-guard.ts";

const NO_STORE = { "Cache-Control": "no-store" };

/** 고른 줄을 카드로 만든다. 화면이 보낸 표식만 받고, 내용은 파일(또는 글)에서 서버가 다시 읽는다. */
export async function POST(request: Request) {
  const blocked = checkLocalRequest(request, { requireHeader: true });
  if (blocked) return Response.json({ ok: false, error: blocked }, { status: 403, headers: NO_STORE });
  const body = await readJsonBody(request);
  if (!body.ok) return Response.json({ ok: false, error: body.message }, { status: body.status, headers: NO_STORE });
  const keys = body.value.keys;
  if (!Array.isArray(keys) || !keys.every((k) => typeof k === "string")) {
    return Response.json({ ok: false, error: "고른 줄 목록이 올바르지 않아요." }, { status: 400, headers: NO_STORE });
  }

  const loaded = loadLog(body.value.text);
  if (!loaded.ok) return Response.json({ ok: false, error: loaded.error }, { status: 422, headers: NO_STORE });
  try {
    const result = importRows(getDb(), loaded.log, keys as string[]);
    return Response.json({ ok: true, created: result.created, ignored: result.ignored.length }, { headers: NO_STORE });
  } catch (error) {
    console.error("학습 기록 가져오기 실패", error); // 서버 터미널에만 남는다
    const tooMany = error instanceof Error && /개까지만/.test(error.message);
    return Response.json(
      { ok: false, error: tooMany ? (error as Error).message : "카드를 만들지 못했어요. 아무것도 바뀌지 않았어요." },
      { status: tooMany ? 400 : 500, headers: NO_STORE },
    );
  }
}
