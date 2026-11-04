import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RecallNote",
  description: "나만 쓰는 로컬 학습 노트",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
