"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ClientOverview, ClientRow } from "@/lib/learning-log/api.ts";

type Props = { initial: ClientOverview | null; initialError: string | null };
type Reply = { ok: true; overview?: ClientOverview; created?: number; ignored?: number; changed?: number } | { ok: false; error: string };

const HEADERS = { "x-recallnote": "1", "content-type": "application/json" };

/** 학습 기록 후보를 보고, 체크한 것만 카드로 만든다. 확인하기 전에는 아무 카드도 만들어지지 않는다. */
export function LearnPanel({ initial, initialError }: Props) {
  const router = useRouter();
  const [overview, setOverview] = useState<ClientOverview | null>(initial);
  const [error, setError] = useState<string | null>(initialError);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(initial?.fresh.map((r) => r.key) ?? []));
  const [pasteText, setPasteText] = useState("");
  const [busy, setBusy] = useState(false);

  // 붙여넣은 글을 보고 있을 때는, 카드를 만들 때도 같은 글을 서버에 다시 보낸다(서버가 다시 읽어서 처리)
  const pasteMode = overview?.source === "paste";
  const textField = pasteMode ? { text: pasteText } : {};

  async function call(path: string, body: Record<string, unknown>): Promise<Reply> {
    try {
      const response = await fetch(path, { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
      return (await response.json()) as Reply;
    } catch {
      return { ok: false, error: "서버와 연결이 끊겼어요. 서버가 켜져 있는지 확인해 주세요." };
    }
  }

  function applyOverview(next: ClientOverview) {
    setOverview(next);
    setSelected(new Set(next.fresh.map((r) => r.key)));
  }

  async function load(text?: string) {
    setBusy(true);
    setError(null);
    const reply = await call("/learn/preview", text === undefined ? {} : { text });
    setBusy(false);
    if (reply.ok && reply.overview) applyOverview(reply.overview);
    else if (!reply.ok) setError(reply.error);
  }

  async function refreshAfterChange(text: string | undefined) {
    const reply = await call("/learn/preview", text === undefined ? {} : { text });
    if (reply.ok && reply.overview) applyOverview(reply.overview);
    router.refresh(); // 홈의 알림 개수도 새로 읽게 한다
  }

  async function importSelected() {
    if (busy || selected.size === 0) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const reply = await call("/learn/import", { keys: [...selected], ...textField });
    if (reply.ok) {
      setMessage(`카드 ${reply.created ?? 0}장을 만들었어요.${reply.ignored ? ` (이미 처리했거나 읽을 수 없는 ${reply.ignored}개는 건너뛰었어요)` : ""}`);
      await refreshAfterChange(pasteMode ? pasteText : undefined);
    } else setError(reply.error);
    setBusy(false);
  }

  async function skipSelected() {
    if (busy || selected.size === 0) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const reply = await call("/learn/skip", { keys: [...selected], ...textField });
    if (reply.ok) {
      setMessage(`${reply.changed ?? 0}개를 건너뛰기로 표시했어요. 아래 "건너뛴 줄"에서 되돌릴 수 있어요.`);
      await refreshAfterChange(pasteMode ? pasteText : undefined);
    } else setError(reply.error);
    setBusy(false);
  }

  async function undoSkip(keys: string[]) {
    if (busy || keys.length === 0) return;
    setBusy(true);
    setError(null);
    const reply = await call("/learn/skip", { keys, undo: true });
    if (reply.ok) {
      setMessage(`${reply.changed ?? 0}개를 다시 후보로 돌렸어요.`);
      await refreshAfterChange(pasteMode ? pasteText : undefined);
    } else setError(reply.error);
    setBusy(false);
  }

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  }

  const fresh = overview?.fresh ?? [];
  const allChecked = fresh.length > 0 && fresh.every((r) => selected.has(r.key));

  return (
    <div className="space-y-8">
      {error && (
        <p className="panel text-danger" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="panel" role="status">
          {message} <Link href="/cards" className="text-link">카드 목록 보기</Link>
        </p>
      )}

      {overview && (
        <section aria-label="후보 목록">
          <p className="mb-1 text-muted">
            {overview.source === "file" ? (
              <>
                읽은 파일: <code className="break-all">{overview.path}</code>
              </>
            ) : (
              "붙여넣은 글을 보고 있어요."
            )}
          </p>
          <p className="mb-4 text-muted">
            읽은 줄 <span className="tabular-nums">{overview.total}</span>개 · 후보 <span className="tabular-nums">{fresh.length}</span>개 · 이미 카드{" "}
            <span className="tabular-nums">{overview.imported}</span>개 · 건너뜀 <span className="tabular-nums">{overview.skipped.length}</span>개 · 후보 아님{" "}
            <span className="tabular-nums">{overview.notReady.length}</span>개
          </p>

          {fresh.length === 0 ? (
            <div className="panel text-muted">새로 카드로 만들 줄이 없어요. 학습 기록을 쌓으면 여기에 나타나요.</div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={() => setSelected(allChecked ? new Set() : new Set(fresh.map((r) => r.key)))}
                    className="size-5"
                  />
                  <span>전체 선택</span>
                </label>
                <span className="text-muted">
                  <span className="tabular-nums">{selected.size}</span>개 선택
                </span>
              </div>
              <ul className="space-y-3">
                {fresh.map((row) => (
                  <li key={row.key} className="panel">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input type="checkbox" checked={selected.has(row.key)} onChange={() => toggle(row.key)} className="mt-1.5 size-5 shrink-0" />
                      <span className="min-w-0">
                        <span className="block whitespace-pre-wrap break-words font-medium">{row.question}</span>
                        <span className="mt-1 block whitespace-pre-wrap break-words text-muted">{row.answer}</span>
                        {row.context && <span className="mt-1 block break-words text-sm text-muted">출처: {row.context}</span>}
                        <span className="mt-2 flex flex-wrap gap-2 text-sm text-muted">
                          <span>{row.date}</span>
                          <span className="chip">{row.project}</span>
                          <span className="chip">{row.topic}</span>
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" disabled={busy || selected.size === 0} onClick={() => void importSelected()} className="btn btn-primary">
                  {busy ? "처리 중…" : `선택한 ${selected.size}개 카드로 만들기`}
                </button>
                <button type="button" disabled={busy || selected.size === 0} onClick={() => void skipSelected()} className="btn">
                  선택한 {selected.size}개 건너뛰기
                </button>
              </div>
            </>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" disabled={busy} onClick={() => void load(pasteMode ? pasteText : undefined)} className="btn">
              다시 불러오기
            </button>
            {pasteMode && (
              <button type="button" disabled={busy} onClick={() => void load()} className="btn">
                파일에서 읽기로 돌아가기
              </button>
            )}
          </div>
        </section>
      )}

      {overview && overview.problems.length > 0 && (
        <section>
          <h2 className="mb-2 font-medium">읽다가 건너뛴 줄</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {overview.problems.map((problem, i) => (
              <li key={i} className="break-words">
                {problem}
              </li>
            ))}
          </ul>
        </section>
      )}

      {overview && overview.notReady.length > 0 && (
        <details>
          <summary className="cursor-pointer">후보가 아닌 줄 {overview.notReady.length}개 (이유 보기)</summary>
          <ul className="mt-3 space-y-2 text-sm">
            {overview.notReady.map((row) => (
              <li key={`${row.line}-${row.topic}`} className="break-words">
                <span className="text-muted">{row.line}번째 줄 · </span>
                {row.topic} — <span className="text-muted">{row.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {overview && overview.skipped.length > 0 && (
        <details>
          <summary className="cursor-pointer">건너뛴 줄 {overview.skipped.length}개 (되돌리기)</summary>
          <ul className="mt-3 space-y-3">
            {overview.skipped.map((row: ClientRow) => (
              <li key={row.key} className="panel flex items-start justify-between gap-4">
                <span className="min-w-0 whitespace-pre-wrap break-words">{row.question}</span>
                <button type="button" disabled={busy} onClick={() => void undoSkip([row.key])} className="btn shrink-0">
                  되돌리기
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <details open={!overview}>
        <summary className="cursor-pointer">붙여넣어서 가져오기</summary>
        <div className="mt-3">
          <p className="mb-2 text-sm text-muted">학습 기록 표를 복사해서 붙여 넣으면 같은 방식으로 후보를 보여 줘요. 확인하기 전에는 아무 카드도 만들어지지 않아요.</p>
          <label htmlFor="paste" className="sr-only">
            학습 기록 표 붙여넣기
          </label>
          <textarea id="paste" rows={6} value={pasteText} onChange={(e) => setPasteText(e.target.value)} className="input" placeholder="| 날짜 | 프로젝트 | 주제 | 몰랐던 점 | 카드 질문 | 내가 이해한 한 줄 | 카드화 |" />
          <button type="button" disabled={busy || pasteText.trim() === ""} onClick={() => void load(pasteText)} className="btn mt-3">
            붙여넣은 글 확인하기
          </button>
        </div>
      </details>
    </div>
  );
}
