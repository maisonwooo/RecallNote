import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NavLinks, NavLinksPlain } from "@/components/nav-links";
import "./globals.css";

export const metadata: Metadata = {
  title: "RecallNote",
  description: "나만 쓰는 로컬 학습 노트",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: 아래 스크립트가 첫 화면 전에 <html>의 글자 크기를 바꾸므로, 서버가 그린 값과 달라도 경고하지 않는다
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* 글꼴을 미리 불러와서 글꼴이 바뀌며 흔들리는 것을 줄인다 (이 앱 폴더의 파일, 외부 서버 아님) */}
        <link rel="preload" href="/fonts/PretendardVariable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* 저장해 둔 글자 크기를 첫 화면이 그려지기 전에 적용한다 (깜빡임 방지). 고정된 글자뿐이고 사용자 입력은 들어가지 않는다. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var n=parseInt(localStorage.getItem("rn-font-size"),10);if(n>=14&&n<=24)document.documentElement.style.fontSize=n+"px"}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <header className="site-header">
          <nav className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-1 gap-y-1 px-6 py-3">
            <Link href="/" className="brand mr-3">
              RecallNote
            </Link>
            {/* 현재 주소를 읽는 부분만 Suspense 안에 둔다. 읽기 전에는 강조 없이 같은 링크를 보여준다. */}
            <Suspense fallback={<NavLinksPlain />}>
              <NavLinks />
            </Suspense>
            <Link href="/cards/new" className="btn btn-primary ml-auto">
              새 카드
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
