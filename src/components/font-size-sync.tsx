"use client";

import { useEffect } from "react";

export const FONT_SIZE_KEY = "rn-font-size";

/**
 * 저장된 글자 크기(DB 값)를 이 브라우저에 맞춰 둔다: 화면에 바로 적용하고, localStorage 에도 적어 둔다.
 * 다음에 앱을 열 때는 <head> 의 작은 스크립트가 localStorage 값을 첫 화면이 그려지기 전에 적용한다(깜빡임 방지).
 */
export function FontSizeSync({ size }: { size: number }) {
  useEffect(() => {
    document.documentElement.style.fontSize = `${size}px`;
    try {
      localStorage.setItem(FONT_SIZE_KEY, String(size));
    } catch {
      // 저장소를 쓸 수 없는 환경(사생활 보호 창 등)에서는 이번 화면에만 적용된다
    }
  }, [size]);
  return null;
}
