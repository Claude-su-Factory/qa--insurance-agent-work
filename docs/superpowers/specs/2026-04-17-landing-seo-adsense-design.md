# 랜딩 페이지 + SEO + AdSense 설계 문서

**작성일:** 2026-04-17
**대상 프로젝트:** insurance-qa-agent

---

## 변경 목표

1. 중앙 정렬 히어로 기반 랜딩 페이지 생성 (비로그인 접근 가능)
2. SEO 최적화 (meta, JSON-LD, sitemap, robots.txt, 시맨틱 HTML)
3. 대시보드 근거 조항 패널 하단에 Google AdSense 배너

---

## 라우팅 변경

| 경로 | 현재 | 변경 |
|---|---|---|
| `/` | 3패널 대시보드 (인증 필요) | 랜딩 페이지 (공개) |
| `/dashboard` | 없음 | 3패널 대시보드 (인증 필요) |
| `/login` | 로그인 페이지 | 유지 (랜딩에서 CTA 클릭 시 이동) |

---

## 랜딩 페이지 (`/`)

서버 컴포넌트. 비로그인 사용자도 접근 가능.

### 구조

1. **네비게이션 바** — 로고 + "시작하기" 버튼
2. **히어로 섹션** — AI 뱃지, 중앙 헤드라인, 서브카피, CTA 버튼
3. **기능 소개** — 3개 카드 (약관 업로드, 자연어 질문, 근거 제시)
4. **사용 흐름** — 3단계 (업로드 → 질문 → 답변)
5. **CTA 섹션** — 그라데이션 배경 + Google 로그인 버튼
6. **푸터** — 저작권

### 헤드라인/카피

- h1: "복잡한 보험 약관, AI가 쉽게 설명해드립니다"
- 서브카피: "PDF를 업로드하고 질문하세요. 근거 조항까지 정확하게 알려드립니다."
- 뱃지: "AI 기반 약관 분석 서비스"

### 기능 카드

| 아이콘 | 제목 | 설명 |
|---|---|---|
| 📄 | 약관 업로드 | PDF 파일을 업로드하면 AI가 자동으로 분석합니다 |
| 💬 | 자연어 질문 | 전문 용어 없이 편하게 질문하세요 |
| 📌 | 근거 제시 | 답변의 출처 조항을 정확하게 보여줍니다 |

### 사용 흐름

1. PDF 업로드 → 2. 질문하기 → 3. 답변 확인

---

## SEO

### meta 태그 (layout.tsx metadata)

```typescript
export const metadata: Metadata = {
  title: "보험 약관 QA - AI 기반 보험 약관 질의응답 서비스",
  description: "보험 약관 PDF를 업로드하고 AI에게 질문하세요. 면책기간, 보장범위, 청구조건 등 복잡한 약관을 쉽게 이해할 수 있습니다. 근거 조항까지 정확하게 제시합니다.",
  openGraph: {
    title: "보험 약관 QA - AI가 약관을 쉽게 설명해드립니다",
    description: "PDF 업로드 → AI 질문 → 근거 조항 확인. 무료로 시작하세요.",
    type: "website",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "보험 약관 QA - AI 기반 약관 분석",
    description: "복잡한 보험 약관을 AI에게 물어보세요.",
  },
  robots: { index: true, follow: true },
};
```

### JSON-LD 구조화 데이터

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "보험 약관 QA",
  "description": "AI 기반 보험 약관 질의응답 서비스",
  "applicationCategory": "FinanceApplication",
  "operatingSystem": "Web",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "KRW"
  }
}
```

### sitemap.xml (app/sitemap.ts)

```typescript
export default function sitemap() {
  return [
    { url: "https://도메인", lastModified: new Date(), priority: 1.0 },
    { url: "https://도메인/login", lastModified: new Date(), priority: 0.5 },
  ];
}
```

도메인은 Railway 배포 후 확정. 로컬에서는 localhost로 동작.

### robots.txt (app/robots.ts)

```typescript
export default function robots() {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/api/"] },
    sitemap: "https://도메인/sitemap.xml",
  };
}
```

---

## Google AdSense

### 위치

대시보드(`/dashboard`) 근거 조항 패널(CitationPanel) 하단.

### 구현

- `app/layout.tsx`의 `<head>`에 AdSense 스크립트 태그 추가
- `CitationPanel.tsx` 하단에 `<ins class="adsbygoogle">` 광고 슬롯 삽입
- AdSense Publisher ID와 슬롯 ID는 환경변수로 관리: `NEXT_PUBLIC_ADSENSE_PUB_ID`, `NEXT_PUBLIC_ADSENSE_SLOT_ID`
- 값이 없으면 광고 영역을 렌더링하지 않음 (개발 환경 대응)

### AdSense 승인 요건

- 충분한 콘텐츠가 있는 페이지 (랜딩 페이지가 이 역할)
- 개인정보처리방침 페이지 (최소한의 `/privacy` 페이지 필요)
- 서비스 약관 페이지 (선택 사항이지만 권장)

→ 간단한 `/privacy` 정적 페이지를 추가한다.

---

## 변경 범위

| 파일 | 변경 |
|---|---|
| `app/page.tsx` | 전면 교체 → 랜딩 페이지 (서버 컴포넌트, 공개) |
| `app/dashboard/page.tsx` | 신규 → 기존 3패널 대시보드 이동 |
| `app/dashboard/layout.tsx` | 신규 → 대시보드용 레이아웃 (인증 체크) |
| `app/privacy/page.tsx` | 신규 → 개인정보처리방침 정적 페이지 |
| `app/layout.tsx` | metadata 업데이트, AdSense 스크립트 추가 |
| `app/sitemap.ts` | 신규 → 동적 sitemap |
| `app/robots.ts` | 신규 → robots.txt |
| `app/components/CitationPanel.tsx` | 수정 → 하단 AdSense 슬롯 추가 |
| `app/components/JsonLd.tsx` | 신규 → JSON-LD 구조화 데이터 컴포넌트 |
| `middleware.ts` | 수정 → `/`, `/privacy`, `/sitemap.xml`, `/robots.txt`를 public path에 추가 |

---

## 검증 기준

- `/` 접속 시 비로그인 상태에서도 랜딩 페이지 표시
- "시작하기" 버튼 클릭 → `/login` 이동
- 로그인 후 `/dashboard`로 리다이렉트
- `view-source`에서 h1, JSON-LD, meta og 태그 확인
- `/sitemap.xml` 접속 시 XML 반환
- `/robots.txt` 접속 시 텍스트 반환
- 대시보드 근거 조항 패널 하단에 AdSense 슬롯 렌더링 (pub ID 있을 때만)
- `/privacy` 접속 가능
