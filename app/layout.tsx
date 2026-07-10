import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { getCurrentPerson } from "@/lib/auth";
import Nav from "@/app/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Perk Utilities",
  description: "A dashboard to keep track of the monthly utilities of our apartment",
  authors: [{ name: "Aaron Perkel" }],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  appleWebApp: { capable: true, title: "77 N Union", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1a202c",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const person = await getCurrentPerson();

  return (
    <html lang="en">
      <body className="mx-auto max-w-[1100px] px-5 pt-8 pb-12 font-sans">
        <Nav isAdmin={!!person?.isAdmin} />
        <div className="site-container">{children}</div>
        <footer className="card mt-10 px-6 py-5 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div>
            <strong>Perk Utilities</strong>
            <div className="text-ink-muted">Updated July 2026 • Version 7.0</div>
          </div>
          <div className="text-ink-muted">
            <a className="hover:text-ink" href="tel:4782628935">
              478‑262‑8935
            </a>
            <span className="mx-2">|</span>
            <a className="hover:text-ink" href="mailto:me@aaronperkel.com">
              me@aaronperkel.com
            </a>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
