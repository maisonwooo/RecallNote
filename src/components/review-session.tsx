"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { submitReviewAction } from "@/app/review/actions";

export type ReviewCardData = {
  id: number;
  question: string;
  answer: string;
  source: string | null;
  box: number;
  tags: string[];
};

type Result = "wrong" | "unsure" | "right";

const CHOICES: { result: Result; key: string; label: string }[] = [
  { result: "wrong", key: "1", label: "틀림" },
  { result: "unsure", key: "2", label: "애매" },
  { result: "right", key: "3", label: "맞음" },
];

/** 카드를 한 장씩 보여주고 평가를 받는다. Space: 답 보기, 1/2/3: 틀림/애매/맞음 */
export function ReviewSession({ cards }: { cards: ReviewCardData[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const card = cards[index];

  const submit = useCallback(
    async (result: Result) => {
      if (!card || busy || finished) return;
      setBusy(true);
      setError(null);
      try {
        const response = await submitReviewAction(card.id, result);
        if (response.status === "error") {
          setError(response.message);
          return;
        }
        setNote(
          response.status === "saved"
            ? `저장했어요 · 다음 복습 ${response.nextDue} (상자 ${response.boxAfter})`
            : "이미 처리된 카드라서 건너뛰었어요.",
        );
        if (index + 1 < cards.length) {
          setIndex(index + 1);
          setRevealed(false);
        } else {
          setFinished(true);
          router.refresh(); // 서버가 오늘 결과 요약 화면으로 바꿔 준다
        }
      } catch {
        setError("서버와 연결이 끊겼어요. 서버가 켜져 있는지 확인해 주세요.");
      } finally {
        setBusy(false);
      }
    },
    [busy, card, cards.length, finished, index, router],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;

      if (event.key === " ") {
        event.preventDefault(); // Space 로 화면이 스크롤되거나 버튼이 두 번 눌리는 것을 막는다
        if (!revealed && !finished) setRevealed(true);
        return;
      }
      const choice = CHOICES.find((c) => c.key === event.key);
      if (choice && revealed) {
        event.preventDefault();
        void submit(choice.result);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [revealed, finished, submit]);

  if (finished || !card) {
    return <p className="text-muted">결과를 정리하는 중…</p>;
  }

  return (
    <section aria-label="복습">
      <div className="mb-6 flex items-center justify-between text-muted">
        <p aria-live="polite">
          <span className="tabular-nums">{index + 1}</span> / <span className="tabular-nums">{cards.length}</span>
        </p>
        <p>상자 {card.box}</p>
      </div>

      {note && <p className="mb-4 text-sm text-muted">{note}</p>}

      <h1 className="mb-1 text-sm font-normal text-muted">질문</h1>
      <p className="mb-8 whitespace-pre-wrap break-words text-2xl font-semibold leading-snug">{card.question}</p>

      {!revealed ? (
        <button type="button" onClick={() => setRevealed(true)} className="btn btn-primary w-full sm:w-auto">
          답 보기 (Space)
        </button>
      ) : (
        <div aria-live="polite">
          <h2 className="mb-1 text-sm font-normal text-muted">내가 쓴 답</h2>
          <p className="panel mb-3 whitespace-pre-wrap break-words">{card.answer}</p>
          {(card.source || card.tags.length > 0) && (
            <p className="mb-6 text-sm text-muted">
              {card.source && <>출처 {card.source}</>}
              {card.source && card.tags.length > 0 && " · "}
              {card.tags.length > 0 && <>태그 {card.tags.join(", ")}</>}
            </p>
          )}
          <p className="mb-2 text-sm text-muted">얼마나 기억났나요?</p>
          <div className="flex flex-wrap gap-3">
            {CHOICES.map((choice) => (
              <button
                key={choice.result}
                type="button"
                disabled={busy}
                onClick={() => void submit(choice.result)}
                className={`btn min-w-28 ${choice.result === "right" ? "btn-primary" : ""}`}
              >
                {choice.label} ({choice.key})
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 text-danger" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
