import Link from "next/link";
import { requireUser } from "@/lib/auth";

const previews = [
  { href: "/previews/reminder", label: "Reminder email" },
  { href: "/previews/newbill", label: "New bill email" },
  { href: "/previews/custom", label: "Custom email" },
];

export default async function PreviewsIndex() {
  await requireUser();
  return (
    <main>
      <h2 className="section-title">Email Template Previews</h2>
      <ul className="space-y-2">
        {previews.map((p) => (
          <li key={p.href}>
            <Link className="text-accent hover:underline" href={p.href}>
              {p.label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
