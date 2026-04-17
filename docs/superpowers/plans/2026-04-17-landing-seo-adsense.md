# 랜딩 페이지 + SEO + AdSense Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 비로그인 공개 랜딩 페이지를 `/`에 구현하고, SEO(metadata/sitemap/robots/JSON-LD)와 대시보드용 AdSense 슬롯을 추가한다.

**Architecture:** 라우트 구조를 `/` (공개 랜딩) + `/dashboard` (인증 대시보드)로 분리한다. `app/layout.tsx`에 공통 metadata, `app/dashboard/layout.tsx`에 `index: false` 덮어쓰기. `NEXT_PUBLIC_APP_URL`은 로컬 fallback + Railway 배포 시 env var 주입 방식.

**Tech Stack:** Next.js 14 App Router + metadata API | sitemap/robots dynamic generation | JSON-LD structured data | Google AdSense (env-gated)

---

## 파일 구조

```
ui-service/app/
├── layout.tsx                      수정 — 공통 metadata, JsonLd, AdSense 스크립트
├── page.tsx                        전면 교체 — 랜딩 페이지 (공개)
├── sitemap.ts                      신규 — 동적 sitemap
├── robots.ts                       신규 — robots.txt
├── components/
│   ├── JsonLd.tsx                  신규 — 구조화 데이터 컴포넌트
│   ├── LandingNav.tsx              신규 — 랜딩 상단 네비게이션
│   ├── LandingHero.tsx             신규 — 히어로 섹션
│   ├── LandingFeatures.tsx         신규 — 기능 카드 3개
│   ├── LandingSteps.tsx            신규 — 사용 흐름 3단계
│   ├── LandingCTA.tsx              신규 — 하단 Google 로그인 CTA
│   ├── LandingFooter.tsx           신규 — 푸터
│   ├── AdSenseSlot.tsx             신규 — CLS 방지 AdSense 컴포넌트
│   └── CitationPanel.tsx           수정 — 하단 AdSenseSlot 추가
├── dashboard/
│   ├── layout.tsx                  신규 — 대시보드 metadata (index: false)
│   └── page.tsx                    신규 — 기존 루트 page.tsx 내용 이동
├── privacy/
│   └── page.tsx                    신규 — 개인정보처리방침
├── terms/
│   └── page.tsx                    신규 — 이용약관
middleware.ts                       수정 — public path 확장
Dockerfile                          수정 — NEXT_PUBLIC_APP_URL build arg
docker-compose.yml                  수정 — ui-service args에 ${NEXT_PUBLIC_APP_URL:-} 전달
```

---

## Task 1: 라우트 재편 — 대시보드를 /dashboard로 이동

**Files:**
- Create: `ui-service/app/dashboard/page.tsx`
- Create: `ui-service/app/dashboard/layout.tsx`
- Modify: `ui-service/app/page.tsx` (임시로 비움, Task 3에서 랜딩 페이지로 채움)
- Modify: `ui-service/middleware.ts`

- [ ] **Step 1: 기존 page.tsx 내용을 `dashboard/page.tsx`로 이동**

기존 `ui-service/app/page.tsx`의 전체 내용을 `ui-service/app/dashboard/page.tsx`로 복사:

