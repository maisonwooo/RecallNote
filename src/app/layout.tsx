import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "RecallNote",
  description: "나만 쓰는 로컬 학습 노트",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border">
          <nav className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
            <Link href="/" className="text-lg font-semibold no-underline">
              RecallNote
            </Link>
            <Link href="/review">복습</Link>
            <Link href="/cards">카드</Link>
            <Link href="/archive">보관함</Link>
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
