"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export type NavItem = { href: string; label: string; badge?: number };

/** Desktop: inline links. Phone: a "Menu" disclosure that opens a full-width sheet. */
export function SiteNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [path]);
  const current = (href: string) => (path === href || (href !== "/" && path.startsWith(href + "/")) ? "page" : undefined);
  const link = (i: NavItem) => (
    <Link key={i.href} href={i.href} aria-current={current(i.href)}>
      {i.label}
      {i.badge ? <span className="badge">{i.badge}</span> : null}
    </Link>
  );
  const total = items.reduce((n, i) => n + (i.badge ?? 0), 0);
  return (
    <>
      <nav className="nav" aria-label="Main">
        {items.map(link)}
      </nav>
      <details className="menu" ref={menu}>
        <summary aria-label="Menu">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          Menu{total ? <span className="badge">{total}</span> : null}
        </summary>
        <nav className="menu-sheet" aria-label="Main (mobile)">
          {items.map(link)}
        </nav>
      </details>
    </>
  );
}
