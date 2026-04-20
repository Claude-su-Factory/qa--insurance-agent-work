# Claude Design 기반 UI/UX 리디자인 스펙

**작성일:** 2026-04-19
**상태:** 사용자 승인 대기
**핸드오프 소스:** `/Users/yuhojin/Desktop/QA Agent/b-landing.html`, `b-login.html`, `b-dashboard.html` (Claude Design 출력)

---

## 배경

Claude Design으로 3개 페이지(Landing / Login / Dashboard) mockup 확보. 현재 Next.js 14 + Tailwind 구현본을 mockup 기준으로 재작업한다.

현재 컴포넌트 구조 (`ui-service/app/`):
- `page.tsx` → `LandingNav` + `LandingHero` + `LandingFeatures` + `LandingSteps` + `LandingCTA` + `LandingFooter`
- `login/page.tsx` — 단일 카드 + Google 버튼
- `dashboard/page.tsx` — topbar + `LeftPanel` + `ChatPanel` + `CitationPanel`

Mockup 특징:
- 브랜드: **ClauseIQ**
- 인디고 accent(`#4F46E5`), CSS 변수 기반 토큰, 라이트/다크 토글
- Lucide 아이콘
- 세련된 간격, 둥근 모서리, subtle shadow

---

## 목표 & 비목표

### 목표
- 시각적 완성도 향상 (포트폴리오 첫인상)
- 브랜드 일관성 (랜딩/로그인/대시보드 톤 통일)
- 근거 인용의 시각적 강조 (ClauseIQ의 차별화 포인트)

### 비목표
- Mockup상 있지만 실제 기능이 없는 것들에 대한 신규 기능 구현 (아래 "드롭 항목" 참조)
- 성능/접근성 개선 (별도 작업)
- 반응형(모바일) 최적화 (데스크톱 우선, mockup도 데스크톱 중심)

---

## 스코프 결정 (제안값 + 대안)

### A. 브랜드 rename
- **제안:** YES. 공개 문구(UI, meta, OG)에 "ClauseIQ" 사용. 저장소/코드 심볼/디렉토리/CLAUDE.md는 기존 유지.
- **대안:** 기존 "보험 약관 QA" 유지

### B. 라이트/다크 테마 토글
- **제안:** NO (라이트 only). Mockup의 CSS 변수 구조는 채택하되 토글 UI/저장 로직은 YAGNI.
- **대안:** 전체 채택 (ThemeProvider + 토글 버튼 + localStorage)

### C. AdSense 슬롯
- **제안:** 유지. `<head>` 검증 스크립트는 기존대로 유지(승인 진행 중), `CitationPanel` 하단 `AdSenseSlot`도 mockup 스타일에 맞춰 컨테이너만 다듬어 유지.
- **대안:** 제거 (심사 보류 리스크 있음)

### D. Landing nav 항목 "기능 / 가격 / 문서 / 블로그"
- **제안:** "기능"만 유지(섹션 앵커). 가격/문서/블로그 드롭 — 페이지 실체 없음.
- **대안:** 외부 링크(GitHub 등)로 대체

### E. Hero의 "60초 데모" 버튼
- **제안:** 드롭. 영상 실체 없음.
- **대안:** GitHub README 링크 재활용

### F. Features 오타 "Voyage AI · 1536-dim"
- **수정:** "Voyage AI `voyage-2` · 1024-dim"

### G. Metrics band 숫자 ("2.4초", "96%", "120p", "0건")
- **제안:** 포트폴리오에 검증된 수치 없음 → **섹션 전체 드롭** 또는 정성적 문구 교체
  - 예: "self-correction 루프", "조항 단위 근거 인용", "Langfuse 전 요청 관찰"
- **대안:** 현재 eval_runs의 최신 결과(answer_relevance 등)를 실제 수치로 로드 (빌드 시 정적 생성 또는 런타임 페칭). 포트폴리오 ROI 낮아 드롭 권장.

### H. Login 이메일/GitHub 버튼
- **제안:** 드롭. Google OAuth만 유지. 나머지 UI 요소는 제거.
- **대안:** "Coming soon" disabled로 유지 (UX 거짓말이므로 비권장)

### I. Dashboard topbar 브레드크럼
- **제안:** 채택. 선택된 문서명 표시. 문서 미선택 시 "문서를 선택하세요".

