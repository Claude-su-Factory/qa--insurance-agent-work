# Phase 1: Auth + 사용자 데이터 격리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google 소셜 로그인과 사용자별 데이터 격리를 구현하여 일반 공개 서비스로 전환한다.

**Architecture:** ui-service가 Supabase JWT를 검증하는 인증 게이트웨이 역할을 하며, `X-User-ID` 헤더로 내부 서비스(ingestion-service, query-service)에 인증된 사용자 ID를 전달한다. Qdrant 포인트 payload에 user_id를 저장하고, 검색 시 필터링하여 사용자 간 데이터를 격리한다.

**Tech Stack:** Next.js 14 + `@supabase/ssr` | Go + Supabase REST API | TypeScript + Qdrant filter | K8s Secrets

---

## 파일 구조

```
ui-service/
├── middleware.ts                              신규 — 인증 게이트웨이
├── app/
│   ├── lib/supabase/
│   │   ├── client.ts                         신규 — 브라우저 Supabase 클라이언트
│   │   └── server.ts                         신규 — 서버 Supabase 클라이언트
│   ├── auth/callback/
│   │   └── route.ts                          신규 — OAuth 콜백 처리
│   ├── login/
│   │   └── page.tsx                          신규 — 로그인 페이지
│   ├── context/AppContext.tsx                수정 — user 상태 추가
│   ├── components/
│   │   └── LeftPanel.tsx                     수정 — 로그아웃, Supabase 문서 목록
│   ├── api/
│   │   ├── ingest/route.ts                   수정 — X-User-ID 헤더 추가
│   │   ├── ingest/status/[jobId]/route.ts    수정 — X-User-ID 헤더 추가
│   │   └── query/route.ts                    수정 — X-User-ID, X-Session-ID 헤더 추가
│   ├── page.tsx                              수정 — 서버에서 user fetch
│   └── layout.tsx                            수정 — Supabase 쿠키 갱신

ingestion-service/
├── internal/
│   ├── supabase/
│   │   └── client.go                         신규 — Supabase REST 클라이언트
│   ├── store/store.go                         수정 — Upsert에 userID 파라미터 추가
│   ├── store/store_test.go                    수정 — userID 파라미터 반영
│   └── handler/
│       ├── ingest.go                          수정 — X-User-ID 헤더 처리, Supabase INSERT
│       └── ingest_test.go                     수정 — userID 테스트 추가

query-service/src/
├── graph/
│   ├── state.ts                              수정 — userId, sessionId 필드 추가
│   └── nodes/retriever.ts                    수정 — userId 필터 적용
├── clients/qdrant.ts                         수정 — search에 userId 파라미터 추가
└── index.ts                                  수정 — 헤더에서 userId, sessionId 읽기

k8s/
├── supabase-secret.yaml                      신규 — SUPABASE_URL, SERVICE_ROLE_KEY
├── ingestion-service/deployment.yaml         수정 — supabase-secret 마운트
└── ui-service/deployment.yaml               수정 — SUPABASE 환경변수 추가
```

---

## Task 1: Supabase 프로젝트 & 스키마 설정

**Files:**
- 해당 없음 (Supabase 대시보드 작업)

- [ ] **Step 1: Supabase 프로젝트 생성**

[supabase.com](https://supabase.com) → New Project 생성. 완료 후 Project URL과 API Keys(anon, service_role) 복사.

- [ ] **Step 2: Google OAuth 설정**

Supabase 대시보드 → Authentication → Providers → Google 활성화.

[Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → OAuth 2.0 Client ID 생성:
- Authorized redirect URIs: `https://<your-project>.supabase.co/auth/v1/callback`

발급된 Client ID와 Client Secret을 Supabase Google Provider에 입력.

- [ ] **Step 3: documents 테이블 생성**

Supabase 대시보드 → SQL Editor에서 실행:

```sql
CREATE TABLE documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  chunk_count INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_documents_only"
  ON documents FOR ALL
  USING (auth.uid() = user_id);
```

- [ ] **Step 4: 환경변수 메모**

다음 값들을 메모해둔다:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_URL=https://xxxx.supabase.co
```

---

## Task 2: ui-service — Supabase 클라이언트 & 미들웨어

**Files:**
- Create: `ui-service/app/lib/supabase/client.ts`
- Create: `ui-service/app/lib/supabase/server.ts`
- Create: `ui-service/middleware.ts`

- [ ] **Step 1: 패키지 설치**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ui-service
npm install @supabase/supabase-js @supabase/ssr
```

Expected: `added X packages`

- [ ] **Step 2: 브라우저 클라이언트 생성**

`ui-service/app/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 3: 서버 클라이언트 생성**

`ui-service/app/lib/supabase/server.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component에서 호출 시 무시
          }
        },
      },
    }
  );
}
```

- [ ] **Step 4: 미들웨어 생성**

`ui-service/middleware.ts` (ui-service 루트, app/ 바깥):

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isPublicPath =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/auth");

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
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
git add ui-service/app/lib/ ui-service/middleware.ts ui-service/package.json ui-service/package-lock.json
git commit -m "feat(ui): add Supabase SSR client and auth middleware"
```

---

## Task 3: ui-service — 로그인 페이지 & OAuth 콜백

**Files:**
- Create: `ui-service/app/login/page.tsx`
- Create: `ui-service/app/auth/callback/route.ts`

