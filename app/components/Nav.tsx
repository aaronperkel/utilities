"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const baseLinks = [
  { href: "/", label: "Home" },
  { href: "/trends", label: "Trends" },
];

const adminLinks = [
  { href: "/portal", label: "Admin Portal" },
  { href: "/email", label: "Send Email" },
];

export default function Nav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...baseLinks, ...adminLinks] : baseLinks;

  return (
    <header className="card mb-7 px-6 py-5 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold">77 N Union #3</h1>
        <p className="mt-0.5 text-sm text-ink-muted">Utilities Dashboard</p>
      </div>
      <nav className="flex flex-wrap gap-1.5" aria-label="Main navigation">
        {links.map(({ href, label }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`rounded-(--radius-sm) px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary/20 text-white"
                  : "text-ink hover:bg-primary/15"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