### J. Dashboard topbar 검색/이력/설정 아이콘
- **제안:** 드롭. 해당 기능 없음. `avatar` + 로그아웃 버튼만 유지.

### K. Dashboard 채팅 타이틀 ("면책기간 및 지급조건 관련")
- **제안:** 드롭. 현재 채팅 세션은 문서 단위이며 별도 제목 개념 없음. `chat-head`는 문서명을 타이틀로 쓰고 질의/인용 카운트 chip만 유지.

### L. 질문 suggestion chips
- **제안:** 드롭. 프리셋 질문 세트 없음. 빈 대화 상태에서 placeholder만 제공.

### M. Composer 메타 행 (컨텍스트 + 단축키)
- **제안:** 채택. "컨텍스트: {문서명} · ⌘↵ 전송" 정도로 간결 유지. `Cmd+Enter` 전송 기능은 이미 구현돼 있으면 유지, 없으면 추가 판단.

### N. Agent 상태 chip
- **제안:** 채택. `query-service`/`ingestion-service` 헬스 주기 체크 → 정상/오류 표시. 단순 구현: `/api/health`를 한 번 체크해 정적 표시(포트폴리오 기준 간단). 
- **대안:** 항상 "Agent 정상" 표시 (거짓말 리스크)

---

## 페이지별 변경 사항

### Landing (`app/page.tsx` + `LandingNav/Hero/Features/Steps/CTA/Footer`)

**Nav**
- 좌: 로고(방패 SVG) + "ClauseIQ"
- 중: "기능" 앵커 링크 (드롭: 가격/문서/블로그)
- 우: "로그인" (secondary) + "무료 시작" (primary)
- sticky + `backdrop-filter: blur`

**Hero**
- Eyebrow badge (green dot + "v2.4 · 조항 단위 근거 인용 엔진")
- H1 64px, grad fg→muted
- Sub 17px muted
- Primary: "Google로 무료 시작 →" (→ `/login`)
- Secondary 드롭 (60초 데모 없음)

**Product frame**
- Browser chrome (dots + URL bar)
- 3-pane mini preview (docs / chat / citations) — 정적 SVG/HTML
- 라이트 테마 기준 subtle shadow

**Features grid (3-col)**
- 조항 단위 청킹 / 자가 채점 루프 / 투명한 인용
- icon chips, feature meta ("voyage-2 · 1024-dim" 등)
- 기존 `LandingSteps.tsx` 흡수 또는 드롭 결정 필요 — mockup엔 3단계 스텝 섹션 없음. 드롭 제안.

**Metrics band**
- 제안 G 채택 시: 드롭 또는 정성 문구

**CTA**
- 어두운 배경 + radial gradient
- "약관은 어렵지만, 답은 어렵지 않아야 합니다" + 서브 + Primary 버튼

**Footer**
- Copyright + 개인정보처리방침/이용약관 링크(기존 유지)

### Login (`app/login/page.tsx`)

**레이아웃:** split (980px, 1fr:1fr)
- **좌 pane:** brand + pitch (eyebrow + H2 + sub + 3 check items + meta footer)
  - 3 check items는 실제 구현 사실에 근거:
    - "Supabase Auth(JWT) + X-Internal-Token 이중 보호"
    - "업로드 PDF 사용자별 격리 (Qdrant user_id 필터)"
    - "Langfuse 전 요청 관찰성"
- **우 pane:** H1 + sub + Google 버튼 + 이용약관 링크
  - 이메일/GitHub 버튼 드롭 (H 결정)
  - 이용약관 링크는 기존 `/terms`, `/privacy` 연결

### Dashboard (`app/dashboard/page.tsx`)

**Topbar (52px)**
- 좌: 로고 + "ClauseIQ" + `/` + 브레드크럼(문서명)
- 중: "Agent 정상" chip (N 결정)
- 우: avatar(사용자 이니셜) + 로그아웃 버튼
- 검색/이력/설정 아이콘 드롭

**3-pane shell (grid-template-columns: 260px 1fr 300px)**

