/** UTC 시각 문자열을 서울 시간으로 보기 좋게 바꾼다. 예: 2026. 11. 4. 오후 2:30 */
export function formatSeoul(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** 초를 "1시간 40분", "25분" 처럼 보여준다. 1분 미만이면 "1분 미만", 0이면 "0분". */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0분";
  const minutes = Math.floor(seconds / 60);
  if (minutes === 0) return "1분 미만";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}분`;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

/** 남은 시간을 "42:15" 형태로. 0 아래는 "00:00". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
