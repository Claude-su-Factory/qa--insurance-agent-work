# AdSense Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove AdSense policy violations (ads on empty/navigation screens) and add ad slots on content-rich pages (landing, Privacy, Terms) while preserving revenue.

**Architecture:** Refactor `AdSenseSlot` to support two visual variants (`panel` for dashboard, `inline` for content pages). Remove `AdSenseSlot` from CitationPanel empty-state branch. Insert `AdSenseSlot` instances on `/`, `/privacy`, `/terms`. Beef up Privacy/Terms body content to clear the thin-content bar.

**Tech Stack:** Next.js 14 app router, TypeScript, Tailwind + CSS variables (light theme tokens already in `globals.css`), `adsbygoogle.js` manual slots (no auto-ads). Environment variables `NEXT_PUBLIC_ADSENSE_PUB_ID` and `NEXT_PUBLIC_ADSENSE_SLOT_ID` reused across placements. Branch this work from `feat/ui-redesign-claude-design` (depends on CSS tokens introduced there).

**Branch:** Create `fix/adsense-compliance` off `feat/ui-redesign-claude-design`. Open separate PR that stacks onto PR #9.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `ui-service/app/components/AdSenseSlot.tsx` | Render AdSense `<ins>` slot with two style variants | Modify |
| `ui-service/app/components/CitationPanel.tsx` | Dashboard right panel — remove ad from empty state | Modify |
| `ui-service/app/page.tsx` | Landing page — insert inline ad between Features and CTA | Modify |
| `ui-service/app/privacy/page.tsx` | Privacy policy — boost body, append inline ad | Modify |
| `ui-service/app/terms/page.tsx` | Terms of service — boost body, append inline ad | Modify |
| `docs/STATUS.md` | Record change in "최근 변경 이력" | Modify |

No new files. No deletions. No schema/env changes.

---

## Task 0: Branch setup

**Files:** none (git ops only)

- [ ] **Step 1: Confirm starting point**

Run: `cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent" && git branch --show-current`
Expected: `feat/ui-redesign-claude-design` (or whatever current UI redesign branch). If on `main`, first `git checkout feat/ui-redesign-claude-design`.

- [ ] **Step 2: Create compliance branch**

```bash
git checkout -b fix/adsense-compliance
```

Expected: `Switched to a new branch 'fix/adsense-compliance'`

---

## Task 1: Refactor AdSenseSlot with variant prop

**Files:**
- Modify: `ui-service/app/components/AdSenseSlot.tsx` (full rewrite)

- [ ] **Step 1: Replace AdSenseSlot.tsx with variant-aware implementation**

```tsx
"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type AdSenseSlotProps = {
  variant?: "panel" | "inline";
};

export default function AdSenseSlot({ variant = "panel" }: AdSenseSlotProps) {
  const pubId = process.env.NEXT_PUBLIC_ADSENSE_PUB_ID;
  const slotId = process.env.NEXT_PUBLIC_ADSENSE_SLOT_ID;

  useEffect(() => {
    if (!pubId || !slotId) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {}
  }, [pubId, slotId]);

  if (!pubId || !slotId) return null;

  if (variant === "inline") {
    return (
      <div className="my-10 mx-auto max-w-2xl px-4">
        <div
          className="text-[10px] uppercase tracking-[0.1em] mb-1.5"
          style={{ color: "var(--muted)" }}
        >
          광고
        </div>
        <div
          className="min-h-[100px] rounded-md overflow-hidden"
          style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
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

  return (
    <div className="p-3.5" style={{ borderTop: "1px solid var(--border)" }}>
      <div
        className="text-[10px] uppercase tracking-[0.1em] mb-1.5"
        style={{ color: "var(--muted)" }}
      >
        광고
      </div>
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

- [ ] **Step 2: Run typecheck**

Run: `cd ui-service && npx tsc --noEmit`
Expected: exits cleanly (no TypeScript errors). Existing `<AdSenseSlot />` call in CitationPanel still works because `variant` defaults to `"panel"`.

- [ ] **Step 3: Commit**

```bash
git add ui-service/app/components/AdSenseSlot.tsx
git commit -m "$(cat <<'EOF'
feat(ads): add inline variant + 광고 label to AdSenseSlot

panel variant은 기존 CitationPanel 하단용(border-top + bg-2 컨테이너).
inline variant는 컨텐츠 페이지(랜딩/Privacy/Terms) 본문 삽입용
(my-10 max-w-2xl 중앙 정렬 + border 박스).