```tsx
import LeftPanel from "../components/LeftPanel";
import ChatPanel from "../components/ChatPanel";
import CitationPanel from "../components/CitationPanel";
import LogoutButton from "../components/LogoutButton";
import { createClient } from "../lib/supabase/server";

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="flex h-screen flex-col bg-slate-100">
      <header className="bg-white border-b border-slate-200 h-[52px] flex items-center gap-3 px-5 flex-shrink-0 shadow-sm">
        <div className="w-[30px] h-[30px] bg-gradient-to-br from-blue-700 to-blue-500 rounded-lg flex items-center justify-center text-base">
          🛡️
        </div>
        <span className="font-bold text-[15px] text-slate-800">보험 약관 QA</span>
        <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
          AI Agent
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="w-2 h-2 bg-green-500 rounded-full" />
          <span className="text-[11px] text-slate-500">서비스 정상 운영 중</span>
          {user && (
            <>
              <span className="text-[11px] text-slate-400">{user.email}</span>
              <LogoutButton />
            </>
          )}
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden gap-px bg-slate-200">
        <LeftPanel />
        <ChatPanel />
        <CitationPanel />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: `dashboard/layout.tsx` 생성 (metadata 덮어쓰기)**

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

- [ ] **Step 3: 루트 `page.tsx`를 임시 플레이스홀더로 교체**

```tsx
export default function Home() {
  return <div>Landing placeholder — will be replaced in Task 3</div>;
}
```

- [ ] **Step 4: middleware.ts 업데이트 — public path 확장**

`ui-service/middleware.ts`의 `isPublicPath` 로직 수정:

```typescript
  const path = request.nextUrl.pathname;
  const isPublicPath =
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/privacy") ||
    path.startsWith("/terms") ||
    path === "/sitemap.xml" ||
    path === "/robots.txt";

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
```

- [ ] **Step 5: 타입 체크**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ui-service
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git add ui-service/app/dashboard/ ui-service/app/page.tsx ui-service/middleware.ts
git commit -m "refactor(ui): move dashboard to /dashboard, open / for landing page"
```

---

## Task 2: 법적 페이지 (privacy, terms)

**Files:**
- Create: `ui-service/app/privacy/page.tsx`
- Create: `ui-service/app/terms/page.tsx`

- [ ] **Step 1: privacy/page.tsx 생성**

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "보험 약관 QA 서비스의 개인정보 수집 및 이용 방침",
};

