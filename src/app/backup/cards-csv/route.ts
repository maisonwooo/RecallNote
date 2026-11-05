import { connection } from "next/server";
import { getDb } from "@/lib/db/connection.ts";
import { cardsToCsv } from "@/lib/backup/csv.ts";
import { buildBackup } from "@/lib/backup/export.ts";
import { seoulStamp } from "@/lib/backup/format.ts";
import { checkLocalRequest } from "@/lib/local-guard.ts";

/** 카드만 CSV로 내려받는다 (보관함 카드는 "보관함" 열에 표시). */
export async function GET(request: Request) {
  await connection();
  const blocked = checkLocalRequest(request);
  if (blocked) return new Response(blocked, { status: 403 });

  const now = new Date();
  return new Response(cardsToCsv(buildBackup(getDb(), now).cards), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="recallnote-cards-${seoulStamp(now).slice(0, 13)}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
