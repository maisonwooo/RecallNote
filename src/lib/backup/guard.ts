/**
 * 백업 요청이 "내 컴퓨터의 이 앱 화면"에서 온 것인지 검사한다. 문제가 있으면 이유를, 괜찮으면 null 을 돌려준다.
 * 로컬 서버도 다른 웹사이트가 몰래 요청을 보낼 수 있어서(CSRF, DNS 리바인딩) 아래를 확인한다.
 * - Host 가 127.0.0.1 / localhost 인지
 * - Origin·Sec-Fetch-Site 가 같은 사이트인지
 * - (쓰기 요청) 직접 단 헤더 x-recallnote: 1 이 있는지 (다른 사이트는 이 헤더를 못 단다)
 */
export function checkLocalRequest(request: { headers: Pick<Headers, "get"> }, options: { requireHeader?: boolean } = {}): string | null {
  const host = request.headers.get("host") ?? "";
  const hostname = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  if (!["127.0.0.1", "localhost", "[::1]"].includes(hostname)) return "이 주소로는 사용할 수 없어요. 127.0.0.1 로 열어 주세요.";

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== host) return "다른 사이트에서 보낸 요청이에요.";
    } catch {
      return "요청 출처를 확인할 수 없어요.";
    }
  }
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return "다른 사이트에서 보낸 요청이에요.";

  if (options.requireHeader && request.headers.get("x-recallnote") !== "1") return "잘못된 요청이에요.";
  return null;
}