export default function Privacy() {
  return (
    <main className="max-w-2xl mx-auto py-12 px-6 text-slate-800">
      <h1 className="text-2xl font-bold mb-6">개인정보처리방침</h1>
      <p className="text-sm text-slate-500 mb-8">최종 수정일: 2026-04-17</p>

      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold mt-6">1. 수집하는 개인정보</h2>
        <p>본 서비스는 Google OAuth 로그인을 통해 이메일과 프로필 정보를 수집합니다. 사용자가 업로드한 PDF 파일은 분석을 위해 서버에 일시 저장되며, 추출된 텍스트는 검색을 위해 벡터 데이터베이스에 저장됩니다.</p>

        <h2 className="text-lg font-semibold mt-6">2. 개인정보의 이용 목적</h2>
        <p>수집된 정보는 서비스 제공, 사용자 인증, 약관 분석 결과 제공에만 사용됩니다.</p>

        <h2 className="text-lg font-semibold mt-6">3. 쿠키 및 AdSense</h2>
        <p>본 서비스는 Google AdSense를 통해 광고를 제공합니다. Google은 쿠키를 사용하여 이전 방문 내역을 기반으로 광고를 제공할 수 있습니다. 사용자는 <a href="https://adssettings.google.com" className="text-blue-600 underline">Google 광고 설정</a>에서 맞춤 광고를 비활성화할 수 있습니다.</p>

        <h2 className="text-lg font-semibold mt-6">4. 개인정보 보관 기간</h2>
        <p>회원 탈퇴 시 모든 개인정보와 업로드된 문서 데이터는 즉시 삭제됩니다.</p>

        <h2 className="text-lg font-semibold mt-6">5. 문의</h2>
        <p>개인정보 관련 문의는 서비스 운영자에게 연락 바랍니다.</p>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: terms/page.tsx 생성**

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "이용약관",
  description: "보험 약관 QA 서비스 이용약관",
};

export default function Terms() {
  return (
    <main className="max-w-2xl mx-auto py-12 px-6 text-slate-800">
      <h1 className="text-2xl font-bold mb-6">이용약관</h1>
      <p className="text-sm text-slate-500 mb-8">최종 수정일: 2026-04-17</p>

      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold mt-6">1. 서비스 내용</h2>
        <p>본 서비스는 사용자가 업로드한 보험 약관 PDF를 AI로 분석하여 질의응답을 제공합니다.</p>

        <h2 className="text-lg font-semibold mt-6">2. AI 답변의 책임 한계</h2>
        <p>본 서비스가 제공하는 AI 답변은 참고용입니다. 실제 보험 청구, 법적 판단이 필요한 경우 반드시 보험사 또는 전문가와 상담하시기 바랍니다. AI 답변의 오류로 인한 손실에 대해 서비스 운영자는 책임지지 않습니다.</p>

        <h2 className="text-lg font-semibold mt-6">3. 금지 행위</h2>
        <p>저작권이 있는 문서를 무단으로 업로드하거나, 서비스를 악용하는 행위는 금지됩니다.</p>

        <h2 className="text-lg font-semibold mt-6">4. 서비스 변경 및 중단</h2>
        <p>운영자는 사전 공지 후 서비스 내용을 변경하거나 중단할 수 있습니다.</p>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: 타입 체크**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ui-service
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git add ui-service/app/privacy/ ui-service/app/terms/
git commit -m "feat(ui): add privacy and terms pages for AdSense compliance"
```

---

## Task 3: 랜딩 페이지 컴포넌트 분리 생성

**Files:**
- Create: `ui-service/app/components/LandingNav.tsx`
- Create: `ui-service/app/components/LandingHero.tsx`
- Create: `ui-service/app/components/LandingFeatures.tsx`
- Create: `ui-service/app/components/LandingSteps.tsx`
- Create: `ui-service/app/components/LandingCTA.tsx`
- Create: `ui-service/app/components/LandingFooter.tsx`

- [ ] **Step 1: LandingNav.tsx 생성**

```tsx
import Link from "next/link";

export default function LandingNav() {
  return (
    <nav className="bg-white border-b border-slate-100 h-[60px] flex items-center px-6">
      <Link href="/" className="flex items-center gap-2">
        <div className="w-[30px] h-[30px] bg-gradient-to-br from-blue-700 to-blue-500 rounded-lg flex items-center justify-center text-base">
          🛡️
        </div>
        <span className="font-bold text-[15px] text-slate-800">보험 약관 QA</span>
      </Link>
      <Link
        href="/login"
        className="ml-auto text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-lg transition-colors"
      >
        시작하기
      </Link>
    </nav>
  );
}
```

- [ ] **Step 2: LandingHero.tsx 생성**

```tsx
import Link from "next/link";

export default function LandingHero() {
  return (
    <section className="py-20 px-6 text-center">
      <div className="inline-flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-full text-xs font-semibold text-blue-600 mb-6">
        🤖 AI 기반 약관 분석 서비스
      </div>
      <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 leading-tight">
        복잡한 보험 약관,<br />AI가 쉽게 설명해드립니다
      </h1>
      <p className="text-base text-slate-500 mb-8 max-w-xl mx-auto">
        PDF를 업로드하고 질문하세요. 근거 조항까지 정확하게 알려드립니다.
      </p>
      <Link
        href="/login"
        className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
      >
        무료로 시작하기
      </Link>
    </section>
  );
}
```

- [ ] **Step 3: LandingFeatures.tsx 생성**

```tsx
const features = [
  { icon: "📄", title: "약관 업로드", desc: "PDF 파일을 업로드하면 AI가 자동으로 분석합니다", bg: "bg-blue-50" },
  { icon: "💬", title: "자연어 질문", desc: "전문 용어 없이 편하게 질문하세요", bg: "bg-green-50" },
  { icon: "📌", title: "정확한 근거 제시", desc: "답변의 출처 조항을 정확하게 보여줍니다", bg: "bg-amber-50" },
];

export default function LandingFeatures() {
  return (
    <section className="py-16 px-6 bg-slate-50">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-center text-slate-900 mb-2">주요 기능 안내</h2>
        <p className="text-center text-slate-500 mb-10 text-sm">보험 약관을 이해하는 가장 쉬운 방법</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="bg-white border border-slate-200 rounded-xl p-6 text-center">
              <div className={`w-12 h-12 ${f.bg} rounded-xl flex items-center justify-center text-2xl mx-auto mb-4`}>{f.icon}</div>
              <h3 className="font-bold text-slate-900 mb-2">{f.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: LandingSteps.tsx 생성**

```tsx
const steps = [
  { num: "1", icon: "📤", title: "업로드", desc: "약관 PDF 파일을 업로드합니다" },
  { num: "2", icon: "❓", title: "질문", desc: "궁금한 점을 자연어로 질문합니다" },
  { num: "3", icon: "✅", title: "답변 확인", desc: "근거 조항과 함께 답변을 받습니다" },
];

export default function LandingSteps() {
  return (
    <section className="py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-center text-slate-900 mb-2">간단한 3단계</h2>
        <p className="text-center text-slate-500 mb-10 text-sm">누구나 쉽게 사용할 수 있습니다</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((s) => (
            <div key={s.num} className="text-center">
              <div className="w-14 h-14 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                {s.num}
              </div>
              <div className="text-3xl mb-2">{s.icon}</div>
              <h3 className="font-bold text-slate-900 mb-1">{s.title}</h3>
              <p className="text-sm text-slate-500">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: LandingCTA.tsx 생성**

```tsx
import Link from "next/link";

export default function LandingCTA() {
  return (
    <section className="py-16 px-6">
      <div className="max-w-2xl mx-auto bg-gradient-to-br from-blue-700 to-blue-500 rounded-2xl p-10 text-center text-white">
        <h2 className="text-2xl font-bold mb-2">지금 바로 시작하세요</h2>
        <p className="text-sm opacity-90 mb-6">무료로 약관을 분석해보세요</p>
        <Link
          href="/login"
          className="inline-block bg-white text-blue-600 font-bold px-8 py-3 rounded-xl hover:bg-slate-50 transition-colors"
        >
          Google로 시작하기
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: LandingFooter.tsx 생성**

```tsx
import Link from "next/link";

export default function LandingFooter() {
  return (
    <footer className="border-t border-slate-200 py-8 px-6">
      <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-xs text-slate-400">
          © 2026 보험 약관 QA. All rights reserved.
        </div>
        <div className="flex gap-4 text-xs text-slate-500">
          <Link href="/privacy" className="hover:text-slate-800">개인정보처리방침</Link>
          <Link href="/terms" className="hover:text-slate-800">이용약관</Link>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 7: 타입 체크**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ui-service
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: 에러 없음

- [ ] **Step 8: 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git add ui-service/app/components/Landing*.tsx
git commit -m "feat(ui): add landing page components (nav, hero, features, steps, cta, footer)"
```

---

## Task 4: 랜딩 페이지 조립 (page.tsx) + 로그인 리다이렉트

**Files:**
- Modify: `ui-service/app/page.tsx`

- [ ] **Step 1: page.tsx 전체 교체**

```tsx
import { redirect } from "next/navigation";
import LandingNav from "./components/LandingNav";
import LandingHero from "./components/LandingHero";
import LandingFeatures from "./components/LandingFeatures";
import LandingSteps from "./components/LandingSteps";
import LandingCTA from "./components/LandingCTA";
import LandingFooter from "./components/LandingFooter";
import { createClient } from "./lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-white">
      <LandingNav />
      <main>
        <LandingHero />
        <LandingFeatures />
        <LandingSteps />
        <LandingCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ui-service
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git add ui-service/app/page.tsx
git commit -m "feat(ui): assemble landing page with auth-based redirect to dashboard"
```

---

## Task 5: SEO — metadata, sitemap, robots, JsonLd

**Files:**
- Modify: `ui-service/app/layout.tsx`
- Create: `ui-service/app/sitemap.ts`
- Create: `ui-service/app/robots.ts`
- Create: `ui-service/app/components/JsonLd.tsx`

- [ ] **Step 1: JsonLd.tsx 생성**

```tsx
export default function JsonLd() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "보험 약관 QA",
    description: "AI 기반 보험 약관 질의응답 서비스. PDF를 업로드하고 질문하면 근거 조항과 함께 답변을 제공합니다.",
    url: baseUrl,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
```

- [ ] **Step 2: sitemap.ts 생성**

```typescript
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return [
    { url: baseUrl, lastModified: new Date(), priority: 1.0 },
    { url: `${baseUrl}/login`, lastModified: new Date(), priority: 0.5 },
    { url: `${baseUrl}/privacy`, lastModified: new Date(), priority: 0.1 },
    { url: `${baseUrl}/terms`, lastModified: new Date(), priority: 0.1 },
  ];
}
```

- [ ] **Step 3: robots.ts 생성**

```typescript
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/api/", "/auth/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
```

- [ ] **Step 4: layout.tsx 업데이트 — metadata 확장 + JsonLd 포함**

```tsx
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
```

- [ ] **Step 5: 타입 체크**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ui-service
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git add ui-service/app/layout.tsx ui-service/app/sitemap.ts ui-service/app/robots.ts ui-service/app/components/JsonLd.tsx
git commit -m "feat(ui): add SEO metadata, sitemap, robots, and JSON-LD structured data"
```

---

## Task 6: AdSense 슬롯 + CitationPanel 통합

**Files:**
- Create: `ui-service/app/components/AdSenseSlot.tsx`
- Modify: `ui-service/app/layout.tsx` (AdSense 스크립트 추가)
- Modify: `ui-service/app/components/CitationPanel.tsx`

- [ ] **Step 1: AdSenseSlot.tsx 생성**

`NEXT_PUBLIC_ADSENSE_PUB_ID`와 `NEXT_PUBLIC_ADSENSE_SLOT_ID`가 없으면 렌더링하지 않음. CLS 방지 위해 `min-h-[100px]` 지정.

```tsx
"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export default function AdSenseSlot() {
  const pubId = process.env.NEXT_PUBLIC_ADSENSE_PUB_ID;
  const slotId = process.env.NEXT_PUBLIC_ADSENSE_SLOT_ID;

  useEffect(() => {
    if (!pubId || !slotId) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // AdSense load failure는 무시
    }
  }, [pubId, slotId]);

  if (!pubId || !slotId) return null;

  return (
    <div className="p-3 border-t border-slate-100">
      <div className="min-h-[100px] bg-slate-50 rounded-md overflow-hidden">
        <ins
          className="adsbygoogle"
          style={{ display: "block", minHeight: 100 }}
          data-ad-client={pubId}
          data-ad-slot={slotId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: layout.tsx에 AdSense 스크립트 추가**

기존 `<head>` 섹션에 AdSense 스크립트 추가 (pub ID 있을 때만):

```tsx
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
```

- [ ] **Step 3: CitationPanel.tsx에 AdSenseSlot 추가**

`ui-service/app/components/CitationPanel.tsx`의 두 return 블록(empty 상태, 일반 상태) 각각에 AdSenseSlot을 aside 하단에 추가합니다.

먼저 상단 import 추가:

```tsx
import AdSenseSlot from "./AdSenseSlot";
```

Empty 상태 (citations.length === 0):

```tsx
if (citations.length === 0) {
  return (
    <aside className="w-64 bg-white flex flex-col border-l border-slate-100 flex-shrink-0">
      <div className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
        📌 근거 조항
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-5 text-center">
        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-xl">📋</div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          AI가 답변하면<br />참조한 조항이<br />여기 표시됩니다
        </p>
      </div>
      <AdSenseSlot />
    </aside>
  );
}
```

일반 상태:

```tsx
<aside className="w-64 bg-white flex flex-col border-l border-slate-100 flex-shrink-0">
  {/* 기존 헤더 */}
  {/* 기존 citation 목록 */}
  <AdSenseSlot />
</aside>
```

(citation 목록 `<div className="flex-1 overflow-y-auto p-2.5 space-y-2">...</div>` 바로 다음에 `<AdSenseSlot />`)

- [ ] **Step 4: 타입 체크**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ui-service
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git add ui-service/app/components/AdSenseSlot.tsx ui-service/app/components/CitationPanel.tsx ui-service/app/layout.tsx
git commit -m "feat(ui): add AdSense slot to CitationPanel with CLS prevention"
```

---

## Task 7: Docker/Compose build arg 추가

**Files:**
- Modify: `ui-service/Dockerfile`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Dockerfile에 NEXT_PUBLIC_APP_URL, AdSense build arg 추가**

기존 Dockerfile의 builder 단계에서 `ARG`/`ENV` 블록에 추가:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_ADSENSE_PUB_ID
ARG NEXT_PUBLIC_ADSENSE_SLOT_ID
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_ADSENSE_PUB_ID=$NEXT_PUBLIC_ADSENSE_PUB_ID
ENV NEXT_PUBLIC_ADSENSE_SLOT_ID=$NEXT_PUBLIC_ADSENSE_SLOT_ID
RUN npm run build
```

(나머지 stage-1 블록은 그대로 유지)

- [ ] **Step 2: docker-compose.yml ui-service args 확장**

```yaml
  ui-service:
    build:
      context: ./ui-service
      args:
        NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
        NEXT_PUBLIC_APP_URL: ${NEXT_PUBLIC_APP_URL:-}
        NEXT_PUBLIC_ADSENSE_PUB_ID: ${NEXT_PUBLIC_ADSENSE_PUB_ID:-}
        NEXT_PUBLIC_ADSENSE_SLOT_ID: ${NEXT_PUBLIC_ADSENSE_SLOT_ID:-}
    ports:
      - "3000:3000"
    env_file:
      - ./ui-service/.env.local
    depends_on:
      - ingestion-service
      - query-service
    restart: on-failure
```

`${VAR:-}` 구문은 미설정 시 빈 문자열로 fallback. 로컬에서는 코드의 `|| 'http://localhost:3000'` 작동.

- [ ] **Step 3: 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git add ui-service/Dockerfile docker-compose.yml
git commit -m "chore(docker): add NEXT_PUBLIC_APP_URL and AdSense build args for production deploy"
```

---

## Task 8: 배포 & 검증

**Files:** 코드 변경 없음. 배포 스크립트 실행만.

- [ ] **Step 1: 배포**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
bash scripts/deploy.sh ui-service
```

Expected: ui-service 빌드 성공, 롤아웃 완료, UI 307 응답

- [ ] **Step 2: 랜딩 페이지 검증 (비로그인)**

브라우저에서 http://localhost:3000 접속 (쿠키 삭제 or 시크릿 창). 랜딩 페이지가 보여야 함.

```bash
curl -s http://localhost:3000 | grep -E "복잡한 보험 약관|주요 기능 안내"
```

Expected: 헤드라인과 h2 텍스트 포함

- [ ] **Step 3: SEO 요소 검증**

```bash
# sitemap
curl -s http://localhost:3000/sitemap.xml | head -5

# robots
curl -s http://localhost:3000/robots.txt

# JSON-LD
curl -s http://localhost:3000 | grep -A1 "application/ld+json"
```

Expected: 
- sitemap.xml XML 반환
- robots.txt: `Disallow: /dashboard` 포함
- JSON-LD: SoftwareApplication 스키마 포함

- [ ] **Step 4: 로그인 후 리다이렉트 검증**

Google 로그인 완료 후 http://localhost:3000 접속 → `/dashboard`로 자동 리다이렉트 확인

- [ ] **Step 5: privacy/terms 접속 확인**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/privacy
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/terms
```

Expected: 200, 200

- [ ] **Step 6: 최종 커밋**

```bash
git commit --allow-empty -m "chore: deploy landing page + SEO + AdSense"
```

---

## Self-Review 체크리스트

### 스펙 커버리지

| 스펙 요구사항 | 구현 Task |
|---|---|
| 랜딩 페이지 (`/` 공개) | Task 3, 4 |
| 로그인 사용자 `/` → `/dashboard` 리다이렉트 | Task 4 |
| 대시보드 `/dashboard` 이동 | Task 1 |
| 대시보드 `robots: { index: false }` | Task 1 |
| 시맨틱 HTML h1/h2/h3 | Task 3 (Hero h1, Features h2, 카드 h3) |
| metadata (title, description, og, twitter) | Task 5 |
| JSON-LD (SoftwareApplication) | Task 5 |
| sitemap.xml | Task 5 |
| robots.txt | Task 5 |
| `/privacy` 페이지 | Task 2 |
| `/terms` 페이지 | Task 2 |
| AdSense 슬롯 (CitationPanel 하단, CLS 방지) | Task 6 |
| AdSense env-gated (미설정 시 미렌더링) | Task 6 |
| `NEXT_PUBLIC_APP_URL` build arg | Task 7 |
| `NEXT_PUBLIC_ADSENSE_*` build args | Task 7 |
| middleware public path 확장 | Task 1 |
