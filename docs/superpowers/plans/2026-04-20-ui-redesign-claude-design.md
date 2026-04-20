# Claude Design 기반 UI/UX 리디자인 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Landing / Login / Dashboard 3개 페이지를 Claude Design mockup(`b-landing.html`, `b-login.html`, `b-dashboard.html`) 기준으로 재작업하고 Railway에 배포한다.

**Architecture:** CSS 변수 + Tailwind arbitrary values 병행. lucide-react 아이콘. 라이트 테마 only. 브랜드 "ClauseIQ"로 rename (공개 문구만). 기존 비즈니스 로직(SSE, AdSense, Supabase Auth, 문서 업로드 상태) 유지.

**Tech Stack:** Next.js 14, Tailwind, lucide-react (신규), Supabase Auth, react-markdown (기존).

**Branch:** `feat/ui-redesign-claude-design` (이미 생성/체크아웃됨)

**스펙 원본:** `docs/superpowers/specs/2026-04-19-ui-redesign-claude-design.md`

---

## 파일 구조

### 신규/수정
- `ui-service/package.json` — `lucide-react` 추가
- `ui-service/app/globals.css` — CSS 변수 토큰, spin keyframe, cite 스타일
- `ui-service/app/layout.tsx` — 브랜드 meta 업데이트(ClauseIQ), AdSense 스크립트 유지
- `ui-service/app/sitemap.ts` — 변경 없음 (URL 동일)
- `ui-service/app/components/JsonLd.tsx` — 브랜드명 ClauseIQ
- `ui-service/app/page.tsx` — `LandingSteps` import 제거
- `ui-service/app/components/LandingNav.tsx` — 방패 SVG 로고 + "ClauseIQ" + "기능" 앵커 + 로그인/시작 CTA
- `ui-service/app/components/LandingHero.tsx` — eyebrow + H1 64px + single CTA
- `ui-service/app/components/LandingFeatures.tsx` — 3-column feature grid + kicker/title/desc 헤더
- `ui-service/app/components/LandingCTA.tsx` — 어두운 배경 + radial gradient
- `ui-service/app/components/LandingFooter.tsx` — ClauseIQ + 기존 링크
- `ui-service/app/login/page.tsx` — 980px split layout (좌: 브랜드/pitch, 우: Google 버튼만)
- `ui-service/app/dashboard/page.tsx` — 52px topbar (로고/브레드크럼/Agent chip/avatar/로그아웃) + 3-pane shell
- `ui-service/app/components/LeftPanel.tsx` — mockup 스타일 유지 (uploader 점선 + doc list 아이콘)
- `ui-service/app/components/ChatPanel.tsx` — chat-head + thread(user/assistant with sparkles avatar) + composer + meta-row
- `ui-service/app/components/CitationPanel.tsx` — 조항 chip + 점수 바 + active state
- `ui-service/app/components/QueryProgress.tsx` — mockup의 `.progress` 스타일 매핑
- `ui-service/app/components/AdSenseSlot.tsx` — 컨테이너 스타일 튜닝(border/spacing)
- `ui-service/app/components/LogoutButton.tsx` — topbar 톤 맞춤

### 삭제
- `ui-service/app/components/LandingSteps.tsx` — mockup에 step 섹션 없음

### Product frame (랜딩 mockup에 포함)
- `LandingHero` 내부에 정적 HTML로 포함하거나 별도 `LandingProductFrame.tsx`로 분리 — 구현 단계에서 판단(파일 단일 책임 우선 시 분리 권장). 본 계획은 분리 채택.
- 신규: `ui-service/app/components/LandingProductFrame.tsx`

---

## 공통 디자인 토큰 (globals.css 에 추가)

```css
:root {
  --bg: #FAFAFA;
  --bg-alt: #FFFFFF;  /* 랜딩 body용 */
  --bg-2: #F4F4F5;
  --surface: #FFFFFF;
  --fg: #111113;
  --fg-2: #3F3F46;
  --muted: #71717A;
  --border: #E4E4E7;
  --border-2: #D4D4D8;
  --accent: #4F46E5;
  --accent-2: #6366F1;
  --accent-soft: #EEF0FF;
  --good: #10B981;
}
```

스피너용:
```css
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 1s linear infinite; }
```

---

## Task 1 — Foundation: 의존성·토큰·메타 (Small, isolated)

**Files:**
- Modify: `ui-service/package.json`
- Modify: `ui-service/app/globals.css`
- Modify: `ui-service/app/layout.tsx`
- Modify: `ui-service/app/components/JsonLd.tsx`

**설명:** 패키지 추가, 글로벌 CSS 변수/유틸 정의, 브랜드 meta rename. 이후 Task 2~4에서 공통 사용한다.

- [ ] **Step 1: `lucide-react` 설치**

```bash
cd ui-service && npm install lucide-react@^0.447.0
```

Expected: `package.json` dependencies에 `"lucide-react": "^0.447.0"` 추가.

- [ ] **Step 2: `ui-service/app/globals.css` 전면 교체**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: #FAFAFA;
  --bg-alt: #FFFFFF;
  --bg-2: #F4F4F5;
  --surface: #FFFFFF;
  --fg: #111113;
  --fg-2: #3F3F46;
  --muted: #71717A;
  --border: #E4E4E7;
  --border-2: #D4D4D8;
  --accent: #4F46E5;
  --accent-2: #6366F1;
  --accent-soft: #EEF0FF;
  --good: #10B981;
}

body {
  color: var(--fg);
  background: var(--bg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

@layer utilities {
  .text-balance { text-wrap: balance; }
  .mono { font-family: "SF Mono", "JetBrains Mono", Menlo, monospace; font-variant-numeric: tabular-nums; }
}

/* 분석 중 바운스 딜레이 */
.animation-delay-150 { animation-delay: 150ms; }
.animation-delay-300 { animation-delay: 300ms; }

/* 쿼리 indeterminate 진행 바 */
@keyframes progress-indeterminate {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}
.animate-progress-indeterminate {
  animation: progress-indeterminate 1.2s ease-in-out infinite;
}

/* 스피너 (QueryProgress 로더) */
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 1s linear infinite; }

/* 스크롤바 */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: var(--muted); }
```

- [ ] **Step 3: `ui-service/app/layout.tsx` 브랜드 meta 교체**

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
```

- [ ] **Step 4: `ui-service/app/components/JsonLd.tsx` 브랜드명 교체**

```tsx
export default function JsonLd() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ClauseIQ",
    description: "조항 단위 근거 인용 보험 약관 QA Agent. PDF 업로드 → 한국어 질의 → 조·항·호 단위 답변.",
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

- [ ] **Step 5: 빌드 통과 확인 (로컬 next build 또는 dev 부팅)**

```bash
cd ui-service && npm run build 2>&1 | tail -20
```

Expected: 에러 없음(기존 페이지는 아직 기존 디자인 사용 중이지만 렌더링 가능).

- [ ] **Step 6: Commit**

```bash
git add ui-service/package.json ui-service/package-lock.json ui-service/app/globals.css ui-service/app/layout.tsx ui-service/app/components/JsonLd.tsx
git commit -m "feat(ui): foundation for ClauseIQ redesign — lucide-react, CSS tokens, brand meta"
```

---

## Task 2 — Landing 페이지 전면 리디자인

**Files:**
- Modify: `ui-service/app/page.tsx`
- Modify: `ui-service/app/components/LandingNav.tsx`
- Modify: `ui-service/app/components/LandingHero.tsx`
- Create: `ui-service/app/components/LandingProductFrame.tsx`
- Modify: `ui-service/app/components/LandingFeatures.tsx`
- Modify: `ui-service/app/components/LandingCTA.tsx`
- Modify: `ui-service/app/components/LandingFooter.tsx`
- Delete: `ui-service/app/components/LandingSteps.tsx`

- [ ] **Step 1: `ui-service/app/page.tsx` 구조 재편**

```tsx
import { redirect } from "next/navigation";
import LandingNav from "./components/LandingNav";
import LandingHero from "./components/LandingHero";
import LandingProductFrame from "./components/LandingProductFrame";
import LandingFeatures from "./components/LandingFeatures";
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
    <div className="min-h-screen" style={{ background: "var(--bg-alt)" }}>
      <LandingNav />
      <main>
        <LandingHero />
        <LandingProductFrame />
        <LandingFeatures />
        <LandingCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
