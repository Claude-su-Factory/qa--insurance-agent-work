# 랜딩 페이지 + SEO + AdSense 설계 문서 (v1.2)

**작성일:** 2026-04-17
**대상 프로젝트:** insurance-qa-agent
**상태:** 검토 완료 (Reviewer 전용 모드 적용)

---

## 변경 목표

1. **전환 중심 랜딩 페이지:** 중앙 정렬 히어로 기반 랜딩 페이지 생성 (비로그인 공개)
2. **지능형 리다이렉트:** 로그인 사용자는 `/` 접속 시 `/dashboard`로 자동 이동
3. **SEO 극대화:** meta, JSON-LD, sitemap, robots.txt, 시맨틱 HTML(h1~h3) 최적화
4. **수익화 기반:** 대시보드 근거 조항 패널 하단에 레이아웃 최적화된 Google AdSense 배너 삽입

---

## 라우팅 및 접근 제어

| 경로 | 접근 권한 | 동작 |
|---|---|---|
| `/` | 공개 | 랜딩 페이지 (로그인 상태면 `/dashboard`로 리다이렉트) |
| `/dashboard` | 인증 필요 | 3패널 대시보드 (미인증 시 `/login` 리다이렉트) |
| `/login` | 공개 | 로그인 페이지 (인증 시 `/dashboard` 이동) |
| `/privacy`, `/terms` | 공개 | 개인정보처리방침 및 이용약관 (AdSense 승인 필수 요건) |

---

## 랜딩 페이지 (`/`) 구조 및 SEO

### 시맨틱 HTML 계층 (h1~h3)
- **h1 (Hero):** "복잡한 보험 약관, AI가 쉽게 설명해드립니다"
- **h2 (Features):** "주요 기능 안내"
- **h3 (Cards):** "약관 업로드", "자연어 질문", "정확한 근거 제시"

### 메타데이터 계층 구조

- **`app/layout.tsx` (루트):** 공통 metadata (title 템플릿, openGraph, twitter, default robots)
- **`app/dashboard/layout.tsx` (신규):** `metadata: { robots: { index: false, follow: false } }` 덮어쓰기
- **Landing:** 루트 metadata 상속 (index: true, follow: true)

루트 `app/layout.tsx`에 전부 넣으면 대시보드도 `index: true`가 되므로, 대시보드 전용 layout을 두어 metadata를 개별 지정한다.

### 동적 사이트맵 (`app/sitemap.ts`)

```typescript
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
export default function sitemap() {
  return [
    { url: baseUrl, lastModified: new Date(), priority: 1.0 },
    { url: `${baseUrl}/login`, lastModified: new Date(), priority: 0.5 },
    { url: `${baseUrl}/privacy`, lastModified: new Date(), priority: 0.1 },
    { url: `${baseUrl}/terms`, lastModified: new Date(), priority: 0.1 },
  ];
}
```

### `NEXT_PUBLIC_APP_URL` 환경변수 전략

**핵심 원칙:** 로컬은 코드의 fallback(`|| 'http://localhost:3000'`)으로 동작시키고, Railway 운영 배포 시에만 실제 도메인을 주입한다. 로컬 `.env` 파일에는 넣지 않는다.

| 환경 | 설정 방법 |
|---|---|
| 로컬 (minikube) | 미설정 → 코드 fallback이 `http://localhost:3000` 반환 |
| Railway 운영 | 대시보드에서 `NEXT_PUBLIC_APP_URL=https://<실제도메인>` 설정 |

**Dockerfile 변경 (build arg 추가, 값 없어도 OK):**

```dockerfile
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
```

**docker-compose.yml 변경 (선택적 전달):**

```yaml
ui-service:
  build:
    context: ./ui-service
    args:
      NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      NEXT_PUBLIC_APP_URL: ${NEXT_PUBLIC_APP_URL:-}
```

`${VAR:-}` 구문은 미설정 시 빈 문자열이 전달되고, 코드의 fallback이 동작한다. 루트 `.env`에 `NEXT_PUBLIC_APP_URL`을 넣지 않는 것이 핵심. Railway에서는 env var가 자동으로 빌드 시 주입되어 실제 도메인이 번들에 구워진다.

---

## Google AdSense 최적화

### 레이아웃 시프트(CLS) 방지 설계
- **위치:** `CitationPanel.tsx` 최하단 고정 영역
- **스타일:** `min-h-[100px]`, `bg-gray-50/50`, `rounded-md`
- **로직:** 
    - `NEXT_PUBLIC_ADSENSE_PUB_ID` 존재 시에만 렌더링
    - 광고 로딩 전 "광고 안내" 텍스트 또는 빈 영역으로 자리 확보 (CLS 0.1 이하 유지)

### 필수 정적 페이지 추가
- **`/privacy`**: 수집하는 정보(이메일, PDF 데이터), 쿠키 사용 안내, AdSense 데이터 활용 고지
- **`/terms`**: 서비스 이용 원칙, AI 생성 답변의 책임 한계 고지

---

## 변경 범위 및 작업 리스트

| 파일 | 변경 사항 |
|---|---|
| `app/page.tsx` | 랜딩 페이지 구현 + 세션 체크 리다이렉트 로직 |
| `app/dashboard/page.tsx` | 기존 대시보드 이동 |
| `app/dashboard/layout.tsx` | 신규 — `robots: { index: false, follow: false }` metadata |
| `app/privacy/page.tsx` | 개인정보처리방침 (AdSense 승인용) |
| `app/terms/page.tsx` | 이용약관 (AdSense 승인용) |
| `app/layout.tsx` | 공통 metadata (title 템플릿, openGraph), AdSense 스크립트 비동기 주입 |
| `app/sitemap.ts`, `app/robots.ts` | 신규 — `NEXT_PUBLIC_APP_URL` fallback 기반 동적 도메인 |
| `app/components/JsonLd.tsx` | 신규 — SoftwareApplication JSON-LD 구조화 데이터 |
| `app/components/CitationPanel.tsx` | AdSense 슬롯 추가 (CLS 방지용 min-h 컨테이너) |
| `middleware.ts` | public path(`/`, `/privacy`, `/terms`, `/sitemap.xml`, `/robots.txt`) 예외 처리 |
| `ui-service/Dockerfile` | `NEXT_PUBLIC_APP_URL` build arg 추가 |
| `docker-compose.yml` | ui-service args에 `NEXT_PUBLIC_APP_URL: ${NEXT_PUBLIC_APP_URL:-}` 추가 |

---

## 검증 기준

- [ ] **리다이렉트:** 로그인 후 `/` 접속 시 `/dashboard`로 즉시 이동하는가?
- [ ] **SEO:** `view-source`에서 h1 태그와 JSON-LD가 정상적으로 노출되는가?
- [ ] **AdSense:** 광고 로딩 중일 때 레이아웃이 크게 흔들리지 않는가?
- [ ] **배포 적합성:** `NEXT_PUBLIC_APP_URL`이 없어도 로컬 서버에서 에러가 발생하지 않는가?
- [ ] **법적 문서:** `/privacy`와 `/terms` 페이지에 최소한의 텍스트가 채워져 있는가?
