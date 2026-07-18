import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IlliHealth — 건강을 그림으로",
  description: "개도국 문맹 사용자의 의료 정보 접근성을 보장하는 픽토그램·음성 앱",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full bg-white">{children}</body>
    </html>
  );
}
