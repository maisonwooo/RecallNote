import { Suspense } from "react";
import { connection } from "next/server";
import { SettingsForm } from "@/components/settings-form";
import { getDb } from "@/lib/db/connection.ts";
import { getSettings } from "@/lib/settings.ts";

async function SettingsContent() {
  await connection();
  const s = getSettings(getDb());
  return (
    <SettingsForm
      initial={{
        dailyReviewLimit: String(s.dailyReviewLimit),
        focusMinutes: String(s.focusMinutes),
        breakMinutes: String(s.breakMinutes),
      }}
    />
  );
}

export default function SettingsPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold page-title">설정</h1>
      <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
        <SettingsContent />
      </Suspense>
    </>
  );
}
