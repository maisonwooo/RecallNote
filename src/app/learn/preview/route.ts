import { getDb } from "@/lib/db/connection.ts";
import { readJsonBody } from "@/lib/json-body.ts";
import { loadLog, toClientOverview } from "@/lib/learning-log/api.ts";
import { checkLocalRequest } from "@/lib/local-guard.ts";

const NO_STORE = { "Cache-Control": "no-store" };

/** 후보 목록 보기: 파일(또는 붙여넣은 글)을 읽어서 후보·건너뜀·후보 아님을 알려 준다. DB는 읽기만 한다. */
export async function POST(request: Request) {
  const blocked = checkLocalRequest(request, { requireHeader: true });
  if (blocked) return Response.json({ ok: false, error: blocked }, { status: 403, headers: NO_STORE });
  const body = await readJsonBody(request);
  if (!body.ok) return Response.json({ ok: false, error: body.message }, { status: body.status, headers: NO_STORE });

  const loaded = loadLog(body.value.text);
  if (!loaded.ok) return Response.json({ ok: false, error: loaded.error }, { status: 422, headers: NO_STORE });
  return Response.json({ ok: true, overview: toClientOverview(getDb(), loaded) }, { headers: NO_STORE });
}
