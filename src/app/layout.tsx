import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: { default: "E News", template: "%s | E News" },
  description: "Independent reporting on India and the world.",
  alternates: { types: { "application/rss+xml": "/feed.xml" } },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1856d6" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