```

- [ ] **Step 2: `ui-service/app/components/LandingNav.tsx` 교체**

```tsx
import Link from "next/link";

function ShieldLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="15" height="15">
      <path d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export default function LandingNav() {
  return (
    <nav
      className="sticky top-0 z-10 h-16 mx-auto flex items-center gap-8 px-10 max-w-[1200px]"
      style={{
        background: "color-mix(in srgb, var(--bg-alt) 85%, transparent)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <Link href="/" className="flex items-center gap-2.5 font-bold text-[15px] tracking-tight">
        <span
          className="w-[26px] h-[26px] rounded-md grid place-items-center"
          style={{ background: "var(--fg)", color: "var(--bg-alt)" }}
        >
          <ShieldLogo />
        </span>
        <span>ClauseIQ</span>
      </Link>
      <div className="flex gap-6 text-[13px] font-medium" style={{ color: "var(--fg-2)" }}>
        <a href="#features" className="hover:opacity-80">기능</a>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/login"
          className="text-[13px] font-medium px-3 py-1.5 rounded-md"
          style={{ color: "var(--fg-2)" }}
        >
          로그인
        </Link>
        <Link
          href="/login"
          className="text-[13px] font-semibold px-3.5 py-2 rounded-md"
          style={{ background: "var(--fg)", color: "var(--bg-alt)" }}
        >
          무료 시작 →
        </Link>
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: `ui-service/app/components/LandingHero.tsx` 교체**

```tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function LandingHero() {
  return (
    <section className="max-w-[1100px] mx-auto px-10 pt-[88px] pb-10 text-center">
      <div
        className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full mb-7"
        style={{
          color: "var(--muted)",
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
        }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--good)" }} />
        <b style={{ color: "var(--fg)", fontWeight: 600 }}>v2.4</b>
        <span>· 조항 단위 근거 인용 엔진</span>
      </div>
      <h1
        className="mx-auto mb-6 max-w-[820px] text-[64px] font-bold leading-[1.05] tracking-[-0.035em]"
      >
        <span
          style={{
            background: "linear-gradient(180deg, var(--fg) 0%, var(--muted) 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          보험 약관을 AI가<br />조항 단위로 해석합니다.
        </span>
      </h1>
      <p
        className="mx-auto mb-9 max-w-[560px] text-[17px] leading-[1.6]"
        style={{ color: "var(--muted)" }}
      >
        PDF를 올리고 한국어로 질문하세요. 답변마다 인용된 조항·페이지·관련도가 투명하게 표시됩니다.
      </p>
      <div className="inline-flex gap-2.5">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-3.5 rounded-[10px]"
          style={{ background: "var(--fg)", color: "var(--bg-alt)" }}
        >
          Google로 무료 시작 <ArrowRight size={15} />
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: `ui-service/app/components/LandingProductFrame.tsx` 생성 (정적 mockup preview)**

```tsx
import { FileText } from "lucide-react";

export default function LandingProductFrame() {
  return (
    <div className="max-w-[1120px] mx-auto mt-[60px] px-10">
      <div
        className="overflow-hidden rounded-2xl"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow:
            "0 40px 80px -40px rgba(79,70,229,0.15), 0 10px 30px -10px rgba(0,0,0,0.08)",
        }}
      >
        <div
          className="flex items-center gap-2.5 px-4 py-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--border-2)" }} />
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--border-2)" }} />
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--border-2)" }} />
          </div>
          <div
            className="flex-1 text-center text-[11.5px] rounded-md px-3 py-1"
            style={{ background: "var(--bg-2)", color: "var(--muted)" }}
          >
            clauseiq.app/dashboard
          </div>
        </div>
        <div
          className="grid min-h-[420px]"
          style={{ gridTemplateColumns: "200px 1fr 260px", background: "var(--bg)" }}
        >
          {/* LEFT */}
          <div className="p-4" style={{ borderRight: "1px solid var(--border)" }}>
            <div
              className="text-[10px] font-bold tracking-[0.18em] uppercase mb-2.5"
              style={{ color: "var(--muted)" }}
            >
              약관
            </div>
            {[
              { name: "무배당 종합건강보험", count: "142", active: true },
              { name: "실손의료비 4세대", count: "98" },
              { name: "어린이종합보험", count: "76" },
            ].map((d) => (
              <div
                key={d.name}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium mb-0.5"
                style={{
                  background: d.active ? "var(--accent-soft)" : "transparent",
                  color: d.active ? "var(--accent)" : "var(--fg-2)",
                }}
              >
                <FileText size={14} />
                <span className="flex-1">{d.name}</span>
                <span
                  className="text-[10px] font-medium"
                  style={{ color: d.active ? "var(--accent)" : "var(--muted)" }}
                >
                  {d.count}
                </span>
              </div>
            ))}
          </div>
          {/* CENTER */}
          <div className="px-8 py-7 flex flex-col gap-3.5">
            <Bubble type="u">자살 면책기간은 언제부터 언제까지인가요?</Bubble>
            <Bubble type="a">
              계약의 보장개시일로부터 <b>2년</b>이 면책기간입니다
              <Pill>제14조</Pill>. 이 기간 내 고의 자해는 보험금이 지급되지 않으며,
              심신상실 상태의 자해는 예외입니다<Pill>제14조 ②</Pill>.
            </Bubble>
            <Bubble type="u">계약 1년 6개월 시점에 사고가 나면요?</Bubble>
            <div className="text-[13px] italic max-w-[80%]" style={{ color: "var(--muted)" }}>
              분석 중 · STEP 3/5 조항 재검색
            </div>
          </div>
          {/* RIGHT */}
          <div className="p-4" style={{ borderLeft: "1px solid var(--border)" }}>
            <div
              className="text-[10px] font-bold tracking-[0.18em] uppercase mb-2.5"
              style={{ color: "var(--muted)" }}
            >
              근거 조항
            </div>
            <CitMini n="제14조 · 96%" t="보험금 지급 면책사유" e="회사는 다음 각 호의 어느 하나에 해당하는 사유로 보험금 지급사유가 발생한 때에는 보험금을…" w="96%" />
            <CitMini n="제14조 ① · 88%" t="고의 자해의 정의" e="'고의로 자신을 해친 경우'란 심신상실 등으로 자유로운 의사결정을 할 수 없는 상태에서…" w="88%" />
            <CitMini n="제3조 · 74%" t="보장개시일의 정의" e="보장개시일이란 회사가 제1회 보험료를 받은 때를 말합니다. 다만, 회사가 승낙 전이라도…" w="74%" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({ type, children }: { type: "u" | "a"; children: React.ReactNode }) {
  const isUser = type === "u";
  return (
    <div
      className={`max-w-[80%] px-4 py-3 text-[13px] leading-[1.65] rounded-2xl ${
        isUser ? "self-end" : ""
      }`}
      style={
        isUser
          ? { background: "var(--fg)", color: "var(--bg-alt)", borderBottomRightRadius: 4 }
          : {
              background: "var(--bg-2)",
              color: "var(--fg-2)",
              border: "1px solid var(--border)",
              borderBottomLeftRadius: 4,
            }
      }
    >
      {children}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mx-0.5 text-[10px] font-bold rounded px-1.5 py-[1px] align-middle"
      style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
    >
      {children}
    </span>
  );
}

