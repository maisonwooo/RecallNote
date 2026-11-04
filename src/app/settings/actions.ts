"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/connection.ts";
import { parseSettingsForm, saveSettings, type SettingsFormState } from "@/lib/settings.ts";

export async function saveSettingsAction(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const parsed = parseSettingsForm({
    dailyReviewLimit: formData.get("dailyReviewLimit"),
    focusMinutes: formData.get("focusMinutes"),
    breakMinutes: formData.get("breakMinutes"),
  });
  if (!parsed.ok) return { errors: parsed.errors, values: parsed.values };

  try {
    saveSettings(getDb(), parsed.value);
  } catch (error) {
    console.error("설정 저장 실패", error);
    return { message: "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.", values: undefined };
  }
  revalidatePath("/", "layout");
  return {
    message: "저장했어요.",
    values: {
      dailyReviewLimit: String(parsed.value.dailyReviewLimit),
      focusMinutes: String(parsed.value.focusMinutes),
      breakMinutes: String(parsed.value.breakMinutes),
    },
  };
}
