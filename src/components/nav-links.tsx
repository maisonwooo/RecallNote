"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/review", label: "복습" },
  { href: "/cards", label: "카드" },
  { href: "/archive", label: "보관함" },
  { href: "/timer", label: "타이머" },
  { href: "/stats", label: "통계" },
  { href: "/settings", label: "설정" },
];

function Item({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link href={href} className="nav-link" aria-current={active ? "page" : undefined}>
      {label}
    </Link>
  );
}

/** 주소를 읽기 전(또는 읽는 동안)에 보여주는 메뉴. 강조 없이 같은 링크만 그린다. */
export function NavLinksPlain() {
  return (
    <>
      {ITEMS.map((item) => (
        <Item key={item.href} {...item} active={false} />
      ))}
    </>
  );
}

/** 위쪽 메뉴 링크들. 지금 보고 있는 메뉴에 aria-current 를 달아 강조한다. */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <>
      {ITEMS.map((item) => (
        <Item key={item.href} {...item} active={pathname === item.href || pathname.startsWith(`${item.href}/`)} />
      ))}
    </>
  );
}