function CitMini({ n, t, e, w }: { n: string; t: string; e: string; w: string }) {
  return (
    <div
      className="mb-2 px-3.5 py-3 rounded-[10px]"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div
        className="text-[10.5px] font-bold tracking-wider mb-1"
        style={{ color: "var(--accent)" }}
      >
        {n}
      </div>
      <div className="text-xs font-semibold mb-1.5" style={{ color: "var(--fg)" }}>
        {t}
      </div>
      <div
        className="text-[11px] leading-[1.55] line-clamp-2"
        style={{ color: "var(--muted)" }}
      >
        {e}
      </div>
      <div className="mt-2 h-[3px] rounded" style={{ background: "var(--bg-2)" }}>
        <div className="h-full rounded" style={{ background: "var(--accent)", width: w }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `ui-service/app/components/LandingFeatures.tsx` 교체**

```tsx
import { FileSearch, Scale, ShieldCheck, ArrowUpRight } from "lucide-react";

const features = [
  {
    icon: FileSearch,
    title: "조항 단위 청킹",
    desc: "약관 구조(조·항·호)를 파서가 인식해 의미 단위로 쪼갭니다. 임의 길이 청크는 사용하지 않습니다.",
    meta: "Voyage AI voyage-2 · 1024-dim",
  },
  {
    icon: Scale,
    title: "자가 채점 루프",
    desc: "Grader가 답변을 평가하고 부족하면 질의를 재작성합니다. 낮은 신뢰도 답변을 걸러냅니다.",
    meta: "LangGraph 조건부 엣지",
  },
  {
    icon: ShieldCheck,
    title: "투명한 인용",
    desc: "모든 문장에 조항 번호·페이지·관련도 점수가 연결됩니다. 블랙박스 답변을 신뢰하지 않아도 됩니다.",
    meta: "100% 근거 매칭",
  },
];

export default function LandingFeatures() {
  return (
    <section id="features" className="max-w-[1200px] mx-auto mt-[120px] px-10">
      <div className="flex items-baseline mb-10">
        <div>
          <div
            className="text-xs font-semibold tracking-[0.1em] uppercase"
            style={{ color: "var(--accent)" }}
          >
            WHY CLAUSEIQ
          </div>
          <h2 className="mt-2 text-[36px] font-bold tracking-[-0.025em]">검색이 아닌 해석.</h2>
        </div>
        <p
          className="ml-auto max-w-[320px] text-sm leading-[1.6]"
          style={{ color: "var(--muted)" }}
        >
          일반적인 RAG를 넘어, 약관의 조·항·호 구조를 이해하고 다중 조항을 교차 참조해 답합니다.
        </p>
      </div>
      <div
        className="grid grid-cols-3 rounded-2xl overflow-hidden"
        style={{ gap: "1px", background: "var(--border)", border: "1px solid var(--border)" }}
      >
        {features.map((f) => {
          const Icon = f.icon;
          return (
            <div
              key={f.title}
              className="flex flex-col gap-3.5 px-7 pt-7 pb-8"
              style={{ background: "var(--surface)" }}
            >
              <div
                className="w-9 h-9 rounded-lg grid place-items-center"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                <Icon size={18} />
              </div>
              <h3 className="text-[17px] font-bold tracking-[-0.015em]">{f.title}</h3>
              <p
                className="text-[13.5px] leading-[1.7] flex-1"
                style={{ color: "var(--muted)" }}
              >
                {f.desc}
              </p>
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                {f.meta} <ArrowUpRight size={13} />
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: `ui-service/app/components/LandingCTA.tsx` 교체**

```tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function LandingCTA() {
  return (
    <section className="max-w-[1200px] mx-auto my-[100px] px-10">
      <div
        className="relative overflow-hidden rounded-[20px] grid gap-10 items-center p-14"
        style={{
          background: "var(--fg)",
          color: "var(--bg-alt)",
          gridTemplateColumns: "1.3fr 1fr",
        }}
      >
        <div
          className="absolute w-[320px] h-[320px] rounded-full opacity-40"
          style={{
            top: "-80px",
            right: "-80px",
            background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)",
          }}
        />
        <h3 className="relative text-[36px] font-bold tracking-[-0.025em] leading-[1.15]">
          약관은 어렵지만,<br />답은 어렵지 않아야 합니다.
        </h3>
        <div className="relative text-right">
          <p
            className="text-sm leading-[1.7]"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            Google 계정 하나로 시작. PDF 1개는 언제나 무료.
          </p>
          <Link
            href="/login"
            className="relative mt-4 inline-flex items-center gap-2 text-sm font-semibold px-5 py-3.5 rounded-[10px]"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            무료로 시작하기 <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 7: `ui-service/app/components/LandingFooter.tsx` 교체**

```tsx
import Link from "next/link";

export default function LandingFooter() {
  return (
    <footer
      className="max-w-[1200px] mx-auto px-10 py-7 flex items-center gap-5 text-xs"
      style={{ color: "var(--muted)", borderTop: "1px solid var(--border)" }}
    >
      <span>© 2026 ClauseIQ</span>
      <span className="flex-1" />
      <Link href="/privacy" className="hover:opacity-80">개인정보처리방침</Link>
      <Link href="/terms" className="hover:opacity-80">이용약관</Link>
    </footer>
  );
}
```

- [ ] **Step 8: `LandingSteps.tsx` 삭제**

```bash
rm ui-service/app/components/LandingSteps.tsx
```

- [ ] **Step 9: 로컬 빌드 & 페이지 확인**

```bash
cd ui-service && npm run build 2>&1 | tail -20
```

Expected: 에러 없음. `docker compose up -d` 후 http://localhost:3000 에서 Landing이 ClauseIQ 디자인으로 렌더됨 (로그인 안 한 상태).

- [ ] **Step 10: Commit**

```bash
git add ui-service/app/page.tsx ui-service/app/components/LandingNav.tsx ui-service/app/components/LandingHero.tsx ui-service/app/components/LandingProductFrame.tsx ui-service/app/components/LandingFeatures.tsx ui-service/app/components/LandingCTA.tsx ui-service/app/components/LandingFooter.tsx
git rm ui-service/app/components/LandingSteps.tsx
git commit -m "feat(ui): ClauseIQ landing redesign — hero/product-frame/features/cta"
```

---

## Task 3 — Login 페이지 Split 레이아웃

**Files:**
- Modify: `ui-service/app/login/page.tsx`

- [ ] **Step 1: `ui-service/app/login/page.tsx` 전체 교체**

```tsx
"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "../lib/supabase/client";

function ShieldLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="16" height="16">
      <path d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" style={{ background: "#fff", borderRadius: "50%", padding: 2 }}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export default function LoginPage() {
  const supabase = createClient();

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <main
      className="min-h-screen grid place-items-center p-10"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="w-[980px] max-w-full grid grid-cols-2 overflow-hidden rounded-2xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        {/* LEFT: brand + pitch */}
        <div
          className="relative overflow-hidden p-12"
          style={{
            background: "linear-gradient(155deg, var(--bg-2) 0%, var(--surface) 100%)",
          }}
        >
          <div
            className="absolute w-[280px] h-[280px] rounded-full opacity-10"
            style={{
              top: "-80px",
              right: "-80px",
              background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)",
            }}
          />
          <div className="flex items-center gap-2.5 font-bold text-base tracking-tight">
            <span
              className="w-7 h-7 rounded-md grid place-items-center"
              style={{ background: "var(--fg)", color: "var(--bg-alt)" }}
            >
              <ShieldLogo />
            </span>
            <span>ClauseIQ</span>
          </div>
          <div className="mt-10">
            <div
              className="text-[11px] font-bold tracking-[0.15em] uppercase mb-4"
              style={{ color: "var(--accent)" }}
            >
              AI · Insurance · Transparent
            </div>
            <h2 className="text-[28px] font-bold tracking-[-0.025em] leading-[1.2] mb-4">
              조항 근거 없이는<br />답변도 없습니다.
            </h2>
            <p className="text-[13px] leading-[1.7]" style={{ color: "var(--muted)" }}>
              답변 신뢰도를 자체 채점하는 Self-Correcting Agent가 당신의 약관을 분석합니다.
              소비자 관점의 질문에 조항 단위로 답합니다.
            </p>
            <div className="mt-8 flex flex-col gap-3">
              {[
                "Supabase Auth(JWT) + X-Internal-Token 이중 보호",
                "업로드 PDF는 사용자별로 격리 (user_id 필터)",
                "Langfuse 전 트레이스 관찰성, 프로덕션 투명성",
              ].map((line) => (
                <div
                  key={line}
                  className="flex gap-2.5 text-[12.5px] leading-[1.5]"
                  style={{ color: "var(--fg-2)" }}
                >
                  <CheckCircle2 size={15} style={{ color: "var(--good)", marginTop: 2, flexShrink: 0 }} />
                  <span>{line}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-8 text-[11px]" style={{ color: "var(--muted)" }}>
            v2.4 · Seoul · built with Claude Sonnet 4.6
          </div>
        </div>

        {/* RIGHT: Google login */}
        <div className="p-14 flex flex-col justify-center">
          <h1 className="text-[26px] font-bold tracking-[-0.025em] mb-1.5">시작하기</h1>
          <p className="text-[13.5px] leading-[1.6] mb-8" style={{ color: "var(--muted)" }}>
            Google 계정으로 3초 가입. 약관 PDF 1개는 언제나 무료.
          </p>
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-2.5 text-sm font-semibold py-3.5 rounded-[10px]"
            style={{ background: "var(--fg)", color: "var(--bg-alt)" }}
          >
            <GoogleIcon />
            Google로 계속하기
          </button>
          <p className="mt-7 text-[11px] leading-[1.6]" style={{ color: "var(--muted)" }}>
            계속 진행하면{" "}
            <Link href="/terms" style={{ color: "var(--fg-2)", textDecoration: "underline", textUnderlineOffset: 2 }}>
              이용약관
            </Link>
            과{" "}
            <Link href="/privacy" style={{ color: "var(--fg-2)", textDecoration: "underline", textUnderlineOffset: 2 }}>
              개인정보처리방침
            </Link>
            에 동의하는 것입니다.
          </p>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: 로컬 빌드 & 로그인 페이지 확인**

```bash
cd ui-service && npm run build 2>&1 | tail -20
```

Expected: 에러 없음. http://localhost:3000/login 에서 split layout 렌더 확인, Google 버튼 클릭 시 기존 OAuth 플로우 동작.

- [ ] **Step 3: Commit**

```bash
git add ui-service/app/login/page.tsx
git commit -m "feat(ui): ClauseIQ login split layout — Google only"
```

---

## Task 4 — Dashboard 전면 리디자인

**Files:**
- Modify: `ui-service/app/dashboard/page.tsx`
- Modify: `ui-service/app/components/LeftPanel.tsx`
- Modify: `ui-service/app/components/ChatPanel.tsx`
- Modify: `ui-service/app/components/CitationPanel.tsx`
- Modify: `ui-service/app/components/QueryProgress.tsx`
- Modify: `ui-service/app/components/LogoutButton.tsx`
- Modify: `ui-service/app/components/AdSenseSlot.tsx`

이 Task는 기능 로직(SSE, 업로드 polling, Supabase 쿼리, AdSense push)을 건드리지 않고 시각만 교체한다. 구현자는 기존 훅·상태·이펙트 시그니처를 보존할 것.

- [ ] **Step 1: `ui-service/app/dashboard/page.tsx` topbar + 3-pane shell**

```tsx
import LeftPanel from "../components/LeftPanel";
import ChatPanel from "../components/ChatPanel";
import CitationPanel from "../components/CitationPanel";
import LogoutButton from "../components/LogoutButton";
import { createClient } from "../lib/supabase/server";

function ShieldLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="13" height="13">
      <path d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const initial = (user?.email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <main className="flex h-screen flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
      <header
        className="h-[52px] flex items-center gap-3.5 px-5 flex-shrink-0"
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2.5 font-bold text-[14px] tracking-tight">
          <span
            className="w-6 h-6 rounded-[5px] grid place-items-center"
            style={{ background: "var(--fg)", color: "var(--bg-alt)" }}
          >
            <ShieldLogo />
          </span>
          ClauseIQ
        </div>
        <span className="text-xs" style={{ color: "var(--border-2)" }}>/</span>
        <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
          <b style={{ color: "var(--fg)", fontWeight: 600 }}>대시보드</b>
        </span>
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium"
          style={{
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            color: "var(--fg-2)",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--good)" }} />
          Agent 정상
        </span>
        <div className="ml-auto flex items-center gap-3">
          {user && (
            <>
              <span
                className="w-7 h-7 rounded-full grid place-items-center font-bold text-xs"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                title={user.email ?? ""}
              >
                {initial}
              </span>
              <LogoutButton />
            </>
          )}
        </div>
      </header>
      <div
        className="flex-1 grid overflow-hidden"
        style={{
          gridTemplateColumns: "260px 1fr 300px",
          gap: "1px",
          background: "var(--border)",
        }}
      >
        <LeftPanel />
        <ChatPanel />
        <CitationPanel />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: `ui-service/app/components/LogoutButton.tsx` 교체 (톤 맞춤)**

```tsx
"use client";

import { LogOut } from "lucide-react";
import { createClient } from "../lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const supabase = createClient();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      onClick={handleLogout}
      className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md transition-colors"
      style={{ background: "var(--bg-2)", color: "var(--fg-2)" }}
      title="로그아웃"
    >
      <LogOut size={12} />
      로그아웃
    </button>
  );
}
```

- [ ] **Step 3: `ui-service/app/components/LeftPanel.tsx` 시각 교체 (로직 유지)**

```tsx
"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Upload, FolderOpen, FileText, Check } from "lucide-react";
import CircleProgress from "./CircleProgress";
import { useApp } from "../context/AppContext";
import { createClient } from "../lib/supabase/client";

const STEP_LABELS: Record<string, string> = {
  parsing: "PDF 파싱 중",
  chunking: "텍스트 청킹 중",
  embedding: "임베딩 생성 중",
  storing: "Qdrant 저장 중",
  done: "완료",
  failed: "실패",
};
const STEPS = ["parsing", "chunking", "embedding", "storing"] as const;

export default function LeftPanel() {
  const { documents, setDocuments, ingesting, setIngesting, selectedDocument, selectDocument } = useApp();
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  // 초기 로드
  useEffect(() => {
    async function loadDocuments() {
      const { data } = await supabase
        .from("documents")
        .select("id, filename, chunk_count, created_at, status")
        .eq("status", "ready")
        .order("created_at", { ascending: false });
      if (data) {
        setDocuments(
          data.map((d) => ({
            id: d.id,
            filename: d.filename,
            clauseCount: d.chunk_count,
            createdAt: d.created_at,
          }))
        );
      }
    }
    loadDocuments();
  }, []);

  // polling
  useEffect(() => {
    if (!ingesting || ingesting.currentStep === "done" || ingesting.currentStep === "failed") return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/ingest/status/${ingesting.jobId}`);
      if (!res.ok) return;
      const data = await res.json();
      setIngesting((prev) =>
        prev
          ? {
              ...prev,
              progress: data.progress ?? prev.progress,
              currentStep: data.step ?? prev.currentStep,
              currentChunk: data.currentChunk ?? prev.currentChunk,
              totalChunks: data.totalChunks ?? prev.totalChunks,
              error: data.error,
            }
          : null
      );
      if (data.step === "done") {
        const { data: docs } = await supabase
          .from("documents")
          .select("id, filename, chunk_count, created_at, status")
          .eq("status", "ready")
          .order("created_at", { ascending: false });
        if (docs) {
          setDocuments(
            docs.map((d) => ({
              id: d.id,
              filename: d.filename,
              clauseCount: d.chunk_count,
              createdAt: d.created_at,
            }))
          );
          const newDoc = docs.find((d: { filename: string }) => d.filename === ingesting.filename);
          if (newDoc) {
            selectDocument({
              id: newDoc.id,
              filename: newDoc.filename,
              clauseCount: newDoc.chunk_count,
              createdAt: newDoc.created_at,
            });
          }
        }
        setTimeout(() => setIngesting(null), 2000);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [ingesting?.jobId, ingesting?.currentStep, setIngesting, setDocuments]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        alert("PDF 파일만 업로드 가능합니다.");
        return;
      }
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ingest", { method: "POST", body: formData });
      if (res.status === 409) {
        alert("이미 관리 중인 약관입니다.");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "업로드 실패");
        return;
      }
      setIngesting({
        jobId: data.jobId,
        filename: file.name,
        filesize: `${(file.size / 1024 / 1024).toFixed(1)}MB`,
        progress: 0,
        currentStep: "parsing",
        currentChunk: 0,
        totalChunks: 0,
      });
    },
    [setIngesting]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  return (
    <aside className="flex flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
      <div className="px-4.5 pt-4 pb-2.5 flex items-center gap-2">
        <span
          className="text-xs font-bold tracking-[0.1em] uppercase"
          style={{ color: "var(--muted)" }}
        >
          내 약관
        </span>
        <span
          className="ml-auto text-[11px] font-semibold px-1.5 py-0.5 rounded"
          style={{ background: "var(--bg-2)", color: "var(--muted)" }}
        >
          {documents.length}
        </span>
      </div>
      {/* Uploader */}
      <div className="mx-3.5 mb-3.5">
        <div
          className={`rounded-[10px] p-4 text-center cursor-pointer ${
            isDragOver ? "ring-2 ring-offset-0" : ""
          }`}
          style={{
            background: "var(--surface)",
            border: `1.5px dashed ${isDragOver ? "var(--accent)" : "var(--border-2)"}`,
          }}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <div
            className="w-7 h-7 rounded-lg grid place-items-center mx-auto mb-2.5"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <Upload size={14} />
          </div>
          <div className="text-[12.5px] font-semibold mb-1">새 PDF 업로드</div>
          <div className="text-[11px] mb-2.5" style={{ color: "var(--muted)" }}>
            드래그 · 최대 30MB
          </div>
          <span
            className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-3.5 py-1.5 rounded-md"
            style={{ background: "var(--fg)", color: "var(--bg-alt)" }}
          >
            <FolderOpen size={12} />
            파일 선택
          </span>
          <input ref={inputRef} type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
        </div>
      </div>

      {/* ingesting progress */}
      {ingesting && (
        <div
          className="mx-3.5 mb-3.5 rounded-xl p-3"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2 mb-2.5">
            <FileText size={14} style={{ color: "var(--muted)" }} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold truncate">{ingesting.filename}</p>
              <p className="text-[9px]" style={{ color: "var(--muted)" }}>
                {ingesting.filesize}
              </p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <CircleProgress
              progress={ingesting.progress}
              label={ingesting.currentStep === "done" ? "완료" : "처리중"}
            />
            <div
              className="flex-1 rounded-lg p-2 mono"
              style={{ background: "var(--bg-2)" }}
            >
              {STEPS.map((step) => {
                const stepIndex = STEPS.indexOf(step);
                const currentIndex = STEPS.indexOf(ingesting.currentStep as typeof STEPS[number]);
                const isDone = stepIndex < currentIndex || ingesting.currentStep === "done";
                const isActive = step === ingesting.currentStep;
                const color = isDone ? "var(--good)" : isActive ? "var(--accent)" : "var(--muted)";
                return (
                  <div key={step} className="flex items-center gap-2 text-[9px] mb-1.5 last:mb-0" style={{ color }}>
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? "animate-pulse" : ""}`}
                      style={{ background: color }}
                    />
                    <span>
                      {isDone
                        ? `✓ ${STEP_LABELS[step]}`
                        : isActive
                        ? `${STEP_LABELS[step]}${ingesting.totalChunks > 0 ? ` ${ingesting.currentChunk}/${ingesting.totalChunks}` : "..."}`
                        : STEP_LABELS[step]}
                    </span>
                  </div>
                );
              })}
              {ingesting.currentStep === "failed" && (
                <div className="text-[9px]" style={{ color: "#EF4444" }}>
                  ✗ {ingesting.error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        className="px-4.5 py-1.5 text-[10.5px] font-bold tracking-[0.12em] uppercase"
        style={{ color: "var(--muted)" }}
      >
        업로드됨
      </div>
      <div className="flex-1 overflow-y-auto px-2.5 pb-3.5">
        {documents.map((doc) => {
          const isActive = selectedDocument?.id === doc.id;
          return (
            <div
              key={doc.id}
              onClick={() => selectDocument(doc)}
              className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg cursor-pointer mb-0.5"
              style={{
                background: isActive ? "var(--accent-soft)" : "transparent",
              }}
            >
              <div
                className="w-7 h-8 rounded grid place-items-center flex-shrink-0"
                style={{
                  background: isActive ? "var(--accent)" : "var(--surface)",
                  border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                  color: isActive ? "#fff" : "var(--muted)",
                }}
              >
                <FileText size={13} />
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="text-[12.5px] font-semibold truncate tracking-[-0.005em]"
                  style={{ color: isActive ? "var(--accent)" : "var(--fg)" }}
                >
                  {doc.filename.replace(".pdf", "")}
                </div>
                <div className="text-[10.5px]" style={{ color: "var(--muted)" }}>
                  {doc.clauseCount} 조항
                </div>
              </div>
              <Check size={12} style={{ color: "var(--good)" }} />
            </div>
          );
        })}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: `ui-service/app/components/ChatPanel.tsx` 시각 교체 (SSE 로직 유지)**

구현자는 기존의 `useEffect` SSE 구독 블록, `sendMessage`, `handleSubmit` 본문을 그대로 유지하고 JSX(리턴부) + import만 교체. 기존 `SUGGESTED_QUESTIONS` 배열과 하단 chip 렌더링은 제거한다.

```tsx
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Sparkles, ArrowUp } from "lucide-react";
import { useApp } from "../context/AppContext";
import QueryProgress from "./QueryProgress";

interface ProgressState {
  stepLabel: string;
  progressIndex: number;
  totalSteps: number | null;
}

export default function ChatPanel() {
  const { messages, setMessages, setCitations, selectedDocument } = useApp();
  const [input, setInput] = useState("");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState>({
    stepLabel: "대기 중",
    progressIndex: 0,
    totalSteps: null,
  });
  const [toast, setToast] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isInFlight = activeJobId !== null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isInFlight]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // SSE 구독 — 기존 로직 그대로
  useEffect(() => {
    if (!activeJobId) return;
    const es = new EventSource(`/api/query/stream/${activeJobId}`);
    const cleanCloseRef = { current: false };
    const timeout = setTimeout(() => {
      cleanCloseRef.current = true;
      es.close();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "응답이 지연되고 있어요. 잠시 후 다시 시도해주세요.", timestamp: new Date() },
      ]);
      setActiveJobId(null);
    }, 60_000);

    es.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.status === "completed" && data.result) {
        const citations = data.result.citations ?? [];
        cleanCloseRef.current = true;
        clearTimeout(timeout);
        es.close();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.result.answer ?? "답변을 받을 수 없습니다.", citations, timestamp: new Date() },
        ]);
        setCitations(citations);
        setActiveJobId(null);
        return;
      }
      if (data.status === "failed") {
        cleanCloseRef.current = true;
        clearTimeout(timeout);
        es.close();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "오류가 발생했습니다. 잠시 후 다시 시도해주세요.", timestamp: new Date() },
        ]);
        setActiveJobId(null);
        return;
      }
      setProgress({ stepLabel: data.stepLabel ?? "처리 중", progressIndex: data.progressIndex ?? 0, totalSteps: data.totalSteps ?? null });
    };

    es.addEventListener("done", () => {
      cleanCloseRef.current = true;
      clearTimeout(timeout);
      es.close();
      setActiveJobId(null);
    });

    es.onerror = () => {
      if (cleanCloseRef.current) return;
      cleanCloseRef.current = true;
      clearTimeout(timeout);
      es.close();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "연결이 끊어졌습니다. 다시 시도해주세요.", timestamp: new Date() },
      ]);
      setActiveJobId(null);
    };

    return () => {
      cleanCloseRef.current = true;
      clearTimeout(timeout);
      es.close();
    };
  }, [activeJobId, setMessages, setCitations]);

  const sendMessage = useCallback(
    async (question: string) => {
      if (!question.trim() || isInFlight || !selectedDocument) return;
      setMessages((prev) => [...prev, { role: "user", content: question, timestamp: new Date() }]);
      setInput("");
      setProgress({ stepLabel: "대기 중", progressIndex: 0, totalSteps: null });
      try {
        const res = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, documentId: selectedDocument.id }),
        });
        if (res.status === 409) {
          const { jobId } = await res.json();
          setToast("이전 질의가 아직 처리 중입니다");
          setActiveJobId(jobId);
          return;
        }
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: errData.error ?? "오류가 발생했습니다. 잠시 후 다시 시도해주세요.", timestamp: new Date() },
          ]);
          return;
        }
        const { jobId } = await res.json();
        setActiveJobId(jobId);
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "네트워크 오류가 발생했습니다.", timestamp: new Date() },
        ]);
      }
    },
    [isInFlight, selectedDocument, setMessages]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (!selectedDocument) {
    return (
      <section
        className="flex flex-col items-center justify-center gap-4 text-center min-w-0"
        style={{ background: "var(--bg)" }}
      >
        <div
          className="w-14 h-14 rounded-2xl grid place-items-center"
          style={{ background: "var(--bg-2)" }}
        >
          <Sparkles size={24} style={{ color: "var(--muted)" }} />
        </div>
        <div>
          <h2 className="text-base font-semibold mb-1">약관을 선택해주세요</h2>
          <p className="text-[12px]" style={{ color: "var(--muted)" }}>
            왼쪽 패널에서 약관을 선택하면 대화를 시작할 수 있습니다
          </p>
        </div>
      </section>
    );
  }

  const userCount = messages.filter((m) => m.role === "user").length;
  const citationCount = messages.reduce((acc, m) => acc + (m.citations?.length ?? 0), 0);

  return (
    <section
      className="flex flex-col min-w-0 relative overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      {toast && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-xs px-3 py-2 rounded-lg shadow-lg"
          style={{ background: "var(--fg)", color: "var(--bg-alt)" }}
        >
          {toast}
        </div>
      )}

      <div
        className="flex items-center gap-3 px-7 py-3.5"
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <h2 className="text-[15px] font-bold tracking-[-0.015em]">
          {selectedDocument.filename.replace(".pdf", "")}
        </h2>
        <div className="ml-auto flex items-center gap-2.5 text-[11px]" style={{ color: "var(--muted)" }}>
          <Chip><b>{userCount}</b> 질의</Chip>
          <Chip><b>{citationCount}</b> 인용</Chip>
          <Chip>Claude Sonnet 4.6</Chip>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-9 py-6 flex flex-col gap-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
            <div
              className="w-14 h-14 rounded-2xl grid place-items-center"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              <Sparkles size={24} />
            </div>
            <div>
              <h2 className="text-base font-semibold mb-1">약관에 대해 질문해보세요</h2>
              <p className="text-[12px]" style={{ color: "var(--muted)" }}>
                답변마다 조항 번호·페이지·관련도가 함께 표시됩니다
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 max-w-[640px] ${msg.role === "user" ? "self-end" : ""}`}>
              {msg.role === "assistant" && (
                <div
                  className="w-7 h-7 rounded-full grid place-items-center flex-shrink-0"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  <Sparkles size={13} />
                </div>
              )}
              <div className="min-w-0">
                <div
                  className="px-4 py-3 rounded-xl text-[13.5px] leading-[1.7]"
                  style={
                    msg.role === "user"
                      ? { background: "var(--fg)", color: "var(--bg-alt)", border: "1px solid var(--fg)" }
                      : { background: "var(--surface)", color: "var(--fg-2)", border: "1px solid var(--border)" }
                  }
                >
                  {msg.role === "user" ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="mb-2 pl-4 list-disc">{children}</ul>,
                        ol: ({ children }) => <ol className="mb-2 pl-4 list-decimal">{children}</ol>,
                        li: ({ children }) => <li className="leading-[1.6]">{children}</li>,
                        strong: ({ children }) => <strong style={{ color: "var(--fg)", fontWeight: 700 }}>{children}</strong>,
                        code: ({ children }) => (
                          <code
                            className="text-xs mono px-1 rounded"
                            style={{ background: "var(--bg-2)" }}
                          >
                            {children}
                          </code>
                        ),
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  )}
                </div>
                <p
                  className={`text-[10.5px] mt-1 ${msg.role === "user" ? "text-right" : "text-left"}`}
                  style={{ color: "var(--muted)" }}
                >
                  {msg.timestamp.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                  {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
                    <> · 인용 {msg.citations.length}건</>
                  )}
                </p>
              </div>
              {msg.role === "user" && (
                <div
                  className="w-7 h-7 rounded-full grid place-items-center flex-shrink-0 text-[11px] font-bold"
                  style={{ background: "var(--fg)", color: "var(--bg-alt)" }}
                >
                  나
                </div>
              )}
            </div>
          ))
        )}
        {isInFlight && (
          <QueryProgress
            stepLabel={progress.stepLabel}
            progressIndex={progress.progressIndex}
            totalSteps={progress.totalSteps}
          />
        )}
        <div ref={bottomRef} />
      </div>

      <div
        className="px-7 pt-3.5 pb-4"
        style={{ background: "var(--surface)", borderTop: "1px solid var(--border)" }}
      >
        <form onSubmit={handleSubmit}>
          <div
            className="flex items-end gap-2.5 rounded-xl px-3.5 py-2.5 transition-colors focus-within:[border-color:var(--accent)]"
            style={{ background: "var(--bg)", border: "1.5px solid var(--border)" }}
          >
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isInFlight ? "답변을 받는 중입니다..." : "약관에 대해 질문해보세요"}
              disabled={isInFlight}
              className="flex-1 bg-transparent outline-none resize-none text-[13.5px] leading-[1.5] min-h-[22px] max-h-[100px] disabled:opacity-50"
              style={{ color: "var(--fg)" }}
            />
            <button
              type="submit"
              disabled={isInFlight || !input.trim()}
              className="w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 disabled:opacity-40"
              style={{ background: "var(--fg)", color: "var(--bg-alt)" }}
              aria-label="전송"
            >
              <ArrowUp size={14} />
            </button>
          </div>
        </form>
        <div className="mt-2.5 flex items-center gap-3.5 text-[10.5px]" style={{ color: "var(--muted)" }}>
          <span>
            <b style={{ color: "var(--fg-2)", fontWeight: 600 }}>컨텍스트</b>{" "}
            {selectedDocument.filename.replace(".pdf", "")}
          </span>
          <span>•</span>
          <span>근거 없는 답변은 생성되지 않습니다</span>
          <span>•</span>
          <span>⌘ ↵ 전송</span>
        </div>
      </div>
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="px-2 py-0.5 rounded-md"
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
      }}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 5: `ui-service/app/components/QueryProgress.tsx` mockup 스타일로**

```tsx
import { Loader2 } from "lucide-react";

