import Link from "next/link";

const tabs = [
  { key: "bills", href: "/portal", label: "Bills" },
  { key: "household", href: "/portal/household", label: "Household" },
  { key: "email", href: "/portal/email", label: "Email" },
] as const;

export type PortalTab = (typeof tabs)[number]["key"];

export default function PortalTabs({ active }: { active: PortalTab }) {
  return (
    <div className="mb-6">
      <h1 className="page-title mb-3">Portal</h1>
      <div className="flex gap-5 border-b border-line-soft" role="navigation" aria-label="Portal sections">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={active === t.key ? "page" : undefined}
            className={`tab ${active === t.key ? "tab-active" : ""}`}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
