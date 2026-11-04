import { dirname, join } from "node:path";
import { getDb, resolveDbPath } from "@/lib/db/connection.ts";
import { checkLocalRequest } from "@/lib/backup/guard.ts";
import { applyBackup } from "@/lib/backup/import.ts";
import { readBackupText } from "@/lib/backup/request.ts";
import { parseBackup } from "@/lib/backup/validate.ts";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * 가져오기 확정: 현재 데이터를 파일 내용으로 통째로 바꾼다.
 * 미리보기를 믿지 않고 여기서 파일을 다시 검사하고, 바꾸기 직전에 안전 백업을 data/backups/ 에 저장한다.
 */
export async function POST(request: Request) {
  const blocked = checkLocalRequest(request, { requireHeader: true });
  if (blocked) return Response.json({ ok: false, errors: [blocked] }, { status: 403, headers: NO_STORE });
  if (request.headers.get("x-recallnote-confirm") !== "replace-all") {
    return Response.json({ ok: false, errors: ["확인이 빠졌어요."] }, { status: 400, headers: NO_STORE });
  }

  const body = await readBackupText(request);
  if (!body.ok) return Response.json({ ok: false, errors: [body.message] }, { status: body.status, headers: NO_STORE });

  const parsed = parseBackup(body.text);
  if (!parsed.ok) return Response.json({ ok: false, errors: parsed.errors }, { status: 422, headers: NO_STORE });

  try {
    const dbFile = resolveDbPath();
    const snapshotDir = join(dirname(dbFile), "backups");
    const result = applyBackup(getDb(), parsed.data, { snapshotDir });
    // 화면에는 전체 경로 대신 프로젝트 기준 위치만 보여 준다
    const snapshot = `${snapshotDir.split("/").slice(-2).join("/")}/${result.snapshotPath.split("/").pop()}`;
    return Response.json({ ok: true, snapshot, counts: result.counts }, { headers: NO_STORE });
  } catch (error) {
    console.error("가져오기 실패", error); // 서버 터미널에만 남는다
    return Response.json(
      { ok: false, errors: ["가져오지 못했어요. 데이터는 바뀌지 않았어요. 서버 터미널의 오류를 확인해 주세요."] },
      { status: 500, headers: NO_STORE },
    );
  }
}
