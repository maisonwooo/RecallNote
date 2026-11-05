"use client";

import { useActionState, useState } from "react";
import { saveSettingsAction } from "@/app/settings/actions";
import { FontSizeSync } from "@/components/font-size-sync";
import type { SettingsFormState, SettingsFormValues } from "@/lib/settings.ts";

const FIELDS: { name: keyof SettingsFormValues; label: string; unit: string; min: number; max: number; help: string }[] = [
  { name: "dailyReviewLimit", label: "하루 복습 상한", unit: "장", min: 1, max: 200, help: "하루에 복습할 카드 수의 최대치예요." },
  { name: "focusMinutes", label: "집중 시간", unit: "분", min: 1, max: 180, help: "다음에 시작하는 집중부터 적용돼요." },
  { name: "breakMinutes", label: "휴식 시간", unit: "분", min: 1, max: 60, help: "집중이 끝난 뒤 쉬는 시간이에요." },
  { name: "fontSize", label: "글자 크기", unit: "px", min: 14, max: 24, help: "화면 전체 글자 크기예요. 기본은 16이에요. 저장하면 바로 적용돼요." },
];

export function SettingsForm({ initial }: { initial: SettingsFormValues }) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(saveSettingsAction, null);
  const values = state?.values ?? initial;
  const errors = state?.errors ?? {};
  // 저장에 성공했으면 방금 저장한 값을, 아니면 DB에 있던 값을 이 브라우저에 맞춘다
  const savedSize = state?.message === "저장했어요." && state.values ? state.values.fontSize : initial.fontSize;
  // 입력하는 동안 아래 미리보기 글자 크기를 바꾼다 (저장 전에는 화면 전체가 바뀌지 않는다)
  const [previewSize, setPreviewSize] = useState(Number(initial.fontSize));

  return (
    <form action={formAction} className="space-y-6">
      <FontSizeSync size={Number(savedSize)} />
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
              onChange={
                field.name === "fontSize"
                  ? (event) => {
                      const n = Number(event.target.value);
                      if (Number.isInteger(n) && n >= field.min && n <= field.max) setPreviewSize(n);
                    }
                  : undefined
              }
              aria-invalid={Boolean(errors[field.name])}
              aria-describedby={`${field.name}-help`}
              className="input max-w-32 tabular-nums"
            />
            <span>{field.unit}</span>
          </div>
          <p id={`${field.name}-help`} className="mt-1 text-sm text-muted">
            {field.help} ({field.min}~{field.max})
          </p>
          {field.name === "fontSize" && (
            <p className="panel mt-3" style={{ fontSize: `${previewSize}px` }}>
              미리보기: 배운 것을 카드로 남기고, 잊기 전에 다시 봅니다. 가나다 ABC 123
            </p>
          )}
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
