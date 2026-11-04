import { BackupImport } from "@/components/backup-import";

// DB를 읽지 않는 정적인 화면이다. 내려받기와 가져오기는 /backup/... 주소가 처리한다.
export default function BackupPage() {
  return (
    <>
      <h1 className="page-title mb-2 text-2xl font-semibold">백업</h1>
      <p className="mb-8 text-muted">
        내 학습 기록은 이 컴퓨터의 파일 하나(<code>data/recallnote.db</code>)에만 있어요. git에도 올라가지 않으니 가끔 내보내서
        따로 보관해 주세요.
      </p>

      <h2 className="mb-3 text-lg font-semibold">내보내기</h2>
      <div className="panel mb-10">
        <div className="flex flex-wrap gap-3">
          {/* 파일을 받는 주소라서 일반 링크(a)를 쓴다 (Link 는 미리 불러오기를 해서 맞지 않는다) */}
          <a href="/backup/export" download className="btn btn-primary">
            전체 JSON 받기
          </a>
          <a href="/backup/cards-csv" download className="btn">
            카드만 CSV 받기
          </a>
        </div>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>JSON: 카드(보관함 포함), 태그, 복습 기록, 타이머 기록, 설정이 모두 들어가요. 나중에 여기서 가져올 수 있어요.</li>
          <li>CSV: 카드만 들어 있어요. 엑셀 등에서 열어 볼 수 있고, 가져오기에는 쓸 수 없어요.</li>
          <li>받은 파일에는 내 학습 기록이 그대로 들어 있어요. git에 올리거나 남에게 보내지 마세요.</li>
        </ul>
      </div>

      <h2 className="mb-3 text-lg font-semibold">가져오기</h2>
      <p className="mb-3 text-muted">
        JSON 백업 파일로 지금 데이터를 <strong>통째로 바꿔요.</strong> 파일을 고르면 먼저 검사하고 미리보기를 보여 주고, 확인하기
        전에는 아무것도 바뀌지 않아요. 바꾸기 직전의 데이터는 <code>data/backups/</code>에 자동으로 저장돼요.
      </p>
      <BackupImport />
    </>
  );
}