**LeftPanel** (`LeftPanel.tsx`)
- 헤더: "내 약관" + 카운트
- 업로더: 점선 border + 인디고 icon + "드래그 · 최대 30MB" + "파일 선택" 버튼 (기존 업로드 로직 유지)
- "업로드됨" label + document list
  - 각 항목: 파일 아이콘(조항 수에 따라 active 하이라이트) + 제목 + "N 조항 · YYYY" (현재 코드에 업로드 연도 없으면 "N 조항"만)
  - active 상태는 `document_id` 일치 시 인디고 accent

**ChatPanel** (`ChatPanel.tsx`)
- `chat-head`: 문서명 타이틀 + chip 3개 (질의 수 / 인용 수 / 모델명 "Claude Sonnet 4.6")
- `thread`:
  - user 메시지: 우측 정렬, fg 배경 bubble
  - assistant 메시지: 좌측 아바타(sparkles 아이콘) + 본문 bubble
  - bubble 내부에 `<span class="cite">제14조</span>` 인라인 (기존 citation 렌더 로직 조정)
  - 타임스탬프 + "인용 N건 · X.X초" meta
  - progress 상태: QueryProgress 컴포넌트를 mockup의 `.progress` 디자인으로 교체
- `composer`:
  - 테두리 input, 포커스 시 인디고 border
  - 우측 send 버튼(arrow-up 아이콘)
  - suggestion chips 드롭 (L 결정)
  - meta row: "컨텍스트: {문서명} · ⌘↵ 전송"

**CitationPanel** (`CitationPanel.tsx`)
- 헤더: "근거 조항" + 카운트
- 각 카드:
  - 상단: 조항 번호 chip (인디고 bg) + 점수 %
  - 제목 + 요약(3줄 클램프)
  - 하단 점수 바 (`--w` CSS var)
- active state: 카드 border 인디고 + bg 인디고-soft
- 빈 상태: mockup에 없음 — 기존 placeholder 유지
- AdSense slot: 리스트 하단에 mockup 컨테이너 스타일로 유지 (C 결정)

---

## 기술 결정

### 스타일링
- **CSS 변수 + Tailwind arbitrary values 병행**
  - `globals.css`에 `:root`에 mockup의 CSS 변수(`--bg`, `--fg`, `--accent` 등) 정의
  - 컴포넌트에선 `className="bg-[var(--bg)]"` 형태로 사용
  - 이유: Tailwind theme extend로 하면 기존 Tailwind 클래스와의 충돌/선택 복잡. 직접 변수가 더 명시적.
- **라이트 only** (`:root` 만 정의, `[data-theme="dark"]` 드롭)

### 아이콘
- **`lucide-react` 설치** (mockup이 Lucide 사용)
- Tree-shaking: 명시 import만 (`import { FileText, Search } from "lucide-react"`)

### 폰트
- mockup은 system font + 'SF Mono' monospace
- 기존 `app/fonts/` 확인 후 유지 or Pretendard 등 한국어 최적화 폰트로 업그레이드 여부 결정 (이번 스코프는 기존 유지)

### 접근성
- 기본 최소 수준만: alt/aria 라벨, 포커스 링 유지. 상세 A11y 감사는 별도 스코프.

---

## 파일 영향

### 신규
- `app/components/icons/` (필요 시 Lucide wrapper)

### 수정 (대규모)
- `app/page.tsx` (구조만 조정)
- `app/layout.tsx` (브랜드 meta, lucide 초기화 불필요 — react 버전 사용)
- `app/globals.css` (CSS 변수 추가)
- `app/login/page.tsx` (split 레이아웃)
- `app/dashboard/page.tsx` (topbar 구조)
- `app/components/LandingNav.tsx`
- `app/components/LandingHero.tsx`
- `app/components/LandingFeatures.tsx`
- `app/components/LandingCTA.tsx`
- `app/components/LandingFooter.tsx`
- `app/components/LeftPanel.tsx`
- `app/components/ChatPanel.tsx`
- `app/components/CitationPanel.tsx`
- `app/components/QueryProgress.tsx`
- `app/components/AdSenseSlot.tsx` (컨테이너 스타일만)
- `app/components/LogoutButton.tsx` (topbar 스타일 통일)
- `package.json` (lucide-react 추가)
- `app/sitemap.ts`, SEO metadata (브랜드명 변경 반영)

### 삭제 (후보)
- `app/components/LandingSteps.tsx` (mockup에 step 섹션 없음 — 드롭 제안)