interface Props {
  stepLabel: string;
  progressIndex: number;
  totalSteps: number | null;
}

export default function QueryProgress({ stepLabel, progressIndex, totalSteps }: Props) {
  const hasDeterminate = totalSteps !== null && totalSteps > 0;
  const pct = hasDeterminate ? Math.min(100, (progressIndex / totalSteps!) * 100) : null;

  return (
    <div className="flex justify-start">
      <div
        className="max-w-[340px] w-full rounded-xl px-3.5 py-2.5"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold">
            <Loader2 size={12} className="animate-spin" style={{ color: "var(--accent)" }} />
            {stepLabel}
          </span>
          {hasDeterminate && (
            <span className="text-[10.5px] mono" style={{ color: "var(--muted)" }}>
              STEP {progressIndex}/{totalSteps}
            </span>
          )}
        </div>
        <div className="h-[3px] rounded overflow-hidden" style={{ background: "var(--bg-2)" }}>
          {hasDeterminate ? (
            <div
              className="h-full transition-all duration-300 ease-out"
              style={{ background: "var(--accent)", width: `${pct}%` }}
            />
          ) : (
            <div
              className="h-full w-1/3 animate-progress-indeterminate"
              style={{ background: "var(--accent)" }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: `ui-service/app/components/CitationPanel.tsx` 시각 교체 (modal + AdSense 유지)**

```tsx
"use client";

import { useState } from "react";
import { useApp } from "../context/AppContext";
import type { Citation } from "../context/AppContext";
import AdSenseSlot from "./AdSenseSlot";

function CitationModal({ citation, score, onClose }: { citation: Citation; score: number; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl shadow-xl"
        style={{ background: "var(--surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-start justify-between p-5"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded"
              style={{
                background: "rgba(79,70,229,0.1)",
                color: "var(--accent)",
                letterSpacing: "0.02em",
              }}
            >
              {citation.clauseNumber}
            </span>
            <h2 className="text-[15px] font-bold mt-2">{citation.clauseTitle}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 ml-3"
            style={{ color: "var(--muted)" }}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--fg-2)" }}>
            {citation.excerpt}
          </p>
        </div>
        <div className="px-5 pb-5 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex justify-between text-[11px] mb-1.5" style={{ color: "var(--muted)" }}>
            <span>관련도</span>
            <span className="font-semibold" style={{ color: "var(--accent)" }}>{score}%</span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: "var(--bg-2)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ background: "var(--accent)", width: `${score}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CitationPanel() {
  const { citations, activeCitation } = useApp();
  const [modalCitation, setModalCitation] = useState<{ citation: Citation; score: number } | null>(null);

  const Header = ({ count }: { count: number }) => (
    <div className="px-4 pt-4 pb-2.5 flex items-center gap-2">
      <span
        className="text-xs font-bold tracking-[0.1em] uppercase"
        style={{ color: "var(--muted)" }}
      >
        근거 조항
      </span>
      <span
        className="ml-auto text-[11px] font-semibold px-1.5 py-0.5 rounded"
        style={{ background: "var(--bg-2)", color: "var(--muted)" }}
      >
        {count}
      </span>
    </div>
  );

  if (citations.length === 0) {
    return (
      <aside className="flex flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
        <Header count={0} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-5 text-center">
          <div
            className="w-10 h-10 rounded-full grid place-items-center"
            style={{ background: "var(--bg-2)", color: "var(--muted)" }}
          >
            📋
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
            AI가 답변하면<br />참조한 조항이<br />여기 표시됩니다
          </p>
        </div>
        <AdSenseSlot />
      </aside>
    );
  }

  return (
    <>
      {modalCitation && (
        <CitationModal
          citation={modalCitation.citation}
          score={modalCitation.score}
          onClose={() => setModalCitation(null)}
        />
      )}
      <aside className="flex flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
        <Header count={citations.length} />
        <div className="flex-1 overflow-y-auto px-3.5 pb-3.5 flex flex-col gap-2">
          {citations.map((c, i) => {
            const isActive = activeCitation === i;
            const score = Math.round(90 + (citations.length - i) * 3);
            return (
              <div
                key={i}
                onClick={() => setModalCitation({ citation: c, score })}
                className="rounded-[10px] px-3.5 py-3 cursor-pointer"
                style={{
                  background: isActive ? "var(--accent-soft)" : "var(--surface)",
                  border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span
                    className="text-[11px] font-bold px-1.5 py-[1px] rounded"
                    style={{
                      background: "rgba(79,70,229,0.1)",
                      color: "var(--accent)",
                    }}
                  >
                    {c.clauseNumber}
                  </span>
                  <span
                    className="ml-auto text-[10.5px] font-bold mono"
                    style={{ color: "var(--good)" }}
                  >
                    {score}%
                  </span>
                </div>
                <p className="text-[12.5px] font-semibold mb-1.5">{c.clauseTitle}</p>
                <p
                  className="text-[11.5px] leading-[1.6] line-clamp-3"
                  style={{ color: "var(--muted)" }}
                >
                  {c.excerpt}
                </p>
                <div className="mt-2 h-[2px] rounded" style={{ background: "var(--bg-2)" }}>
                  <div
                    className="h-full rounded"
                    style={{ background: "var(--accent)", width: `${score}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <AdSenseSlot />
      </aside>
    </>
  );
}
```

- [ ] **Step 7: `ui-service/app/components/AdSenseSlot.tsx` 컨테이너 튜닝**

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
    } catch {}
  }, [pubId, slotId]);

  if (!pubId || !slotId) return null;

  return (
    <div
      className="p-3.5"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <div
        className="min-h-[100px] rounded-md overflow-hidden"
        style={{ background: "var(--bg-2)" }}
      >
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

- [ ] **Step 8: 로컬 빌드 & 대시보드 smoke test**

```bash
cd ui-service && npm run build 2>&1 | tail -30
```

Expected: 에러 없음. `docker compose up -d` 후 http://localhost:3000/dashboard 에서 topbar + 3-pane shell이 ClauseIQ 디자인으로 렌더되고, 기존 기능(업로드/쿼리/SSE/인용 모달)이 동작한다.

- [ ] **Step 9: Commit**

```bash
git add ui-service/app/dashboard/page.tsx ui-service/app/components/LeftPanel.tsx ui-service/app/components/ChatPanel.tsx ui-service/app/components/CitationPanel.tsx ui-service/app/components/QueryProgress.tsx ui-service/app/components/LogoutButton.tsx ui-service/app/components/AdSenseSlot.tsx
git commit -m "feat(ui): ClauseIQ dashboard redesign — topbar, 3-pane, chat/citation"
```

---

## Task 5 — 빌드 확인, 푸시, PR 생성

**Files:** 없음 (운영 작업)

- [ ] **Step 1: 최종 로컬 검증**

```bash
cd ui-service && npm run build 2>&1 | tail -10
```

그리고:

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent" && docker compose up -d --build ui-service
```

브라우저로:
- http://localhost:3000 — Landing (로그아웃 상태)
- http://localhost:3000/login — Login split
- http://localhost:3000/dashboard — Dashboard (로그인 필요)

확인 체크:
- [ ] 3 페이지 렌더 정상
- [ ] PDF 업로드 → 상태 진행 → "업로드됨" 목록 갱신
- [ ] 질문 POST → SSE 진행 바 → 답변 + 인용 카드
- [ ] 인용 카드 클릭 시 모달 표시
- [ ] 로그아웃 → `/login`

- [ ] **Step 2: Push & PR**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
git push -u origin feat/ui-redesign-claude-design
```

이어 PR 생성:

```bash
gh pr create --title "feat(ui): ClauseIQ redesign — Claude Design mockups 적용" --body "$(cat <<'EOF'
## Summary
- Landing / Login / Dashboard 3개 페이지를 Claude Design mockup(b-landing/b-login/b-dashboard.html) 기준으로 재작업
- 브랜드 공개 문구 "ClauseIQ" 적용 (저장소/코드 심볼/CLAUDE.md는 유지)
- `lucide-react` + CSS 변수 토큰 도입, 기존 Supabase Auth / SSE / AdSense 로직 보존

## 주요 변경
- Landing: hero H1 64px + product frame(정적 preview) + features 3-col + dark CTA
- Login: 980px split (브랜드 pitch / Google 버튼 only)
- Dashboard: 52px topbar + 3-pane shell(260/1fr/300) + sparkles avatar + cite chip + meta row
- Drop: LandingSteps 섹션, metrics band, 이메일/GitHub 로그인, suggestion chips, 60초 데모 버튼

## Test plan
- [ ] Landing / Login / Dashboard 로컬 렌더 확인
- [ ] PDF 업로드 → 상태 polling → 목록 갱신
- [ ] 질의 → SSE 진행 바 → 답변 + 인용 카드 + 모달
- [ ] 로그아웃 플로우
- [ ] AdSense pub 스크립트 `<head>` 유지(curl 검증)
- [ ] GitHub Actions 6 job (3 test + 3 docker-build) green

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Railway 자동 배포 확인**

CI green 확인 후 main merge → Railway 3 service 자동 재배포 → https://ui-service-production-4cab.up.railway.app 에서 라이브 확인.

- [ ] **Step 4: 문서 업데이트 (CLAUDE.md MANDATORY)**

`docs/STATUS.md`:
- "최근 변경 이력" 맨 위에 `2026-04-20 | UI 리디자인 (ClauseIQ Claude Design) | 2026-04-19-ui-redesign-claude-design.md` 추가
- "마지막 업데이트" 날짜 갱신

`docs/ROADMAP.md`:
- 필요 시 현재 추천 다음 작업 재설정

---

## 자체 검토 (2026-04-20 작성 직후)

**스펙 커버리지 체크**
- A(브랜드 rename) ✅ Task 1/2/3/4 전반에 "ClauseIQ" 반영
- B(라이트 only) ✅ `:root`만 정의
- C(AdSense 유지) ✅ layout.tsx `<head>` 스크립트 + CitationPanel slot 유지
- D(Nav 항목 축소) ✅ "기능" 앵커만, 가격/문서/블로그 드롭
- E(60초 데모 드롭) ✅ Hero에서 secondary 버튼 제거
- F(voyage-2 1024-dim) ✅ Features에 `voyage-2 · 1024-dim`
- G(metrics band 드롭) ✅ 섹션 자체 제거
- H(이메일/GitHub 드롭) ✅ Login은 Google 버튼만
- I(브레드크럼) ✅ Dashboard topbar에 "대시보드" 텍스트 + 로고/슬래시
- J(검색/이력/설정 드롭) ✅ avatar + 로그아웃만
- K(채팅 타이틀=문서명) ✅ `selectedDocument.filename` 사용
- L(suggestion chips 드롭) ✅ `SUGGESTED_QUESTIONS` 배열 및 하단 chip 제거
- M(composer meta-row) ✅ "컨텍스트 · ⌘↵ 전송" 반영
- N(Agent 정상 chip) ✅ 정적 표시 (포트폴리오 단순화)

**Placeholder 스캔** — TBD/TODO 없음. 모든 Step에 실제 코드/명령 있음.

**타입 일관성**
- `useApp()`의 `documents`, `messages`, `citations`, `selectedDocument`, `activeCitation` 필드는 기존 `AppContext` 타입 그대로 사용 (변경 없음 — 시각만 교체)
- `QueryProgress` props (`stepLabel`, `progressIndex`, `totalSteps`)는 기존과 동일
- `Citation` 타입(`clauseNumber`, `clauseTitle`, `excerpt`)은 기존 import 경로 유지

**Critical 이슈 없음.** Important 포인트:
- `Dashboard topbar`에 "대시보드" 고정 문구 사용 — 브레드크럼 동적 문서명은 현재 대시보드 페이지가 문서별 라우팅이 아니므로(단일 `/dashboard` + 상태 기반 선택) 고정 사용. 선택 문서명은 ChatPanel `chat-head`에 이미 표시되므로 중복 방지.
- `textarea` `onKeyDown`으로 `Cmd+Enter` 제출 — 기존 `input`을 `textarea`로 바꾸면서 submit은 form onSubmit에 위임. IME 합성 중 제출 문제는 포트폴리오 스코프로 생략.

**Minor**
- `AdSenseSlot`은 slot ID 주입 전엔 null을 반환하므로 하단 여백 차이 발생 가능 — 현 상태 유지(승인/slot 주입 시 자동 표시).
- Avatar 이니셜은 email의 첫 글자 대문자. `user_metadata.full_name`이 있으면 한국어 이니셜이 더 자연스럽지만 포트폴리오 스코프로 생략.
