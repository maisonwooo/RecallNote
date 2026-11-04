import { getDb } from "@/lib/db/connection.ts";
import { checkLocalRequest } from "@/lib/backup/guard.ts";
import { buildPreview } from "@/lib/backup/import.ts";
import { readBackupText } from "@/lib/backup/request.ts";
import { parseBackup } from "@/lib/backup/validate.ts";

const NO_STORE = { "Cache-Control": "no-store" };

/** 가져오기 미리보기: 파일을 검사하고 현재와 가져올 개수를 비교해 알려 준다. DB는 바꾸지 않는다. */
export async function POST(request: Request) {
  const blocked = checkLocalRequest(request, { requireHeader: true });
  if (blocked) return Response.json({ ok: false, errors: [blocked] }, { status: 403, headers: NO_STORE });

  const body = await readBackupText(request);
  if (!body.ok) return Response.json({ ok: false, errors: [body.message] }, { status: body.status, headers: NO_STORE });

  const parsed = parseBackup(body.text);
  if (!parsed.ok) return Response.json({ ok: false, errors: parsed.errors }, { status: 422, headers: NO_STORE });

  return Response.json({ ok: true, preview: buildPreview(getDb(), parsed.data) }, { headers: NO_STORE });
}
