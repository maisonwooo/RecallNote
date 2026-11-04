import Link from "next/link";

export default function NotFound() {
  return (
    <div className="panel">
      <h1 className="mb-2 text-xl font-semibold">찾을 수 없어요</h1>
      <p className="mb-4 text-muted">없는 카드이거나, 보관함으로 옮겨진 카드일 수 있어요.</p>
      <div className="flex gap-3">
        <Link href="/cards" className="btn">
          카드 목록
        </Link>
        <Link href="/archive" className="btn">
          보관함
        </Link>
      </div>
    </div>
  );
}
