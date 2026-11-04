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
