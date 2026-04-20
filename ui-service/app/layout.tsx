import type { Metadata } from "next";
import { AppProvider } from "./context/AppContext";
import { createClient } from "./lib/supabase/server";
import JsonLd from "./components/JsonLd";
import "./globals.css";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "ClauseIQ — 조항 단위 근거 인용 보험 약관 QA Agent",
    template: "%s | ClauseIQ",
  },
  description: "보험 약관 PDF를 업로드하고 한국어로 질문하세요. ClauseIQ는 조항 단위로 답변하며 근거·페이지·관련도를 투명하게 보여줍니다.",
  keywords: ["보험 약관", "AI 질의응답", "면책기간", "보장범위", "보험금 청구", "약관 분석", "ClauseIQ"],
  openGraph: {
    title: "ClauseIQ — 조항 단위 근거 인용 보험 약관 QA",
    description: "PDF 업로드 → AI 질문 → 근거 조항 확인. Google 계정 하나로 무료 시작.",
    type: "website",
    locale: "ko_KR",
    url: baseUrl,
    siteName: "ClauseIQ",
  },
  twitter: {
    card: "summary_large_image",
    title: "ClauseIQ — 조항 단위 근거 인용 보험 약관 QA",
    description: "복잡한 보험 약관을 AI에게 물어보세요. 답변마다 조항 근거 제공.",
  },
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adsensePubId = process.env.NEXT_PUBLIC_ADSENSE_PUB_ID;

  return (
    <html lang="ko">
      <head>
        <JsonLd />
        {adsensePubId && (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsensePubId}`}
            crossOrigin="anonymous"
          />
        )}
      </head>
      <body>
        <AppProvider initialUser={user}>{children}</AppProvider>
      </body>
    </html>
  );
}
