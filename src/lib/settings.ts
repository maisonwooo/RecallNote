import type { DatabaseSync } from "node:sqlite";
import { withTransaction } from "./db/transaction.ts";

/** 설정 값의 기본값과 허용 범위. (settings 표에는 글자로 저장되므로 읽을 때마다 검사한다) */
export const SETTING_RULES = {
  daily_review_limit: { label: "하루 복습 상한", unit: "장", min: 1, max: 200, fallback: 20 },
  focus_minutes: { label: "집중 시간", unit: "분", min: 1, max: 180, fallback: 50 },
  break_minutes: { label: "휴식 시간", unit: "분", min: 1, max: 60, fallback: 10 },
  font_size: { label: "글자 크기", unit: "px", min: 14, max: 24, fallback: 16 },
} as const;

export type SettingKey = keyof typeof SETTING_RULES;

export const DEFAULT_DAILY_REVIEW_LIMIT = SETTING_RULES.daily_review_limit.fallback;

export type AppSettings = { dailyReviewLimit: number; focusMinutes: number; breakMinutes: number; fontSize: number };

function readInteger(raw: unknown, key: SettingKey): number {
  const rule = SETTING_RULES[key];
  const n = Number(raw);
  // 값이 없거나(undefined) 빈 글자("")·숫자가 아닌 글자·범위 밖이면 기본값을 쓴다.
  return raw !== undefined && raw !== "" && Number.isInteger(n) && n >= rule.min && n <= rule.max ? n : rule.fallback;
}

function readSetting(db: DatabaseSync, key: SettingKey): number {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return readInteger(row?.value, key);
}

/** 하루 복습 상한. 값이 없거나 이상하면 기본값 20. */
export function getDailyReviewLimit(db: DatabaseSync): number {
  return readSetting(db, "daily_review_limit");
}

export function getSettings(db: DatabaseSync): AppSettings {
  return {
    dailyReviewLimit: readSetting(db, "daily_review_limit"),
    focusMinutes: readSetting(db, "focus_minutes"),
    breakMinutes: readSetting(db, "break_minutes"),
    fontSize: readSetting(db, "font_size"),
  };
}

export type SettingsFormValues = { dailyReviewLimit: string; focusMinutes: string; breakMinutes: string; fontSize: string };
export type SettingsErrors = Partial<Record<keyof SettingsFormValues, string>>;
export type SettingsFormState = { errors?: SettingsErrors; values?: SettingsFormValues; message?: string } | null;

const FORM_FIELDS: { field: keyof SettingsFormValues; key: SettingKey }[] = [
  { field: "dailyReviewLimit", key: "daily_review_limit" },
  { field: "focusMinutes", key: "focus_minutes" },
  { field: "breakMinutes", key: "break_minutes" },
  { field: "fontSize", key: "font_size" },
];

/** 폼에서 온 글자를 검사한다. 하나라도 틀리면 아무것도 저장하지 않는다. */
export function parseSettingsForm(
  raw: Partial<Record<keyof SettingsFormValues, unknown>>,
): { ok: true; value: AppSettings } | { ok: false; errors: SettingsErrors; values: SettingsFormValues } {
  const values = {} as SettingsFormValues;
  const parsed: Partial<AppSettings> = {};
  const errors: SettingsErrors = {};
  for (const { field, key } of FORM_FIELDS) {
    const text = typeof raw[field] === "string" ? (raw[field] as string).trim() : "";
    values[field] = text;
    const rule = SETTING_RULES[key];
    if (!/^\d{1,4}$/.test(text) || Number(text) < rule.min || Number(text) > rule.max) {
      errors[field] = `${rule.label}은(는) ${rule.min}~${rule.max}${rule.unit} 사이의 숫자로 입력해 주세요.`;
    } else {
      parsed[field] = Number(text);
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors, values };
  return { ok: true, value: parsed as AppSettings };
}

/** 설정을 저장한다(없으면 만들고 있으면 덮어씀). 세 값을 한 트랜잭션으로 저장한다. */
export function saveSettings(db: DatabaseSync, value: AppSettings): void {
  withTransaction(db, () => {
    const upsert = db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    );
    upsert.run("daily_review_limit", String(value.dailyReviewLimit));
    upsert.run("focus_minutes", String(value.focusMinutes));
    upsert.run("break_minutes", String(value.breakMinutes));
    upsert.run("font_size", String(value.fontSize));
  });
}
