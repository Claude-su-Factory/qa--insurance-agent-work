import type { Metadata } from "next";
import { AppProvider } from "./context/AppContext";
import { createClient } from "./lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "보험 약관 QA Agent",
  description: "AI 기반 보험 약관 질의응답 시스템",
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
      <body>
        <AppProvider initialUser={user}>{children}</AppProvider>
      </body>
    </html>
  );
}