---

## 검증

- [ ] 3개 페이지 로컬 실행 (`docker compose up -d`, http://localhost:3000)
- [ ] 라이트 테마 시각 일치 (mockup vs 구현)
- [ ] 기존 기능 정상 동작 확인
  - [ ] Google OAuth 로그인
  - [ ] PDF 업로드 → 상태 표시
  - [ ] 쿼리 POST → SSE 진행 상태 → 답변/인용 렌더
  - [ ] 문서 선택 시 대시보드 URL/컨텍스트 전환
- [ ] AdSense 스크립트 head 존재 유지 확인 (curl)
- [ ] Lighthouse 점수 비하락 (best-effort, 필수 아님)
- [ ] 빌드 통과 (`next build`)
- [ ] CI 6 job green

---

## 스코프 제외

- 다크 테마
- 반응형(모바일) 레이아웃
- 접근성 종합 감사
- i18n(영문 동시 지원)
- 성능 최적화(이미지, 프리페치 등)
- 새 페이지(가격, 문서, 블로그)
- 이메일/GitHub 로그인 공급자 추가
- 실측 메트릭 연동(Langfuse/eval 결과 랜딩 주입)
- 단축키 기능 신규 구현(기존 없으면 표기만)

---

## 검토 이력

### 2026-04-19 자체 검토 (작성 직후)

**Critical**
- AdSense `<head>` 스크립트 유지 필요 (C 결정). 슬롯 제거 시에도 pub 검증 스크립트는 유지해야 심사 영향 없음. 본문 C에서 명시.
- 브랜드 rename 시 SEO metadata(`app/layout.tsx` OG/title), sitemap 재생성 필요. 파일 영향 섹션에 추가.
- `redirect("/dashboard")` 로직 유지 — login 페이지 진입 시 세션이 있으면 대시보드로. 기존 `app/page.tsx`에 이미 있음. 리디자인 중 제거되지 않도록 주의 → 구현 단계 테스트 항목에 반영.

**Important**
- Metrics band를 드롭하지 않고 정성 문구로 가면 mockup과 시각 불균형 생김(숫자 자리인데 텍스트). 전체 섹션 드롭을 기본값으로 잡는 쪽이 깔끔. 본문 G에 반영.
- `LandingSteps.tsx`는 현재 유저 플로우 교육용인데 mockup이 대체할지 확신 없음. 삭제 후보로만 두고 구현 단계에서 최종 판단.
- Lucide-react 번들 사이즈 주의 — 명시 import 강제 (기술 결정에 반영).
- `ChatPanel` 교체 시 기존 citation 파싱/SSE 이벤트 처리 로직을 건드리지 않도록 주의. 시각만 변경, 로직 유지.
- ThemeProvider 없이 CSS 변수만 쓰는 구조는 light-only라면 깔끔하지만, 향후 dark 추가 시 `html[data-theme]` 속성 토글 + 저장 로직 필요 — 확장 경로는 열려있음.

**Minor**
- Login pitch 3 check items 문구는 실제 구현에 근거. "1024-dim" 등 숫자 오타 재발 방지 위해 Features 문구도 `voyage-2` 공식 ID로 표기 (본문 F).
- Cmd+Enter 단축키: 현재 코드에 있는지 모름 — 구현 단계에서 `ChatPanel`의 keydown 핸들러 확인. 없으면 meta-row 문구만 채택하거나 추가 구현 1줄로 해결.
- Avatar 이니셜은 user.email 앞 1자 또는 user metadata full_name 첫 글자 — Supabase user 객체에서 파싱.

**패치 반영**
- Critical 3건: C 섹션 명시(AdSense head 유지), 파일 영향에 sitemap/metadata 추가, 검증 체크리스트에 기능 정상 동작 세부 항목 포함.
- Important: G 결정 제안값을 "전체 드롭"으로 강화, 기술 결정에 Lucide tree-shaking 명시.
- Minor: F에 `voyage-2` 명시, 스코프 제외에 "단축키 신규 구현" 추가.

**후속 검토 필요 시점**
- 사용자가 스코프 결정(A~N) 답변 → 스펙 최종 확정
- 최종 확정 후 `superpowers:writing-plans`로 구현 계획 작성
