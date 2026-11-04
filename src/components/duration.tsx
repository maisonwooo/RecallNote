import { formatDuration } from "@/lib/format.ts";

/** "1시간 6분"에서 숫자는 크게 두고 "시간/분" 같은 단위만 작게 보여준다. */
export function Duration({ seconds }: { seconds: number }) {
  const parts = formatDuration(seconds).split(/(\d+)/).filter(Boolean);
  return (
    <>
      {parts.map((part, i) =>
        /^\d+$/.test(part) ? <span key={i}>{part}</span> : <span key={i} className="duration-unit">{part}</span>,
      )}
    </>
  );
}
