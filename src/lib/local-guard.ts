/**
 * 내 컴퓨터의 이 앱에서 온 요청인지 검사한다. 문제가 있으면 이유를, 괜찮으면 null 을 돌려준다.
 * 로컬 서버도 다른 웹사이트가 몰래 요청을 보낼 수 있어서(CSRF, DNS 리바인딩) 아래를 확인한다.
 * - Host 가 127.0.0.1 / localhost / [::1] 인지 (이름을 속여 내 컴퓨터로 연결시키는 DNS 리바인딩 차단)
 * - Origin·Sec-Fetch-Site 가 같은 사이트인지
 * - (필요하면) 직접 단 헤더 x-recallnote: 1 이 있는지 (다른 사이트는 이 헤더를 못 단다)
 */
type RequestLike = { headers: Pick<Headers, "get"> };

/** Host 헤더(예: 127.0.0.1:3000)가 이 컴퓨터를 가리키는 주소인지 */
export function isAllowedHost(host: string | null | undefined): boolean {
  const value = (host ?? "").toLowerCase();
  const hostname = value.startsWith("[") ? value.slice(0, value.indexOf("]") + 1) : value.split(":")[0];
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

export function checkLocalRequest(request: RequestLike, options: { requireHeader?: boolean } = {}): string | null {
  const host = request.headers.get("host") ?? "";
  if (!isAllowedHost(host)) return "이 주소로는 사용할 수 없어요. 127.0.0.1 로 열어 주세요.";

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host.toLowerCase() !== host.toLowerCase()) return "다른 사이트에서 보낸 요청이에요.";
    } catch {
      return "요청 출처를 확인할 수 없어요.";
    }
  }
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return "다른 사이트에서 보낸 요청이에요.";

  if (options.requireHeader && request.headers.get("x-recallnote") !== "1") return "잘못된 요청이에요.";
  return null;
}

/**
 * 앱 전체에 거는 검사 (src/proxy.ts 가 모든 요청에 대해 부른다).
 * - 모든 요청: Host 가 이 컴퓨터를 가리켜야 한다.
 * - 바꾸는 요청(POST 등): 거기에 더해 Origin·Sec-Fetch-Site 도 같은 사이트여야 한다.
 */
export function checkAppRequest(request: RequestLike & { method: string }): string | null {
  if (!isAllowedHost(request.headers.get("host"))) return "이 주소로는 사용할 수 없어요. http://127.0.0.1:3000 으로 열어 주세요.";
  if (request.method !== "GET" && request.method !== "HEAD") return checkLocalRequest(request);
  return null;
}
