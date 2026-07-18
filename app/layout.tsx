import type { Metadata } from "next";
import "./globals.css";
import { SyncProvider } from "./sync-provider";

export const metadata: Metadata = {
  title: "SnapCare — one photo, instant verdict",
  description: "저문해 사용자를 위한 사진 기반 가족 건강 안전 앱 — 픽토그램·음성·신호등 판정 (e-ICON H1)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full bg-white">
        <SyncProvider />
        {children}
      </body>
    </html>
  );
}
