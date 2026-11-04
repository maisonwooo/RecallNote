"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { MAX_BACKUP_BYTES, type Counts } from "@/lib/backup/format.ts";
import { formatSeoul } from "@/lib/format.ts";

type Preview = { exportedAt: string; current: Counts; incoming: Counts; currentIsNewer: boolean };
type PreviewResponse = { ok: true; preview: Preview } | { ok: false; errors: string[] };
type ImportResponse = { ok: true; snapshot: string; counts: Counts } | { ok: false; errors: string[] };

const HEADERS = { "x-recallnote": "1", "content-type": "text/plain;charset=UTF-8" };
const ROWS: { key: keyof Counts; label: string }[] = [
  { key: "cards", label: "카드" },
  { key: "archived", label: "보관함 카드" },
  { key: "tags", label: "태그" },
  { key: "reviews", label: "복습 기록" },
  { key: "sessions", label: "타이머 기록" },
];

type Phase = "idle" | "checking" | "preview" | "importing" | "done";

/** 가져오기: 파일 고르기 → 검사·미리보기 → 확인 → 바꾸기. 확인하기 전에는 아무것도 바뀌지 않는다. */
export function BackupImport() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [done, setDone] = useState<{ snapshot: string; counts: Counts } | null>(null);

  function reset() {
    setPhase("idle");
    setFileName("");
    setText("");
    setPreview(null);
    setErrors([]);
    setAgreed(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onPick(file: File | undefined) {
    if (!file) return;
    setErrors([]);
    setPreview(null);
    setAgreed(false);
    setFileName(file.name);
    if (file.size > MAX_BACKUP_BYTES) {
      setErrors([`파일이 너무 커요 (최대 ${MAX_BACKUP_BYTES / 1024 / 1024}MB).`]);
      return;
    }
    setPhase("checking");
    try {
      const content = await file.text();
      const response = await fetch("/backup/preview", { method: "POST", headers: HEADERS, body: content });
      const result = (await response.json()) as PreviewResponse;
      if (result.ok) {
        setText(content);
        setPreview(result.preview);
        setPhase("preview");
      } else {
        setErrors(result.errors);
        setPhase("idle");
      }
    } catch {
      setErrors(["파일을 확인하지 못했어요. 서버가 켜져 있는지 확인해 주세요."]);
      setPhase("idle");
    }
  }

  async function onImport() {
    if (!agreed || phase !== "preview") return;
    setPhase("importing");
    setErrors([]);
    try {
      const response = await fetch("/backup/import", {
        method: "POST",
        headers: { ...HEADERS, "x-recallnote-confirm": "replace-all" },
        body: text,
      });
      const result = (await response.json()) as ImportResponse;
      if (result.ok) {
        setDone({ snapshot: result.snapshot, counts: result.counts });
        setText("");
        setPhase("done");
        router.refresh();
      } else {
        setErrors(result.errors);
        setPhase("preview");
      }
    } catch {
      setErrors(["가져오기 도중 연결이 끊겼어요. 데이터가 바뀌었는지 카드 목록에서 확인해 주세요."]);
      setPhase("preview");
    }
  }

  if (phase === "done" && done) {
    return (
      <div className="panel" role="status">
        <p className="mb-2 text-lg font-semibold">가져오기를 마쳤어요</p>
        <p className="mb-4 text-muted">
          카드 {done.counts.cards}장 · 보관함 {done.counts.archived}장 · 복습 기록 {done.counts.reviews}건 · 타이머 기록{" "}
          {done.counts.sessions}건
        </p>
        <p className="mb-4 text-sm text-muted">
          바꾸기 직전의 데이터는 <code className="break-all">{done.snapshot}</code> 에 자동으로 저장해 뒀어요. 잘못 가져왔다면 그
          파일을 다시 가져오면 돌아갈 수 있어요.
        </p>
        <button type="button" onClick={reset} className="btn">
          확인
        </button>
      </div>
    );
  }

  return (
    <div className="panel">
      <label htmlFor="backup-file" className="mb-2 block font-medium">
        백업 파일 고르기 (.json)
      </label>
      <input
        ref={fileInput}
        id="backup-file"
        type="file"
        accept=".json,application/json"
        disabled={phase === "checking" || phase === "importing"}
        onChange={(event) => void onPick(event.target.files?.[0])}
        className="block w-full text-base"
      />
      {phase === "checking" && <p className="mt-4 text-muted">파일을 확인하는 중…</p>}

      {errors.length > 0 && (
        <div className="mt-4" role="alert">
          <p className="font-medium text-danger">
            {phase === "preview" ? "가져오지 못했어요" : `이 파일은 가져올 수 없어요${fileName ? ` (${fileName})` : ""}`}
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-danger">
            {errors.map((message, i) => (
              <li key={i} className="break-words">
                {message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview && (
        <div className="mt-6">
          <p className="mb-3 text-muted">
            {fileName} · 내보낸 때 {formatSeoul(preview.exportedAt)}
          </p>
          <table className="mb-4 w-full text-left">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="py-2 font-normal">항목</th>
                <th className="py-2 font-normal">지금</th>
                <th className="py-2 font-normal">가져온 뒤</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.key} className="border-b border-border">
                  <td className="py-2">{row.label}</td>
                  <td className="py-2 tabular-nums">{preview.current[row.key]}</td>
                  <td className="py-2 font-semibold tabular-nums">{preview.incoming[row.key]}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {preview.currentIsNewer && (
            <p className="mb-4 rounded-xl bg-danger-soft p-3 text-danger" role="alert">
              지금 데이터에는 이 백업을 만든 <strong>뒤에 한 활동</strong>(카드, 복습, 타이머)이 있어요. 가져오면 그 기록은 지금
              데이터에서 사라져요. (자동 안전 백업 파일에는 남아요.)
            </p>
          )}

          <p className="mb-3">
            지금 데이터가 이 파일 내용으로 <strong>완전히 바뀌어요.</strong> 바꾸기 직전에 지금 데이터를 자동으로 따로 저장해 둬요.
          </p>
          <label className="mb-4 flex items-start gap-3">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1.5 size-5" />
            <span>지금 데이터가 이 파일로 바뀐다는 것을 이해했어요.</span>
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={!agreed || phase !== "preview"} onClick={() => void onImport()} className="btn btn-primary">
              {phase === "importing" ? "바꾸는 중…" : "이 파일로 바꾸기"}
            </button>
            <button type="button" disabled={phase === "importing"} onClick={reset} className="btn">
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
