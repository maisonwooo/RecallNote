"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { CardFormState, CardFormValues } from "@/lib/card-input.ts";

type Props = {
  action: (prev: CardFormState, formData: FormData) => Promise<CardFormState>;
  initial: CardFormValues;
  submitLabel: string;
  cancelHref: string;
};

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="mt-1 text-sm text-danger" role="alert">
      {message}
    </p>
  ) : null;
}

export function CardForm({ action, initial, submitLabel, cancelHref }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  // 오류로 돌아왔을 때는 방금 입력한 값을 다시 채워 준다.
  const values = state?.values ?? initial;
  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      {state?.message && (
        <p className="panel text-danger" role="alert">
          {state.message}
        </p>
      )}

      <div>
        <label htmlFor="question" className="mb-1 block font-medium">
          질문
        </label>
        <textarea
          id="question"
          name="question"
          rows={3}
          required
          defaultValue={values.question}
          aria-invalid={Boolean(errors.question)}
          aria-describedby={errors.question ? "question-error" : undefined}
          className="input"
        />
        <FieldError id="question-error" message={errors.question} />
      </div>

      <div>
        <label htmlFor="answer" className="mb-1 block font-medium">
          내가 쓴 답
        </label>
        <textarea
          id="answer"
          name="answer"
          rows={8}
          required
          defaultValue={values.answer}
          aria-invalid={Boolean(errors.answer)}
          aria-describedby={errors.answer ? "answer-error" : undefined}
          className="input"
        />
        <FieldError id="answer-error" message={errors.answer} />
      </div>

      <div>
        <label htmlFor="source" className="mb-1 block font-medium">
          출처 <span className="font-normal text-muted">(선택)</span>
        </label>
        <input
          id="source"
          name="source"
          type="text"
          defaultValue={values.source}
          placeholder="예: 3주차 4회차, 보안 문서"
          aria-invalid={Boolean(errors.source)}
          aria-describedby={errors.source ? "source-error" : undefined}
          className="input"
        />
        <FieldError id="source-error" message={errors.source} />
      </div>

      <div>
        <label htmlFor="tags" className="mb-1 block font-medium">
          태그 <span className="font-normal text-muted">(선택, 쉼표로 구분)</span>
        </label>
        <input
          id="tags"
          name="tags"
          type="text"
          defaultValue={values.tags}
          placeholder="예: 보안, http, 쉘"
          aria-invalid={Boolean(errors.tags)}
          aria-describedby={errors.tags ? "tags-error" : undefined}
          className="input"
        />
        <FieldError id="tags-error" message={errors.tags} />
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "저장 중…" : submitLabel}
        </button>
        <Link href={cancelHref} className="btn">
          취소
        </Link>
      </div>
    </form>
  );
}