- [ ] **Step 1: 로그인 페이지 생성**

`ui-service/app/login/page.tsx`:

```tsx
"use client";

import { createClient } from "../lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <main className="flex h-screen items-center justify-center bg-slate-100">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-80 text-center">
        <div className="w-12 h-12 bg-gradient-to-br from-blue-700 to-blue-500 rounded-xl flex items-center justify-center text-2xl mx-auto mb-4">
          🛡️
        </div>
        <h1 className="text-lg font-bold text-slate-800 mb-1">보험 약관 QA</h1>
        <p className="text-[12px] text-slate-400 mb-6">
          AI 기반 보험 약관 질의응답 서비스
        </p>
        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Google로 계속하기
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: OAuth 콜백 라우트 생성**

`ui-service/app/auth/callback/route.ts`:

```typescript
import { createClient } from "../../lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/`);
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
git add ui-service/app/login/ ui-service/app/auth/
git commit -m "feat(ui): add login page and OAuth callback route"
```

---

## Task 4: ui-service — AppContext user 상태 & Header 로그아웃

**Files:**
- Modify: `ui-service/app/context/AppContext.tsx`
- Modify: `ui-service/app/page.tsx`
- Modify: `ui-service/app/layout.tsx`

- [ ] **Step 1: AppContext에 user 상태 추가**

`ui-service/app/context/AppContext.tsx`의 기존 `AppContextType` 인터페이스에 추가:

```typescript
"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import type { User } from "@supabase/supabase-js";

export interface DocumentMeta {
  id: string;
  filename: string;
  clauseCount: number;
  createdAt: string;
}

export interface IngestingDoc {
  jobId: string;
  filename: string;
  filesize: string;
  progress: number;
  currentStep: "parsing" | "chunking" | "embedding" | "storing" | "done" | "failed";
  currentChunk: number;
  totalChunks: number;
  error?: string;
}

export interface Citation {
  clauseNumber: string;
  clauseTitle: string;
  excerpt: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  timestamp: Date;
}

