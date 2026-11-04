"use client";

import { useActionState } from "react";
import { saveSettingsAction } from "@/app/settings/actions";
import type { SettingsFormState, SettingsFormValues } from "@/lib/settings.ts";

const FIELDS: { name: keyof SettingsFormValues; label: string; unit: string; min: number; max: number; help: string }[] = [
  { name: "dailyReviewLimit", label: "하루 복습 상한", unit: "장", min: 1, max: 200, help: "하루에 복습할 카드 수의 최대치예요." },
  { name: "focusMinutes", label: "집중 시간", unit: "분", min: 1, max: 180, help: "다음에 시작하는 집중부터 적용돼요." },
  { name: "breakMinutes", label: "휴식 시간", unit: "분", min: 1, max: 60, help: "집중이 끝난 뒤 쉬는 시간이에요." },
];

export function SettingsForm({ initial }: { initial: SettingsFormValues }) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(saveSettingsAction, null);
  const values = state?.values ?? initial;
  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      {FIELDS.map((field) => (
        <div key={field.name}>
          <label htmlFor={field.name} className="mb-1 block font-medium">
            {field.label}
          </label>
          <div className="flex items-center gap-2">
            <input
              id={field.name}
              name={field.name}
              type="number"
              inputMode="numeric"
              min={field.min}
              max={field.max}
              step={1}
              required
              defaultValue={values[field.name]}
              aria-invalid={Boolean(errors[field.name])}
              aria-describedby={`${field.name}-help`}
              className="input max-w-32 tabular-nums"
            />
            <span>{field.unit}</span>
          </div>
          <p id={`${field.name}-help`} className="mt-1 text-sm text-muted">
            {field.help} ({field.min}~{field.max})
          </p>
          {errors[field.name] && (
            <p className="mt-1 text-sm text-danger" role="alert">
              {errors[field.name]}
            </p>
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "저장 중…" : "저장"}
        </button>
        {state?.message && (
          <p role="status" className={state.errors || state.message !== "저장했어요." ? "text-danger" : "text-muted"}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