두 variant 모두 '광고' 라벨을 상단에 표시하여 투명성 확보
및 심사 정책 권장 사항 준수.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Remove ad from CitationPanel empty state

**Files:**
- Modify: `ui-service/app/components/CitationPanel.tsx` (line 88-106 의 `if (citations.length === 0)` 분기)

- [ ] **Step 1: Remove `<AdSenseSlot />` from empty branch**

**Before (lines 88-106):**
```tsx
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
```

**After (line 103 삭제, `<AdSenseSlot />` 제거):**
```tsx
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
      </aside>
    );
  }
```

Populated branch (line 175 `<AdSenseSlot />`) 유지. Import는 그대로 둠 (populated branch에서 사용).

- [ ] **Step 2: Build verify**

Run: `cd ui-service && npm run build 2>&1 | tail -15`
Expected: Build succeeds, `/dashboard` 포함. No new warnings specific to this change.

- [ ] **Step 3: Commit**

```bash
git add ui-service/app/components/CitationPanel.tsx
git commit -m "$(cat <<'EOF'
fix(ads): drop AdSense from empty CitationPanel state — AdSense 정책 위반 해소

빈 상태(citations.length===0)에서 안내 문구만 있고 게시자 컨텐츠가 없는 화면에
광고가 렌더링되어 AdSense 심사 반려 원인이 됨. 빈 분기에서 <AdSenseSlot /> 제거.
채워진 분기(line 175)는 실제 근거 조항 카드와 함께 노출되므로 유지.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Insert inline ad on landing page

**Files:**
- Modify: `ui-service/app/page.tsx`

- [ ] **Step 1: Add AdSenseSlot import and insert slot between Features and CTA**

**Before:**
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

**After:**
```tsx
import { redirect } from "next/navigation";
import LandingNav from "./components/LandingNav";
import LandingHero from "./components/LandingHero";
import LandingProductFrame from "./components/LandingProductFrame";
import LandingFeatures from "./components/LandingFeatures";
import LandingCTA from "./components/LandingCTA";
import LandingFooter from "./components/LandingFooter";
import AdSenseSlot from "./components/AdSenseSlot";
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
        <AdSenseSlot variant="inline" />
        <LandingCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
```

- [ ] **Step 2: Build verify**

Run: `cd ui-service && npm run build 2>&1 | tail -15`
Expected: Build succeeds, `/` route still static-eligible or dynamic (both OK), no new errors.

- [ ] **Step 3: Commit**

```bash
git add ui-service/app/page.tsx
git commit -m "$(cat <<'EOF'
feat(ads): add inline AdSense slot on landing page between Features and CTA

랜딩은 히어로/제품 프레임/기능 3종/CTA를 모두 포함한 컨텐츠 풍부 페이지로
AdSense 정책의 '게시자 컨텐츠 있는 화면' 요건 충족. Features와 CTA 사이에
자연스럽게 배치하여 가독성과 광고 노출을 양립.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Boost Privacy page body + add inline ad

**Files:**
- Modify: `ui-service/app/privacy/page.tsx` (full rewrite)

- [ ] **Step 1: Replace Privacy page with expanded body + AdSenseSlot**

