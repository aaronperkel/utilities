"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const baseLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/trends", label: "Trends" },
];

const adminLinks = [{ href: "/portal", label: "Portal" }];

export default function Nav({
  authed,
  isAdmin,
}: {
  authed: boolean;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const links = isAdmin ? [...baseLinks, ...adminLinks] : baseLinks;

  return (
    <header className="border-b border-line-soft bg-panel">
      <div className="mx-auto flex h-13 max-w-[1000px] items-center justify-between gap-4 px-5">
        <Link
          href="/"
          className="font-mono text-[0.8rem] font-semibold uppercase tracking-[0.14em] whitespace-nowrap"
        >
          77 N Union #3
          <span className="ml-2 hidden font-normal text-ink-muted sm:inline">
            Utilities
          </span>
        </Link>
        {authed && (
          <nav className="flex h-full items-center gap-5" aria-label="Main navigation">
            {links.map(({ href, label }) => {
              const active =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-full items-center border-b-2 px-0.5 text-sm font-medium transition-colors duration-100 ${
                    active
                      ? "border-accent text-ink"
                      : "border-transparent text-ink-muted hover:text-ink"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </header>
  );
}