interface AppContextType {
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  documents: DocumentMeta[];
  setDocuments: React.Dispatch<React.SetStateAction<DocumentMeta[]>>;
  ingesting: IngestingDoc | null;
  setIngesting: React.Dispatch<React.SetStateAction<IngestingDoc | null>>;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  citations: Citation[];
  setCitations: React.Dispatch<React.SetStateAction<Citation[]>>;
  activeCitation: number | null;
  setActiveCitation: React.Dispatch<React.SetStateAction<number | null>>;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser: User | null;
}) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [ingesting, setIngesting] = useState<IngestingDoc | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [activeCitation, setActiveCitation] = useState<number | null>(null);

  return (
    <AppContext.Provider
      value={{
        user, setUser,
        documents, setDocuments,
        ingesting, setIngesting,
        messages, setMessages,
        citations, setCitations,
        activeCitation, setActiveCitation,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
```

- [ ] **Step 2: layout.tsx 업데이트**

`ui-service/app/layout.tsx`를 서버 컴포넌트로 유지하면서 user를 가져와 AppProvider에 전달:

```tsx
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
```

- [ ] **Step 3: page.tsx Header에 유저 정보 & 로그아웃 추가**

`ui-service/app/page.tsx` 전체 교체:

```tsx
import LeftPanel from "./components/LeftPanel";
import ChatPanel from "./components/ChatPanel";
import CitationPanel from "./components/CitationPanel";
import LogoutButton from "./components/LogoutButton";
import { createClient } from "./lib/supabase/server";

export default async function Home() {
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

- [ ] **Step 4: LogoutButton 컴포넌트 생성**

`ui-service/app/components/LogoutButton.tsx`:

```tsx
"use client";

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
      className="text-[11px] px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
    >
      로그아웃
    </button>
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
git add ui-service/app/context/AppContext.tsx ui-service/app/page.tsx ui-service/app/layout.tsx ui-service/app/components/LogoutButton.tsx
git commit -m "feat(ui): add user state to AppContext and logout button"
```

---

## Task 5: ui-service — API Routes X-User-ID 전달

**Files:**
- Modify: `ui-service/app/api/ingest/route.ts`
- Modify: `ui-service/app/api/ingest/status/[jobId]/route.ts`
- Modify: `ui-service/app/api/query/route.ts`

- [ ] **Step 1: ingest/route.ts 수정**

`ui-service/app/api/ingest/route.ts` 전체 교체:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const ingestionUrl = process.env.INGESTION_API_URL;

  const res = await fetch(`${ingestionUrl}/ingest`, {
    method: "POST",
    headers: { "X-User-ID": user.id },
    body: formData,
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 2: ingest/status/[jobId]/route.ts 수정**

`ui-service/app/api/ingest/status/[jobId]/route.ts` 전체 교체:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ingestionUrl = process.env.INGESTION_API_URL;

  const res = await fetch(`${ingestionUrl}/ingest/status/${params.jobId}`, {
    cache: "no-store",
    headers: { "X-User-ID": user.id },
  });

  if (res.status === 404) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 3: query/route.ts 수정**

`ui-service/app/api/query/route.ts` 전체 교체:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../lib/supabase/server";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const queryUrl = process.env.QUERY_API_URL;
  const sessionId = req.headers.get("x-session-id") ?? randomUUID();

  const res = await fetch(`${queryUrl}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-ID": user.id,
      "X-Session-ID": sessionId,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 4: 타입 체크**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ui-service
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git add ui-service/app/api/
git commit -m "feat(ui): pass X-User-ID header from authenticated session to backend"
```

---

## Task 6: ui-service — LeftPanel Supabase 문서 목록 연동

**Files:**
- Modify: `ui-service/app/components/LeftPanel.tsx`

LeftPanel은 현재 로컬 state로 문서 목록을 관리한다. Supabase documents 테이블에서 fetch하도록 변경하고, 인제스천 완료 시 Supabase에도 반영한다.

- [ ] **Step 1: LeftPanel.tsx 전체 교체**

```tsx
"use client";

import { useRef, useState, useEffect, useCallback } from "react";
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
  const { documents, setDocuments, ingesting, setIngesting } = useApp();
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  // 초기 문서 목록 로드
  useEffect(() => {
    async function loadDocuments() {
      const { data } = await supabase
        .from("documents")
        .select("id, filename, chunk_count, created_at")
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

  // 1초 polling
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
        // Supabase에서 최신 문서 목록 재조회
        const { data: docs } = await supabase
          .from("documents")
          .select("id, filename, chunk_count, created_at")
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
    <aside className="w-60 bg-white flex flex-col border-r border-slate-100 flex-shrink-0">
      <div className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
        📁 내 약관
      </div>

      <div className="p-3">
        <div
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
            isDragOver
              ? "border-blue-500 bg-blue-50"
              : "border-blue-200 bg-slate-50 hover:border-blue-400 hover:bg-blue-50"
          }`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="text-2xl mb-2">📄</div>
          <p className="text-[11px] text-slate-500 mb-1">PDF 약관 파일 업로드</p>
          <p className="text-[10px] text-slate-400 mb-3">드래그 앤 드롭 또는</p>
          <button className="bg-blue-600 text-white text-[11px] font-semibold px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
            파일 선택
          </button>
          <input ref={inputRef} type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
        </div>
      </div>

      {ingesting && (
        <div className="mx-3 mb-3 bg-white border border-slate-200 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">📑</span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-slate-800 truncate">{ingesting.filename}</p>
              <p className="text-[9px] text-slate-400">{ingesting.filesize}</p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <CircleProgress
              progress={ingesting.progress}
              label={ingesting.currentStep === "done" ? "완료" : "처리중"}
            />
            <div className="flex-1 bg-slate-50 rounded-lg p-2 font-mono">
              {STEPS.map((step) => {
                const stepIndex = STEPS.indexOf(step);
                const currentIndex = STEPS.indexOf(ingesting.currentStep as typeof STEPS[number]);
                const isDone = stepIndex < currentIndex || ingesting.currentStep === "done";
                const isActive = step === ingesting.currentStep;
                return (
                  <div key={step} className={`flex items-center gap-2 text-[9px] mb-1.5 last:mb-0 ${isDone ? "text-green-600" : isActive ? "text-blue-600" : "text-slate-300"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isDone ? "bg-green-500" : isActive ? "bg-blue-500 animate-pulse" : "bg-slate-200"}`} />
                    <span>
                      {isDone ? `✓ ${STEP_LABELS[step]}` : isActive
                        ? `${STEP_LABELS[step]}${ingesting.totalChunks > 0 ? ` ${ingesting.currentChunk}/${ingesting.totalChunks}` : "..."}`
                        : STEP_LABELS[step]}
                    </span>
                  </div>
                );
              })}
              {ingesting.currentStep === "failed" && (
                <div className="text-red-500 text-[9px]">✗ {ingesting.error}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {documents.length > 0 && (
        <>
          <div className="px-4 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">업로드된 약관</div>
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-blue-50 border border-blue-100 cursor-pointer hover:border-blue-300 transition-colors">
                <div className="w-7 h-8 bg-blue-100 rounded flex items-center justify-center text-xs flex-shrink-0">📋</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-slate-800 truncate">{doc.filename.replace(".pdf", "")}</p>
                  <p className="text-[9px] text-slate-400">{doc.clauseCount}개 조항</p>
                </div>
                <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[8px] font-bold">✓</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </aside>
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
git add ui-service/app/components/LeftPanel.tsx
git commit -m "feat(ui): load document list from Supabase per user"
```

---

## Task 7: ingestion-service — Qdrant store user_id 지원

**Files:**
- Modify: `ingestion-service/internal/store/store.go`
- Modify: `ingestion-service/internal/store/store_test.go`

- [ ] **Step 1: store_test.go 업데이트 (TDD — 먼저 실패 확인)**

`ingestion-service/internal/store/store_test.go` 전체 교체:

```go
package store_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/store"
)

type MockStore struct {
	UpsertedChunks []string
	LastUserID     string
	Err            error
}

func (m *MockStore) Upsert(_ context.Context, chunks []string, vectors [][]float32, docName string, userID string) error {
	if m.Err != nil {
		return m.Err
	}
	m.UpsertedChunks = append(m.UpsertedChunks, chunks...)
	m.LastUserID = userID
	return nil
}

func (m *MockStore) EnsureCollection(_ context.Context, vectorSize uint64) error {
	return m.Err
}

func TestMockStore_Upsert(t *testing.T) {
	mock := &MockStore{}
	err := mock.Upsert(
		context.Background(),
		[]string{"chunk1", "chunk2"},
		[][]float32{{0.1}, {0.2}},
		"삼성생명_암보험",
		"user-uuid-123",
	)
	assert.NoError(t, err)
	assert.Equal(t, []string{"chunk1", "chunk2"}, mock.UpsertedChunks)
	assert.Equal(t, "user-uuid-123", mock.LastUserID)
}

// QdrantStore가 Store 인터페이스를 구현하는지 컴파일 타임 확인
var _ store.Store = (*store.QdrantStore)(nil)
```

- [ ] **Step 2: 테스트 실행하여 컴파일 에러 확인**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ingestion-service
go test ./internal/store/... -v 2>&1 | tail -10
```

Expected: `cannot use *store.QdrantStore as type store.Store` 또는 시그니처 불일치 에러

- [ ] **Step 3: store.go Upsert 시그니처 + payload 업데이트**

`ingestion-service/internal/store/store.go` 전체 교체:

```go
package store

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/google/uuid"
)

type Store interface {
	Upsert(ctx context.Context, chunks []string, vectors [][]float32, docName string, userID string) error
	EnsureCollection(ctx context.Context, vectorSize uint64) error
}

type QdrantStore struct {
	baseURL    string
	collection string
}

func New(baseURL, collection string) Store {
	return &QdrantStore{baseURL: baseURL, collection: collection}
}

type point struct {
	ID      string         `json:"id"`
	Vector  []float32      `json:"vector"`
	Payload map[string]any `json:"payload"`
}

func (q *QdrantStore) Upsert(ctx context.Context, chunks []string, vectors [][]float32, docName string, userID string) error {
	points := make([]point, len(chunks))
	for i, chunk := range chunks {
		points[i] = point{
			ID:     uuid.New().String(),
			Vector: vectors[i],
			Payload: map[string]any{
				"content":       chunk,
				"document_name": docName,
				"chunk_index":   i,
				"user_id":       userID,
			},
		}
	}

	body, err := json.Marshal(map[string]any{"points": points})
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s/collections/%s/points", q.baseURL, q.collection)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("qdrant upsert error: status %d", resp.StatusCode)
	}
	return nil
}

func (q *QdrantStore) EnsureCollection(ctx context.Context, vectorSize uint64) error {
	url := fmt.Sprintf("%s/collections/%s", q.baseURL, q.collection)
	body, _ := json.Marshal(map[string]any{
		"vectors": map[string]any{
			"size":     vectorSize,
			"distance": "Cosine",
		},
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusBadRequest {
		return fmt.Errorf("qdrant create collection error: status %d", resp.StatusCode)
	}
	return nil
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
go test ./internal/store/... -v 2>&1 | grep -E "PASS|FAIL"
```

Expected: `PASS`

- [ ] **Step 5: 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git add ingestion-service/internal/store/
git commit -m "feat(ingestion): add user_id to Qdrant point payload"
```

---

## Task 8: ingestion-service — Supabase 클라이언트

**Files:**
- Create: `ingestion-service/internal/supabase/client.go`

- [ ] **Step 1: supabase/client.go 생성**

```go
package supabase

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

type Client struct {
	url            string
	serviceRoleKey string
}

func New(url, serviceRoleKey string) *Client {
	return &Client{url: url, serviceRoleKey: serviceRoleKey}
}

type DocumentRecord struct {
	UserID     string `json:"user_id"`
	Filename   string `json:"filename"`
	ChunkCount int    `json:"chunk_count"`
}

func (c *Client) InsertDocument(ctx context.Context, doc DocumentRecord) error {
	body, err := json.Marshal(doc)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		fmt.Sprintf("%s/rest/v1/documents", c.url),
		bytes.NewReader(body),
	)
	if err != nil {
		return err
	}
	req.Header.Set("apikey", c.serviceRoleKey)
	req.Header.Set("Authorization", "Bearer "+c.serviceRoleKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Prefer", "return=minimal")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("supabase insert document failed: status %d", resp.StatusCode)
	}
	return nil
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ingestion-service
go build ./...
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git add ingestion-service/internal/supabase/
git commit -m "feat(ingestion): add Supabase REST client for document metadata"
```

---

## Task 9: ingestion-service — handler user_id 처리 & Supabase 연동

**Files:**
- Modify: `ingestion-service/internal/handler/ingest.go`
- Modify: `ingestion-service/internal/handler/ingest_test.go`
- Modify: `ingestion-service/cmd/main.go`

- [ ] **Step 1: ingest_test.go 업데이트 (TDD)**

기존 테스트 파일에서 `newTestAppWithJobStore`에 supabase 클라이언트 파라미터 추가 및 X-User-ID 테스트 추가.

`ingestion-service/internal/handler/ingest_test.go` 전체 교체:

```go
package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/config"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/handler"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/job"
)

// --- Mocks ---

type mockParser struct {
	text string
	err  error
}

func (m *mockParser) Extract(_ string) (string, error) { return m.text, m.err }

type mockChunker struct{ chunks []string }

func (m *mockChunker) Chunk(_ string, _, _ int) []string { return m.chunks }

type mockEmbedder struct {
	vecs [][]float32
	err  error
}

func (m *mockEmbedder) Embed(_ context.Context, texts []string) ([][]float32, error) {
	if m.err != nil {
		return nil, m.err
	}
	result := make([][]float32, len(texts))
	for i := range texts {
		result[i] = m.vecs[i%len(m.vecs)]
	}
	return result, nil
}

type mockStore struct{ err error }

func (m *mockStore) Upsert(_ context.Context, _ []string, _ [][]float32, _ string, _ string) error {
	return m.err
}
func (m *mockStore) EnsureCollection(_ context.Context, _ uint64) error { return m.err }

type mockSupabase struct{ err error }

func (m *mockSupabase) InsertDocument(_ context.Context, _ string, _ string, _ int) error {
	return m.err
}

func newTestApp(p *mockParser, c *mockChunker, e *mockEmbedder, s *mockStore, sb *mockSupabase, js *job.Store) *fiber.App {
	cfg := &config.Config{}
	cfg.Chunking.ChunkSize = 512
	cfg.Chunking.Overlap = 50
	h := handler.New(p, c, e, s, sb, js, cfg)
	app := fiber.New()
	app.Post("/ingest", h.Handle)
	return app
}

func multipartPDF(filename string) (*bytes.Buffer, string) {
	body := &bytes.Buffer{}
	w := multipart.NewWriter(body)
	part, _ := w.CreateFormFile("file", filename)
	io.WriteString(part, "%PDF-1.4 fake pdf content")
	w.Close()
	return body, w.FormDataContentType()
}

func TestHandle_Success(t *testing.T) {
	app := newTestApp(
		&mockParser{text: "보험 약관 제1조"},
		&mockChunker{chunks: []string{"chunk1", "chunk2"}},
		&mockEmbedder{vecs: [][]float32{{0.1, 0.2}}},
		&mockStore{},
		&mockSupabase{},
		job.NewStore(),
	)

	body, ct := multipartPDF("samsung.pdf")
	req := httptest.NewRequest("POST", "/ingest", body)
	req.Header.Set("Content-Type", ct)
	req.Header.Set("X-User-ID", "test-user-123")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var result map[string]string
	json.NewDecoder(resp.Body).Decode(&result)
	assert.NotEmpty(t, result["jobId"])
	assert.Equal(t, "samsung", result["document"])
}

func TestHandle_MissingUserID(t *testing.T) {
	app := newTestApp(
		&mockParser{},
		&mockChunker{},
		&mockEmbedder{},
		&mockStore{},
		&mockSupabase{},
		job.NewStore(),
	)

	body, ct := multipartPDF("samsung.pdf")
	req := httptest.NewRequest("POST", "/ingest", body)
	req.Header.Set("Content-Type", ct)
	// X-User-ID 헤더 없음

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 401, resp.StatusCode)
}

func TestHandle_NonPDFRejected(t *testing.T) {
	app := newTestApp(&mockParser{}, &mockChunker{}, &mockEmbedder{}, &mockStore{}, &mockSupabase{}, job.NewStore())

	body := &bytes.Buffer{}
	w := multipart.NewWriter(body)
	part, _ := w.CreateFormFile("file", "document.txt")
	io.WriteString(part, "not a pdf")
	w.Close()

	req := httptest.NewRequest("POST", "/ingest", body)
	req.Header.Set("Content-Type", w.FormDataContentType())
	req.Header.Set("X-User-ID", "test-user-123")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 400, resp.StatusCode)
}

func TestHandle_MissingFile(t *testing.T) {
	app := newTestApp(&mockParser{}, &mockChunker{}, &mockEmbedder{}, &mockStore{}, &mockSupabase{}, job.NewStore())

	req := httptest.NewRequest("POST", "/ingest", nil)
	req.Header.Set("Content-Type", "multipart/form-data; boundary=xxx")
	req.Header.Set("X-User-ID", "test-user-123")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 400, resp.StatusCode)
}
```

- [ ] **Step 2: 테스트 실행하여 컴파일 에러 확인**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ingestion-service
go test ./internal/handler/... -v 2>&1 | tail -10
```

Expected: `handler.New` 시그니처 불일치 에러

- [ ] **Step 3: SupabaseInserter 인터페이스 + IngestHandler 업데이트**

`ingestion-service/internal/handler/ingest.go` 전체 교체:

```go
package handler

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/chunker"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/config"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/embedder"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/job"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/parser"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/store"
)

// SupabaseInserter는 문서 메타데이터를 Supabase에 저장하는 인터페이스다.
type SupabaseInserter interface {
	InsertDocument(ctx context.Context, userID string, filename string, chunkCount int) error
}

type IngestHandler struct {
	parser   parser.Parser
	chunker  chunker.Chunker
	embedder embedder.Embedder
	store    store.Store
	supabase SupabaseInserter
	jobStore *job.Store
	cfg      *config.Config
}

func New(p parser.Parser, c chunker.Chunker, e embedder.Embedder, s store.Store, sb SupabaseInserter, js *job.Store, cfg *config.Config) *IngestHandler {
	return &IngestHandler{parser: p, chunker: c, embedder: e, store: s, supabase: sb, jobStore: js, cfg: cfg}
}

func (h *IngestHandler) Handle(c *fiber.Ctx) error {
	userID := c.Get("X-User-ID")
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "X-User-ID header is required"})
	}

	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "file field is required"})
	}
	if !strings.HasSuffix(strings.ToLower(file.Filename), ".pdf") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "only PDF files are accepted"})
	}

	tmpFile, err := os.CreateTemp("", "ingest-*.pdf")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create temp file"})
	}
	tmpPath := tmpFile.Name()
	tmpFile.Close()

	if err := c.SaveFile(file, tmpPath); err != nil {
		os.Remove(tmpPath)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save file"})
	}

	jobID := uuid.New().String()
	docName := strings.TrimSuffix(file.Filename, filepath.Ext(file.Filename))
	h.jobStore.Create(jobID, file.Filename)

	go h.processAsync(jobID, tmpPath, docName, userID, file.Filename)

	return c.JSON(fiber.Map{"jobId": jobID, "document": docName})
}

func (h *IngestHandler) processAsync(jobID, tmpPath, docName, userID, filename string) {
	defer os.Remove(tmpPath)

	fail := func(msg string) {
		h.jobStore.Update(jobID, func(s *job.Status) {
			s.Step = job.StepFailed
			s.Error = msg
		})
	}

	h.jobStore.Update(jobID, func(s *job.Status) { s.Step = job.StepParsing; s.Progress = 5 })
	text, err := h.parser.Extract(tmpPath)
	if err != nil {
		fail("PDF 파싱 실패: " + err.Error())
		return
	}
	h.jobStore.Update(jobID, func(s *job.Status) { s.Progress = 10 })

	h.jobStore.Update(jobID, func(s *job.Status) { s.Step = job.StepChunking; s.Progress = 15 })
	chunks := h.chunker.Chunk(text, h.cfg.Chunking.ChunkSize, h.cfg.Chunking.Overlap)
	if len(chunks) == 0 {
		fail("PDF에서 텍스트를 추출할 수 없습니다")
		return
	}
	h.jobStore.Update(jobID, func(s *job.Status) {
		s.Progress = 30
		s.TotalChunks = len(chunks)
	})

	h.jobStore.Update(jobID, func(s *job.Status) { s.Step = job.StepEmbedding })
	const batchSize = 10
	allVectors := make([][]float32, 0, len(chunks))
	for i := 0; i < len(chunks); i += batchSize {
		end := i + batchSize
		if end > len(chunks) {
			end = len(chunks)
		}
		vecs, err := h.embedder.Embed(context.Background(), chunks[i:end])
		if err != nil {
			fail("임베딩 실패: " + err.Error())
			return
		}
		allVectors = append(allVectors, vecs...)
		processed := end
		h.jobStore.Update(jobID, func(s *job.Status) {
			s.CurrentChunk = processed
			s.Progress = 30 + int(float64(processed)/float64(len(chunks))*40)
		})
	}

	h.jobStore.Update(jobID, func(s *job.Status) { s.Step = job.StepStoring; s.Progress = 75 })
	if err := h.store.Upsert(context.Background(), chunks, allVectors, docName, userID); err != nil {
		fail("Qdrant 저장 실패: " + err.Error())
		return
	}

	// Supabase에 문서 메타데이터 저장 (실패해도 job은 완료 처리)
	_ = h.supabase.InsertDocument(context.Background(), userID, filename, len(chunks))

	h.jobStore.Update(jobID, func(s *job.Status) {
		s.Step = job.StepDone
		s.Progress = 100
	})
	h.jobStore.DeleteAfter(jobID, 30*time.Second)
}
```

- [ ] **Step 4: Supabase 클라이언트에 인터페이스 구현 추가**

`ingestion-service/internal/supabase/client.go` 전체 교체:

```go
package supabase

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

type Client struct {
	url            string
	serviceRoleKey string
}

func New(url, serviceRoleKey string) *Client {
	return &Client{url: url, serviceRoleKey: serviceRoleKey}
}

type documentRecord struct {
	UserID     string `json:"user_id"`
	Filename   string `json:"filename"`
	ChunkCount int    `json:"chunk_count"`
}

func (c *Client) InsertDocument(ctx context.Context, userID string, filename string, chunkCount int) error {
	body, err := json.Marshal(documentRecord{
		UserID:     userID,
		Filename:   filename,
		ChunkCount: chunkCount,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		fmt.Sprintf("%s/rest/v1/documents", c.url),
		bytes.NewReader(body),
	)
	if err != nil {
		return err
	}
	req.Header.Set("apikey", c.serviceRoleKey)
	req.Header.Set("Authorization", "Bearer "+c.serviceRoleKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Prefer", "return=minimal")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("supabase insert document failed: status %d", resp.StatusCode)
	}
	return nil
}
```

- [ ] **Step 5: cmd/main.go 업데이트**

`ingestion-service/cmd/main.go` 전체 교체:

```go
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/joho/godotenv"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/chunker"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/config"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/embedder"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/handler"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/job"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/parser"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/store"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/supabase"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("no .env file found, using environment variables")
	}

	cfg, err := config.Load("config.toml")
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	voyageAPIKey := os.Getenv("VOYAGE_API_KEY")
	if voyageAPIKey == "" {
		log.Fatal("VOYAGE_API_KEY is required")
	}

	supabaseURL := os.Getenv("SUPABASE_URL")
	supabaseKey := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")
	if supabaseURL == "" || supabaseKey == "" {
		log.Fatal("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
	}

	qdrantStore := store.New(cfg.Qdrant.BaseURL, cfg.Qdrant.Collection)
	if err := qdrantStore.EnsureCollection(context.Background(), 1024); err != nil {
		log.Fatalf("failed to ensure qdrant collection: %v", err)
	}

	jobStore := job.NewStore()
	supabaseClient := supabase.New(supabaseURL, supabaseKey)

	h := handler.New(
		parser.New(),
		chunker.New(),
		embedder.New(voyageAPIKey, cfg.Embedding.Model, cfg.Embedding.BaseURL),
		qdrantStore,
		supabaseClient,
		jobStore,
		cfg,
	)

	app := fiber.New()
	app.Post("/ingest", h.Handle)
	app.Get("/ingest/status/:jobId", func(c *fiber.Ctx) error {
		jobID := c.Params("jobId")
		status, ok := jobStore.Get(jobID)
		if !ok {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "job not found"})
		}
		return c.JSON(status)
	})
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	log.Fatal(app.Listen(fmt.Sprintf(":%d", cfg.Server.Port)))
}
```

- [ ] **Step 6: 전체 테스트 통과 확인**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ingestion-service
go test ./... 2>&1 | grep -E "ok|FAIL"
```

Expected:
```
ok  github.com/yourusername/insurance-qa-agent/ingestion-service/internal/chunker
ok  github.com/yourusername/insurance-qa-agent/ingestion-service/internal/embedder
ok  github.com/yourusername/insurance-qa-agent/ingestion-service/internal/handler
ok  github.com/yourusername/insurance-qa-agent/ingestion-service/internal/job
ok  github.com/yourusername/insurance-qa-agent/ingestion-service/internal/parser
ok  github.com/yourusername/insurance-qa-agent/ingestion-service/internal/store
```

- [ ] **Step 7: 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git add ingestion-service/
git commit -m "feat(ingestion): handle X-User-ID, store user_id in Qdrant, insert to Supabase"
```

---

## Task 10: query-service — state & Qdrant user_id 필터링

**Files:**
- Modify: `query-service/src/graph/state.ts`
- Modify: `query-service/src/clients/qdrant.ts`
- Modify: `query-service/src/graph/nodes/retriever.ts`
- Modify: `query-service/src/index.ts`

- [ ] **Step 1: state.ts에 userId, sessionId 추가**

`query-service/src/graph/state.ts` 전체 교체:

```typescript
import { Annotation } from "@langchain/langgraph";

export interface Clause {
  id: string;
  clauseNumber: string;
  clauseTitle: string;
  content: string;
  documentName: string;
  score: number;
}

export interface Citation {
  clauseNumber: string;
  clauseTitle: string;
  excerpt: string;
}

export type QuestionType = "coverage" | "claim_eligibility" | "general";

export const AgentState = Annotation.Root({
  question: Annotation<string>(),
  userId: Annotation<string>(),
  sessionId: Annotation<string>(),
  questionType: Annotation<QuestionType>({
    default: () => "general",
  }),
  retrievedClauses: Annotation<Clause[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  toolResults: Annotation<string>({
    default: () => "",
  }),
  answer: Annotation<string>({
    default: () => "",
  }),
  citations: Annotation<Citation[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
});
```

- [ ] **Step 2: qdrant.ts search에 userId 필터 추가**

`query-service/src/clients/qdrant.ts` 전체 교체:

```typescript
import { QdrantClient } from "@qdrant/js-client-rest";
import type { Clause } from "../graph/state.js";

interface QdrantPayload {
  content: string;
  document_name: string;
  chunk_index: number;
  clause_number?: string;
  clause_title?: string;
  user_id: string;
}

export class InsuranceQdrantClient {
  private client: QdrantClient;
  private collection: string;

  constructor(url: string, collection: string) {
    this.client = new QdrantClient({ url });
    this.collection = collection;
  }

  async search(vector: number[], userId: string, limit = 5): Promise<Clause[]> {
    const results = await this.client.search(this.collection, {
      vector,
      limit,
      with_payload: true,
      filter: {
        must: [
          {
            key: "user_id",
            match: { value: userId },
          },
        ],
      },
    });

    return results.map((r) => {
      const payload = r.payload as QdrantPayload;
      return {
        id: String(r.id),
        clauseNumber: payload.clause_number ?? `chunk-${payload.chunk_index}`,
        clauseTitle: payload.clause_title ?? payload.document_name,
        content: payload.content,
        documentName: payload.document_name,
        score: r.score,
      };
    });
  }
}
```

- [ ] **Step 3: retriever.ts userId 전달**

`query-service/src/graph/nodes/retriever.ts` 전체 교체:

```typescript
import { VoyageClient } from "../../clients/voyage.js";
import { InsuranceQdrantClient } from "../../clients/qdrant.js";
import type { AgentState } from "../state.js";

export function createRetriever(
  voyageClient: VoyageClient,
  qdrantClient: InsuranceQdrantClient
) {
  return async function retrieve(
    state: typeof AgentState.State
  ): Promise<Partial<typeof AgentState.State>> {
    const [embedding] = await voyageClient.embed([state.question]);
    const clauses = await qdrantClient.search(embedding, state.userId, 5);
    return { retrievedClauses: clauses };
  };
}
```

- [ ] **Step 4: index.ts userId, sessionId 헤더 처리**

`query-service/src/index.ts` 전체 교체:

```typescript
import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { VoyageClient } from "./clients/voyage.js";
import { InsuranceQdrantClient } from "./clients/qdrant.js";
import { buildGraph } from "./graph/graph.js";

const voyageClient = new VoyageClient(process.env.VOYAGE_API_KEY!);
const qdrantClient = new InsuranceQdrantClient(
  process.env.QDRANT_URL!,
  process.env.QDRANT_COLLECTION!
);
const graph = buildGraph(voyageClient, qdrantClient);

const app = new Hono();

app.post("/query", async (c) => {
  const userId = c.req.header("x-user-id");
  const sessionId = c.req.header("x-session-id") ?? crypto.randomUUID();

  if (!userId) {
    return c.json({ error: "X-User-ID header is required" }, 401);
  }

  const { question } = await c.req.json<{ question: string }>();
  if (!question) {
    return c.json({ error: "question is required" }, 400);
  }

  const result = await graph.invoke({ question, userId, sessionId });
  return c.json({
    answer: result.answer,
    citations: result.citations,
    questionType: result.questionType,
  });
});

app.get("/health", (c) => c.json({ status: "ok" }));

const port = Number(process.env.PORT ?? 8082);
serve({ fetch: app.fetch, port }, () => {
  console.log(`Query service running on :${port}`);
});
```

- [ ] **Step 5: 타입 체크**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/query-service
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git add query-service/src/
git commit -m "feat(query): filter Qdrant search by user_id from X-User-ID header"
```

---

## Task 11: K8s Secrets & Deployment 업데이트 + 전체 재배포

**Files:**
- Create: `k8s/supabase-secret.yaml`
- Modify: `k8s/ingestion-service/deployment.yaml`
- Modify: `k8s/ui-service/deployment.yaml`

- [ ] **Step 1: supabase-secret.yaml 생성**

실제 값은 base64 인코딩 후 입력:
```bash
echo -n "https://xxxx.supabase.co" | base64
echo -n "eyJ..." | base64  # SERVICE_ROLE_KEY
```

`k8s/supabase-secret.yaml`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: supabase-secrets
type: Opaque
data:
  SUPABASE_URL: <base64_encoded_url>
  SUPABASE_SERVICE_ROLE_KEY: <base64_encoded_key>
```

- [ ] **Step 2: ingestion-service deployment에 Supabase secret 마운트**

`k8s/ingestion-service/deployment.yaml`의 `env` 섹션에 추가:

```yaml
            - name: SUPABASE_URL
              valueFrom:
                secretKeyRef:
                  name: supabase-secrets
                  key: SUPABASE_URL
            - name: SUPABASE_SERVICE_ROLE_KEY
              valueFrom:
                secretKeyRef:
                  name: supabase-secrets
                  key: SUPABASE_SERVICE_ROLE_KEY
```

- [ ] **Step 3: ui-service deployment에 Supabase 환경변수 추가**

`k8s/ui-service/deployment.yaml`의 `env` 섹션에 추가:

```yaml
            - name: NEXT_PUBLIC_SUPABASE_URL
              value: "https://xxxx.supabase.co"
            - name: NEXT_PUBLIC_SUPABASE_ANON_KEY
              value: "eyJ..."
            - name: SUPABASE_SERVICE_ROLE_KEY
              valueFrom:
                secretKeyRef:
                  name: supabase-secrets
                  key: SUPABASE_SERVICE_ROLE_KEY
```

- [ ] **Step 4: .env 파일 업데이트**

`ingestion-service/.env`에 추가:
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

`ui-service/.env.local`에 추가:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

- [ ] **Step 5: K8s secret 적용**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
kubectl apply -f k8s/supabase-secret.yaml
```

Expected: `secret/supabase-secrets created`

- [ ] **Step 6: Docker 재빌드 & 재배포**

```bash
eval $(minikube docker-env)
docker compose build
kubectl apply -f k8s/ingestion-service/deployment.yaml
kubectl apply -f k8s/ui-service/deployment.yaml
kubectl rollout restart deployment/ingestion-service deployment/query-service deployment/ui-service
kubectl rollout status deployment/ingestion-service --timeout=60s
kubectl rollout status deployment/query-service --timeout=60s
kubectl rollout status deployment/ui-service --timeout=60s
```

Expected: 3개 서비스 모두 `successfully rolled out`

- [ ] **Step 7: 헬스체크 & 포트포워드**

```bash
pkill -f "kubectl port-forward" 2>/dev/null; sleep 1
kubectl port-forward svc/ingestion-service 8081:8081 &>/tmp/pf-ingestion.log &
kubectl port-forward svc/ui-service 3000:3000 &>/tmp/pf-ui.log &
sleep 3
curl -s http://localhost:8081/health
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Expected:
```
{"status":"ok"}
200
```

- [ ] **Step 8: 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git add k8s/
git commit -m "feat(k8s): add Supabase secrets and update deployments for auth"
```

---

## Self-Review 체크리스트

### 스펙 커버리지

| 스펙 요구사항 | 구현 Task |
|---|---|
| Google OAuth 로그인 | Task 2, 3 |
| 인증 미들웨어 (비인증 → /login) | Task 2 |
| ui-service 인증 게이트웨이 패턴 | Task 5 |
| X-User-ID 헤더 전달 | Task 5 |
| Qdrant payload user_id 저장 | Task 7 |
| Qdrant 검색 user_id 필터링 | Task 10 |
| Supabase documents 테이블 INSERT | Task 8, 9 |
| LeftPanel 사용자별 문서 목록 | Task 6 |
| Header 사용자 정보 + 로그아웃 | Task 4 |
| K8s Supabase secrets | Task 11 |
