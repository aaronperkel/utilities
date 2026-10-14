import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Frozen 2026-10-14: the household moved to Lejer (uselejer.com). This root renders the one
// static "moved" page and nothing else — no session, no database, no writes.

const ledger = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ledger",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://utilities.aaronperkel.com"),
  title: "Perk Utilities · moved to Lejer",
  description: "77 N Union #3's bills now live on Lejer.",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f6" },
    { media: "(prefers-color-scheme: dark)", color: "#14181d" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ledger.variable}>
      <body className="flex min-h-dvh flex-col font-sans">
        <div className="mx-auto w-full max-w-[1000px] flex-1 px-4 py-8 sm:px-5">{children}</div>
        <footer className="mx-auto w-full max-w-[1000px] px-4 pb-8 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-4 text-xs text-ink-muted">
            <span className="font-mono uppercase tracking-[0.1em]">Perk Utilities · 2024–2026</span>
            <a className="hover:text-ink" href="mailto:me@aaronperkel.com">
              me@aaronperkel.com
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