```tsx
import type { Metadata } from "next";
import AdSenseSlot from "../components/AdSenseSlot";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "ClauseIQ 보험 약관 QA 서비스의 개인정보 수집 및 이용 방침",
};

export default function Privacy() {
  return (
    <main className="max-w-2xl mx-auto py-12 px-6 text-slate-800">
      <h1 className="text-2xl font-bold mb-6">개인정보처리방침</h1>
      <p className="text-sm text-slate-500 mb-8">최종 수정일: 2026-04-20</p>

      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold mt-6">1. 수집하는 개인정보 항목</h2>
        <p>ClauseIQ(이하 &quot;서비스&quot;)는 다음 개인정보를 수집합니다. Google OAuth 로그인을 통해 제공된 이메일 주소, 이름, 프로필 사진이 수집되며, 이는 사용자 인증과 계정 식별 목적으로만 사용됩니다. 서비스 이용 과정에서 업로드한 보험 약관 PDF 파일은 분석을 위해 서버에 일시 저장되며, 추출된 텍스트는 조항 단위로 청크 분할되어 벡터 데이터베이스에 저장됩니다. 사용자가 입력한 질의 내용과 AI가 생성한 답변은 서비스 품질 개선 및 감사 목적으로 보관됩니다.</p>

        <h2 className="text-lg font-semibold mt-6">2. 개인정보의 이용 목적</h2>
        <p>수집된 정보는 회원 인증, 사용자별 문서 격리, 질의응답 제공, 서비스 이용 분석, 법적 의무 이행 범위 내에서만 이용됩니다. 광고 또는 마케팅 목적의 별도 활용은 없으며, 사용자 본인의 동의 없이 목적 외 용도로 사용되지 않습니다.</p>

        <h2 className="text-lg font-semibold mt-6">3. 쿠키 및 Google AdSense</h2>
        <p>본 서비스는 Google AdSense를 통해 광고를 제공합니다. Google은 쿠키 및 유사 기술을 사용하여 이전 방문 내역을 기반으로 맞춤형 광고를 제공할 수 있습니다. 사용자는 <a href="https://adssettings.google.com" className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">Google 광고 설정</a>에서 맞춤 광고를 비활성화할 수 있으며, 브라우저 설정을 통해 쿠키 저장을 거부할 수도 있습니다. 단, 쿠키를 거부할 경우 일부 기능 이용에 제약이 있을 수 있습니다.</p>

        <h2 className="text-lg font-semibold mt-6">4. 개인정보 보관 기간</h2>
        <p>회원 가입 시 수집된 개인정보는 회원 탈퇴 시까지 보관됩니다. 회원 탈퇴 요청이 접수되면 업로드된 PDF 파일, Qdrant 벡터 데이터, 질의/답변 이력을 포함한 모든 개인정보가 지체 없이 파기됩니다. 다만 관련 법령에 따라 보관이 의무화된 정보는 해당 기간 동안 별도 보관됩니다.</p>

        <h2 className="text-lg font-semibold mt-6">5. 제3자 제공 및 처리 위탁</h2>
        <p>서비스 운영을 위해 다음 외부 업체에 개인정보 처리를 위탁합니다. Supabase(인증 세션 관리 및 메타데이터 저장), Anthropic(질의 처리를 위한 Claude LLM 호출), Voyage AI(텍스트 임베딩 생성), Qdrant Cloud(벡터 검색), Google AdSense(광고 게재). 각 제공 업체는 해당 서비스 제공 목적 범위 내에서만 정보에 접근하며, 자체 개인정보 처리 방침을 따릅니다.</p>

        <h2 className="text-lg font-semibold mt-6">6. 사용자의 권리</h2>
        <p>사용자는 언제든지 본인의 개인정보에 대한 열람, 정정, 삭제, 처리 정지를 요청할 수 있습니다. 업로드한 문서는 대시보드에서 개별 삭제가 가능하며, 전체 계정 삭제를 원할 경우 서비스 운영자에게 문의하시기 바랍니다. 법정대리인 또는 제3자를 통한 요청 시 정당한 위임 여부를 확인합니다.</p>

        <h2 className="text-lg font-semibold mt-6">7. 보안 조치</h2>
        <p>서비스는 사용자 정보 보호를 위해 다음 조치를 시행합니다. 전송 구간 HTTPS 암호화, Supabase JWT 기반 인증, Qdrant payload의 user_id 필터링을 통한 사용자 간 데이터 격리, 내부 서비스 간 호출에 X-Internal-Token 검증 미들웨어 적용, 민감한 환경 변수는 Doppler를 통해 안전하게 관리합니다. 기술적 한계로 완전한 보안을 보장할 수는 없으나 업계 표준 수준의 조치를 유지합니다.</p>

        <h2 className="text-lg font-semibold mt-6">8. 문의 및 분쟁 해결</h2>
        <p>개인정보 관련 문의, 불만 처리, 피해 구제에 관한 사항은 서비스 운영자에게 연락해 주시기 바랍니다. 분쟁이 해결되지 않을 경우 개인정보보호위원회(privacy.go.kr) 또는 개인정보 침해신고센터(privacy.kisa.or.kr)에 도움을 요청할 수 있습니다.</p>
      </section>

      <AdSenseSlot variant="inline" />
    </main>
  );
}
```

- [ ] **Step 2: Build verify**

Run: `cd ui-service && npm run build 2>&1 | tail -15`
Expected: Build succeeds. `/privacy` route still listed.

- [ ] **Step 3: Commit**

