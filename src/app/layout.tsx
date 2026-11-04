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
    <html lang="ko" className="h-full antialiased">
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
