import { connection } from "next/server";
import { getDb } from "@/lib/db/connection.ts";
import { buildBackup } from "@/lib/backup/export.ts";
import { seoulStamp } from "@/lib/backup/format.ts";
import { checkLocalRequest } from "@/lib/local-guard.ts";

/** 전체 데이터를 JSON 한 파일로 내려받는다. DB는 읽기만 한다. */
export async function GET(request: Request) {
  await connection(); // 요청마다 실행 (미리 만들어 둔 파일을 주지 않는다)
  const blocked = checkLocalRequest(request);
  if (blocked) return new Response(blocked, { status: 403 });

  const now = new Date();
  const body = `${JSON.stringify(buildBackup(getDb(), now), null, 2)}\n`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="recallnote-backup-${seoulStamp(now).slice(0, 13)}.json"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