```bash
git add ui-service/app/privacy/page.tsx
git commit -m "$(cat <<'EOF'
feat(ads): expand Privacy policy body + append inline AdSense slot

섹션 5→8개 확장 (제3자 제공, 사용자 권리, 보안 조치, 분쟁 해결 추가).
본문 약 1300자 확보로 thin content 리스크 해소. 본문 끝에
AdSenseSlot(variant=inline) 추가.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Boost Terms page body + add inline ad

**Files:**
- Modify: `ui-service/app/terms/page.tsx` (full rewrite)

- [ ] **Step 1: Replace Terms page with expanded body + AdSenseSlot**

```tsx
import type { Metadata } from "next";
import AdSenseSlot from "../components/AdSenseSlot";

export const metadata: Metadata = {
  title: "이용약관",
  description: "ClauseIQ 보험 약관 QA 서비스 이용약관",
};

export default function Terms() {
  return (
    <main className="max-w-2xl mx-auto py-12 px-6 text-slate-800">
      <h1 className="text-2xl font-bold mb-6">이용약관</h1>
      <p className="text-sm text-slate-500 mb-8">최종 수정일: 2026-04-20</p>

      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold mt-6">1. 서비스 목적 및 범위</h2>
        <p>ClauseIQ(이하 &quot;서비스&quot;)는 사용자가 업로드한 보험 약관 PDF를 인공지능 기술로 분석하여 조항 단위의 질의응답을 제공하는 포트폴리오 성격의 웹 서비스입니다. 본 서비스는 보험사의 공식 상담 창구가 아니며, 개별 계약의 해석이나 청구 실무에 대해 법적 효력을 가지는 판단을 제공하지 않습니다.</p>

        <h2 className="text-lg font-semibold mt-6">2. 이용 자격 및 계정</h2>
        <p>서비스는 Google 계정을 통한 인증을 필수로 요구합니다. 사용자는 본인 계정의 보안을 책임져야 하며, 계정 도용이 의심되는 경우 즉시 서비스 운영자에게 통지해야 합니다. 만 14세 미만의 아동이 서비스를 이용하려면 법정대리인의 동의가 필요합니다.</p>

        <h2 className="text-lg font-semibold mt-6">3. AI 답변의 책임 한계</h2>
        <p>본 서비스가 제공하는 AI 답변은 참고 자료이며, 법적 구속력을 갖지 않습니다. 실제 보험금 청구, 보장 범위 해석, 법적 분쟁 등 중요한 의사결정이 필요한 경우 반드시 보험사, 금융감독원, 변호사 등 공식 기관 또는 전문가와 상담하시기 바랍니다. AI 답변의 오류, 누락, 지연으로 인한 직접적 또는 간접적 손실에 대해 서비스 운영자는 법이 허용하는 최대 범위에서 책임을 지지 않습니다.</p>

        <h2 className="text-lg font-semibold mt-6">4. 저작권 및 문서 업로드 책임</h2>
        <p>업로드된 보험 약관 PDF의 저작권은 해당 원저작자(주로 보험사)에게 귀속됩니다. 사용자는 본인이 당사자이거나 정당한 이용 권한을 가진 문서만 업로드해야 하며, 저작권 침해 또는 계약상 비밀 유지 의무 위반에 대한 책임은 업로드한 사용자 본인에게 있습니다. 서비스 운영자는 저작권 침해 신고 접수 시 해당 콘텐츠를 즉시 비활성화할 수 있습니다.</p>

        <h2 className="text-lg font-semibold mt-6">5. 데이터 처리 및 사용자 간 격리</h2>
        <p>업로드된 PDF는 청크 단위로 분할되어 Qdrant 벡터 데이터베이스에 저장되며, 각 청크에는 업로더의 user_id가 태깅되어 다른 사용자의 검색 결과에 노출되지 않습니다. 질의 처리 과정에서 Anthropic(Claude), Voyage AI(임베딩) 등 외부 LLM API가 호출되며, 이들 서비스의 데이터 처리 정책이 함께 적용됩니다.</p>

        <h2 className="text-lg font-semibold mt-6">6. 금지 행위</h2>
        <p>다음 행위는 금지됩니다. 타인의 저작물 또는 계약 문서를 무단으로 업로드하는 행위, 서비스 API에 과도한 부하를 유발하는 자동화 스크립트 사용, AI 시스템의 취약점을 의도적으로 탐색하거나 악용하는 행위, 서비스를 활용하여 법률·의료·금융 상담을 대리 제공하는 영업 활동, 타 사용자의 개인정보를 추론하거나 재구성하려는 시도가 이에 해당합니다.</p>

        <h2 className="text-lg font-semibold mt-6">7. 서비스 변경, 중단 및 약관 수정</h2>
        <p>서비스 운영자는 기술적 개선, 정책 변경, 외부 API 종속성 변화 등의 사유로 서비스 내용을 변경하거나 일시 중단할 수 있습니다. 중대한 변경의 경우 최소 30일 전 서비스 내 공지 또는 등록된 이메일을 통해 사전 안내합니다. 약관 변경 후에도 서비스를 계속 이용하는 경우 변경된 약관에 동의한 것으로 간주됩니다.</p>

        <h2 className="text-lg font-semibold mt-6">8. 분쟁 해결 및 준거법</h2>
        <p>본 약관 및 서비스 이용과 관련하여 발생하는 분쟁은 대한민국 법을 준거법으로 하며, 관할 법원은 서비스 운영자의 주소지를 관할하는 지방법원을 1심 관할 법원으로 합니다. 본 약관은 법률 자문을 거치지 않고 서비스 운영자가 작성한 문서로, 실제 법적 효력에 대한 해석은 관할 법원의 판단에 따릅니다.</p>
      </section>

      <AdSenseSlot variant="inline" />
    </main>
  );
}
```

- [ ] **Step 2: Build verify**

Run: `cd ui-service && npm run build 2>&1 | tail -15`
Expected: Build succeeds. `/terms` route still listed.

- [ ] **Step 3: Commit**

```bash
git add ui-service/app/terms/page.tsx
git commit -m "$(cat <<'EOF'
feat(ads): expand Terms of service body + append inline AdSense slot

