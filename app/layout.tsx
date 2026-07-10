import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { getCurrentPerson } from "@/lib/auth";
import Nav from "@/app/components/Nav";
import "./globals.css";

// The ledger face: every figure, date, and section label on the site.
const ledger = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ledger",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_BASE_URL ?? "https://utilities.aaronperkel.com"),
  title: "Perk Utilities",
  description: "A dashboard to keep track of the monthly utilities of our apartment",
  authors: [{ name: "Aaron Perkel" }],
  openGraph: {
    title: "Perk Utilities",
    description: "Shared utility bills for 77 N Union #3 — split, tracked, settled.",
    url: "/",
    siteName: "Perk Utilities",
    locale: "en_US",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "77 N Union #3 — Perk Utilities" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Perk Utilities",
    description: "Shared utility bills for 77 N Union #3 — split, tracked, settled.",
    images: ["/og.png"],
  },
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f6" },
    { media: "(prefers-color-scheme: dark)", color: "#14181d" },
  ],
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const person = await getCurrentPerson();

  return (
    <html lang="en" className={ledger.variable}>
      <body className="flex min-h-dvh flex-col font-sans">
        <Nav authed={!!person} isAdmin={!!person?.isAdmin} />
        <div className="mx-auto w-full max-w-[1000px] flex-1 px-5 py-8">
          {children}
        </div>
        <footer className="mx-auto w-full max-w-[1000px] px-5 pb-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-4 text-xs text-ink-muted">
            <span className="font-mono uppercase tracking-[0.1em]">
              Perk Utilities · Est. 2024
            </span>
            <span>
              <a className="hover:text-ink" href="tel:4782628935">
                478‑262‑8935
              </a>
              <span className="mx-2">·</span>
              <a className="hover:text-ink" href="mailto:me@aaronperkel.com">
                me@aaronperkel.com
              </a>
            </span>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
