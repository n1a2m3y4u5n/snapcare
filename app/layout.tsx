import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterSW } from './register-sw';
import { SyncProvider } from "./sync-provider";
import { SweepToHear } from "@/components/sc/SweepToHear";

export const metadata: Metadata = {
  title: "SnapCare — one photo, instant verdict",
  description:
    "Photograph a meal, a label, a medicine or a prescription and get an answer in pictograms, voice and one colour — no reading required.",
  applicationName: "SnapCare",
  // 홈 화면에 추가했을 때 브라우저 크롬 없이 앱처럼 열리게 한다
  appleWebApp: { capable: true, title: "SnapCare", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#2F6BF6",
  // 판정 화면을 확대하다 레이아웃이 깨지는 것보다, 큰 글씨·큰 버튼으로 처음부터 읽히는 편이 낫다
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // 화면 문구는 전부 영어다 (글로벌 팀 · 심사 언어). lang 이 ko 면 스크린리더와
    // TTS 가 영어 문장을 한국어 음성으로 읽으려 해서 발음이 무너진다.
    <html lang="en" className="h-full">
      <body className="min-h-full bg-white">
        <SyncProvider />
        {/* 어느 화면이든 글 근처를 꾹 누르면 읽어주고, 누른 채 미끄러뜨리면 지나가는
            것을 차례로 읽는다. 화면마다 붙일 것이 아니라 앱 전체에 한 번 건다 —
            빠뜨린 화면이 생기면 그 화면만 조용해진다. */}
        <SweepToHear />
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