섹션 4→8개 확장 (이용자격, 저작권, 데이터 처리, 금지 행위, 분쟁 해결 추가).
본문 약 1500자 확보. AI 답변의 면책 범위와 저작권 책임을 명확히 기술.
본문 끝에 AdSenseSlot(variant=inline) 추가.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Manual compliance verification

**Files:** none (manual check)

- [ ] **Step 1: Run dev server**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/ui-service" && npm run dev
```

Expected: Server starts on http://localhost:3000.

- [ ] **Step 2: Verify ad absence on non-content screens**

With `NEXT_PUBLIC_ADSENSE_PUB_ID` and `NEXT_PUBLIC_ADSENSE_SLOT_ID` temporarily set in `.env.local` (any valid-format value — e.g., `ca-pub-0000000000000000` / `0000000000` — real IDs not needed for visual check):

Navigate to each URL and confirm:
- `/login` — no "광고" label anywhere on page
- `/auth/callback` — either redirects or has no ad (navigation-only)
- `/dashboard` (fresh account, no documents) — right panel shows 📋 empty state with NO "광고" label below
- `/dashboard` (with document uploaded but no query yet) — same empty state, NO ad

- [ ] **Step 3: Verify ad presence on content-rich screens**

- `/` — scroll past 3 features; "광고" label visible before CTA section
- `/privacy` — scroll to bottom; "광고" label visible after section 8
- `/terms` — scroll to bottom; "광고" label visible after section 8

- [ ] **Step 4: Verify ad presence on dashboard after query**

Upload any small PDF (any 1-page insurance-like document). After document ready, submit a test query. When citations render in right panel, verify "광고" label appears below the citation list.

- [ ] **Step 5: Stop dev server**

Press Ctrl+C in dev server terminal. No commit in this task.

---

## Task 7: Update STATUS.md and push

**Files:**
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Update last-modified date**

**Find line 3:**
```markdown
**마지막 업데이트:** 2026-04-20
```

(Already 2026-04-20 from UI redesign — if different, change to `2026-04-20`.)

- [ ] **Step 2: Add change log entry**

**Find the "최근 변경 이력" table and insert after the header row (before the 2026-04-20 UI redesign row):**

```markdown
| 2026-04-20 | AdSense 정책 준수 — 빈 CitationPanel에서 광고 제거, 랜딩/Privacy/Terms에 inline 슬롯 추가, Privacy/Terms 본문 보강 (섹션 7~8개) | `2026-04-20-adsense-compliance.md` |
```

Row 예시 (UI redesign 엔트리 바로 위):
```markdown
| 날짜 | 변경 | 관련 스펙 |
|---|---|---|
| 2026-04-20 | AdSense 정책 준수 — 빈 CitationPanel에서 광고 제거, 랜딩/Privacy/Terms에 inline 슬롯 추가, Privacy/Terms 본문 보강 (섹션 7~8개) | `2026-04-20-adsense-compliance.md` |
| 2026-04-20 | UI 리디자인 (Claude Design 기반) — ClauseIQ 브랜드, lucide-react 아이콘, CSS 토큰, 랜딩/로그인/대시보드 전면 개편 (비즈니스 로직 보존) | `2026-04-19-ui-redesign-claude-design.md` |
| 2026-04-19 | Railway 실배포 + CI/CD 자동화 ... |
```

- [ ] **Step 3: Commit**

```bash
git add docs/STATUS.md docs/superpowers/specs/2026-04-20-adsense-compliance.md docs/superpowers/plans/2026-04-20-adsense-compliance.md
git commit -m "$(cat <<'EOF'
docs: AdSense 컴플라이언스 STATUS 엔트리 + 스펙/플랜 아카이브

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push branch**

