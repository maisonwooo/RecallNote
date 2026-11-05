import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkAppRequest } from "@/lib/local-guard.ts";

/**
 * 모든 요청이 화면·폼·내려받기에 닿기 전에 지나가는 검문소.
 * 다른 웹사이트가 "내 컴퓨터의 127.0.0.1"로 이름을 속여 카드 내용을 읽거나 폼을 보내는 것을 막는다.
 * 규칙은 src/lib/local-guard.ts 에 있고, 테스트도 거기에 있다.
 */
export function proxy(request: NextRequest) {
  const blocked = checkAppRequest(request);
  if (blocked) {
    return new NextResponse(blocked, { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return NextResponse.next();
}
