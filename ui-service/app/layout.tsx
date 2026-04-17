import type { Metadata } from "next";
import { AppProvider } from "./context/AppContext";
import { createClient } from "./lib/supabase/server";
import JsonLd from "./components/JsonLd";
import "./globals.css";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "보험 약관 QA - AI 기반 보험 약관 질의응답 서비스",
    template: "%s | 보험 약관 QA",
  },
  description: "보험 약관 PDF를 업로드하고 AI에게 질문하세요. 면책기간, 보장범위, 청구조건 등 복잡한 약관을 쉽게 이해할 수 있습니다. 근거 조항까지 정확하게 제시합니다.",
  keywords: ["보험 약관", "AI 질의응답", "면책기간", "보장범위", "보험금 청구", "약관 분석"],
  openGraph: {
    title: "보험 약관 QA - AI가 약관을 쉽게 설명해드립니다",
    description: "PDF 업로드 → AI 질문 → 근거 조항 확인. 무료로 시작하세요.",
    type: "website",
    locale: "ko_KR",
    url: baseUrl,
    siteName: "보험 약관 QA",
  },
  twitter: {
    card: "summary_large_image",
    title: "보험 약관 QA - AI 기반 약관 분석",
    description: "복잡한 보험 약관을 AI에게 물어보세요.",
  },
  robots: { index: true, follow: true },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang="ko">
      <head>
        <JsonLd />
      </head>
      <body>
        <AppProvider initialUser={user}>{children}</AppProvider>
      </body>
    </html>
  );
}