```bash
git push -u origin fix/adsense-compliance
```

Expected: Branch created on origin, tracking set.

- [ ] **Step 5: Open PR**

```bash
gh pr create --title "fix(ads): AdSense 정책 준수 + 수익 포인트 확장" --base feat/ui-redesign-claude-design --body "$(cat <<'EOF'
## Summary
- AdSense 심사 반려(게시자 컨텐츠 없는 화면에 광고) 해소: 빈 CitationPanel에서 광고 제거
- 광고 노출 포인트 1 → 4 확대: 랜딩(Features/CTA 사이), Privacy/Terms 본문 끝
- Privacy(섹션 5→8개, 약 1300자), Terms(섹션 4→8개, 약 1500자) 본문 보강
- AdSenseSlot 에 inline variant 추가 + '광고' 라벨 표시(투명성)

## 의존성
- PR #9 (UI 리디자인)에 스택. CSS 토큰(`--border`, `--bg-2`, `--muted`) 사용.

## Compliance 체크리스트
- [x] 빈 대시보드 광고 없음
- [x] 로그인/콜백 광고 없음
- [x] 랜딩 Features와 CTA 사이 광고
- [x] Privacy 본문 8개 섹션 + 광고
- [x] Terms 본문 8개 섹션 + 광고
- [x] 모든 광고에 '광고' 라벨
- [x] auto-ads 비활성 (수동 슬롯만)

## 스펙 & 플랜
- Spec: `docs/superpowers/specs/2026-04-20-adsense-compliance.md`
- Plan: `docs/superpowers/plans/2026-04-20-adsense-compliance.md`

## Test plan
- [ ] Preview 배포 후 `/`, `/privacy`, `/terms` 광고 렌더 확인
- [ ] `/dashboard` 빈 상태에서 광고 없음 확인
- [ ] 질의 후 CitationPanel 광고 렌더 확인
- [ ] `/login` 광고 없음 확인
- [ ] AdSense 심사 재신청

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL returned.

---

## Self-Review (2026-04-20)

### Spec coverage
- 섹션 3(노출 포인트) → Task 2/3/4/5 커버
- 섹션 4.1(variant 추가) → Task 1
- 섹션 4.2(CitationPanel 빈 상태 제거) → Task 2
- 섹션 4.3(랜딩 슬롯) → Task 3
- 섹션 4.4(Privacy/Terms 슬롯) → Task 4/5
- 섹션 5(본문 보강) → Task 4/5
- 섹션 6(준수 체크리스트) → Task 6
- 섹션 8(검증 방법) → Task 6

모두 커버됨. 갭 없음.

### Placeholder scan
- "TODO" / "TBD" / "implement later" 검색 → 없음
- 모든 step 에 구체 코드 또는 커맨드 포함
- Task 6 manual check 지침은 exact URL + 확인 항목 명시

### Type consistency
- `AdSenseSlotProps = { variant?: "panel" | "inline" }` → 사용처 Task 3/4/5 에서 `variant="inline"` 전달, CitationPanel 기존 호출은 `<AdSenseSlot />` (default panel) — 일관성 OK
- `NEXT_PUBLIC_ADSENSE_PUB_ID` / `NEXT_PUBLIC_ADSENSE_SLOT_ID` 환경변수명 전체 일관

**결과:** 이슈 없음. 플랜 그대로 진행 가능.
