import { MAX_BACKUP_BYTES } from "./format.ts";

export type BodyResult = { ok: true; text: string } | { ok: false; status: number; message: string };

/** 업로드된 백업 글을 읽는다. 너무 크거나 비어 있으면 거부한다. */
export async function readBackupText(request: Request): Promise<BodyResult> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BACKUP_BYTES) {
    return { ok: false, status: 413, message: `파일이 너무 커요 (최대 ${MAX_BACKUP_BYTES / 1024 / 1024}MB).` };
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BACKUP_BYTES) {
    return { ok: false, status: 413, message: `파일이 너무 커요 (최대 ${MAX_BACKUP_BYTES / 1024 / 1024}MB).` };
  }
  if (text.trim() === "") return { ok: false, status: 400, message: "빈 파일이에요." };
  return { ok: true, text };
}
