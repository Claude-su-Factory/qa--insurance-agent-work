# Railway 배포 + CI/CD 자동화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로컬 minikube 전용 QA Agent를 Railway로 실배포하고, main push → CI → Railway auto-deploy 파이프라인을 완성한다.

**Architecture:** 3 service (ingestion / query / ui) Docker 배포. Secrets는 Doppler → Railway 자동 sync. 서비스 간 URL은 Railway reference variable (`${{svc.RAILWAY_PRIVATE_DOMAIN}}:${{svc.PORT}}`)로 닭-달걀 제거. CI = GitHub Actions 4 job (3 test + Docker build matrix). 외부: Qdrant Cloud, Langfuse Cloud, Supabase(기존).

**Tech Stack:** Railway, Doppler, GitHub Actions, Docker, Qdrant Cloud, Langfuse Cloud, Supabase.

**Base spec:** `docs/superpowers/specs/2026-04-18-railway-deployment.md`

---

## 파일 구조 (영향 파일 한눈에 보기)

### 신규 생성
```
.github/workflows/ci.yml                   ← 4 job (3 test + docker matrix)
.env.production.example                    ← repo root, 공유 키 레퍼런스
ingestion-service/.env.production.example  ← ingestion 전용 키
query-service/.env.production.example      ← query 전용 키
ui-service/.env.production.example         ← ui 전용 키
ui-service/app/api/health/route.ts         ← Railway health check 용
ingestion-service/internal/config/env_override.go  ← env 우선 override 헬퍼
ingestion-service/internal/config/env_override_test.go
```

### 수정
```
.gitignore                                 ← .env.production 패턴 추가
ingestion-service/cmd/main.go              ← PORT/QDRANT env 우선 사용
ingestion-service/internal/config/config.go ← ApplyEnvOverrides 호출
CLAUDE.md                                  ← 배포 규칙 섹션 Railway로 교체
docs/STATUS.md                             ← Railway 완료 반영
docs/ROADMAP.md                            ← 클라우드 ✅ 승격
docs/ARCHITECTURE.md                       ← 배포 토폴로지 + Langfuse 주석 수정
README.md                                  ← live URL + CI 배지
```

### 삭제 / Deprecated
```
(outer) /Users/yuhojin/Desktop/QA Agent/.git
(outer) /Users/yuhojin/Desktop/QA Agent/docs/
scripts/apply-secrets.sh                   ← k8s 전용, 불필요 (또는 deprecated 주석)
```

### 손대지 않음
```
3 서비스 Dockerfile (이미 production-ready)
supabase/migrations/*
k8s/ (레거시 증빙용 보존)
query-service/src/index.ts (PORT/health 이미 OK)
```

---

## Task 1: Repo 재구성 + 보안 스캔 게이트 통과

**Why:** `/Users/yuhojin/Desktop/QA Agent/.git`(outer, 비어있음)와 `insurance-qa-agent/.git`(inner, 실제 작업) 두 git repo가 중첩된 상태. inner를 유일한 repo로 만들고 remote 연결 + 보안 스캔 통과 후 첫 push.

**Files:**
- Move: `/Users/yuhojin/Desktop/QA Agent/docs/superpowers/plans/2026-04-15-insurance-qa-agent.md` → `insurance-qa-agent/docs/superpowers/plans/`
- Move: `/Users/yuhojin/Desktop/QA Agent/docs/superpowers/specs/2026-04-15-insurance-qa-agent-design.md` → `insurance-qa-agent/docs/superpowers/specs/`
- Delete: `/Users/yuhojin/Desktop/QA Agent/.git/`, `/Users/yuhojin/Desktop/QA Agent/docs/`

**작업 디렉토리 주의:** 이후 모든 명령은 `/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/` 기준.

- [ ] **Step 1: outer docs 파일 inner로 이동**

```bash
cd "/Users/yuhojin/Desktop/QA Agent"
mv docs/superpowers/plans/2026-04-15-insurance-qa-agent.md \
   insurance-qa-agent/docs/superpowers/plans/
mv docs/superpowers/specs/2026-04-15-insurance-qa-agent-design.md \
   insurance-qa-agent/docs/superpowers/specs/
```

기대: 두 파일이 inner 디렉토리에 존재. outer `docs/` 는 비어 있음.

- [ ] **Step 2: 두 파일 존재 검증**

```bash
ls "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/docs/superpowers/plans/2026-04-15-insurance-qa-agent.md"
ls "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/docs/superpowers/specs/2026-04-15-insurance-qa-agent-design.md"
```

기대: 두 줄 모두 파일 경로 출력 (에러 없음).

- [ ] **Step 3: inner에서 이동된 파일 add + commit**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
git add docs/superpowers/plans/2026-04-15-insurance-qa-agent.md \
        docs/superpowers/specs/2026-04-15-insurance-qa-agent-design.md
git commit -m "chore: import outer 2026-04-15 design docs into main repo"
```

- [ ] **Step 4: outer 제거 (.git, docs, .DS_Store)**

주의: outer에는 `.claude/` 가 있을 수 있는데 **프로젝트 외부 설정이므로 유지**한다. `.git` 과 비어 있는 `docs/` 만 제거.

```bash
cd "/Users/yuhojin/Desktop/QA Agent"
rm -rf .git
rm -rf docs
rm -f .DS_Store
ls -la
```

기대: `.claude/`, `insurance-qa-agent/` 만 남아있음. `.git` 및 `docs/` 부재.

- [ ] **Step 5: inner branch rename master → main**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
git branch --show-current
# master 이면 rename, 이미 main 이면 skip
git branch -m master main
git branch --show-current
```

기대: `main` 출력.

- [ ] **Step 6: remote origin 추가**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
git remote get-url origin 2>/dev/null || \
  git remote add origin https://github.com/Claude-su-Factory/qa--insurance-agent-work.git
git remote -v
```

기대: `origin https://github.com/Claude-su-Factory/qa--insurance-agent-work.git (fetch/push)` 두 줄.

- [ ] **Step 7: 보안 게이트 A — git history 전수 스캔**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
git log -p --all | grep -iE "(api[_-]?key|secret|token|sk-ant|pcsk-|voyage|langfuse_secret|password|bearer)" | head -40
```

기대: 매치 0건 또는 테스트 픽스처/예시에만 한정된 매치. 실제 키 값이 한 줄이라도 있으면 **중단** → 사용자에게 보고 → history rewrite 후 재실행.

- [ ] **Step 8: 보안 게이트 B — 소스 하드코딩 스캔**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
grep -rIE "(sk-ant-[A-Za-z0-9_-]+|pcsk_[A-Za-z0-9_-]+|voyage-[A-Za-z0-9_-]+|SUPABASE_SERVICE_ROLE_KEY=[^\$\n]+)" \
  --exclude-dir=node_modules --exclude-dir=.git \
  --exclude-dir=.next --exclude-dir=vendor \
  --exclude="*.md" \
  ingestion-service/ query-service/ ui-service/ scripts/ 2>/dev/null
```

기대: 출력 0줄. 매치 있으면 **중단** → 해당 파일의 실제 키를 env 참조로 교체 후 재실행.

- [ ] **Step 9: 보안 게이트 C — apply-secrets.sh 본문 검증**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
test -f scripts/apply-secrets.sh && grep -nE "(sk-ant-|pcsk_|voyage-)" scripts/apply-secrets.sh || echo "no file or no leak"
```

기대: `no file or no leak` 또는 매치 0줄. 리터럴 키 검출 시 **중단**.

- [ ] **Step 10: 보안 게이트 D — .gitignore 커버리지 확인**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
grep -E "^\.env($|\*|\.local|/)" .gitignore
```

기대: `.env`, `.env.local`, `.env*.local`, `*.env` 중 어느 조합이든 존재. `.env.production` 이 매치되지 않으면 다음 단계에서 추가.

- [ ] **Step 11: .gitignore 에 `.env.production` 명시 (없으면 추가)**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
grep -q "^\.env\.production$" .gitignore || \
  printf "\n# Railway/Doppler prod env (never commit)\n.env.production\n" >> .gitignore
tail -5 .gitignore
```

기대: `.env.production` 가 마지막 줄 부근에 포함.

- [ ] **Step 12: 게이트 D 재확인 — `.env.production` Untracked 테스트**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
touch .env.production
git status --short | grep "\.env\.production"
rm .env.production
```

기대: `git status` 에 `.env.production` 이 나타나지 않음 (무시됨). 나타나면 **중단**.

- [ ] **Step 13: Commit — .gitignore 업데이트**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
git add .gitignore
git diff --cached -- .gitignore
git commit -m "chore: gitignore .env.production for Railway deploy"
```

- [ ] **Step 14: (첫 push 는 Task 7 완료 후. 일단 local 정리까지만)**

---

## Task 2: `.env.production.example` 4 개 파일 생성

**Why:** Doppler에 입력할 키 이름 레퍼런스. "프로덕션에 뭐가 필요한지" 암묵적 체크리스트 역할. 값은 절대 안 넣음.

**Files:**
- Create: `.env.production.example`
- Create: `ingestion-service/.env.production.example`
- Create: `query-service/.env.production.example`
- Create: `ui-service/.env.production.example`

- [ ] **Step 1: 공용 root `.env.production.example` 작성**

경로: `/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/.env.production.example`

```bash
# 공유 키 (모든 서비스에서 사용)
# Doppler 프로젝트 insurance-qa-agent 의 각 prd_* config에 동일 값으로 입력한다.

INTERNAL_AUTH_TOKEN=<generate-32-byte-random>
QDRANT_URL=<qdrant-cloud-cluster-url>
QDRANT_API_KEY=<qdrant-cloud-api-key>
SUPABASE_URL=<supabase-project-url>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>
VOYAGE_API_KEY=<voyage-api-key>
```

- [ ] **Step 2: `ingestion-service/.env.production.example`**

```bash
# ingestion-service 전용 (Doppler config: prd_ingestion)
# PORT 는 Railway 가 자동 주입

VOYAGE_API_KEY=<voyage-api-key>
QDRANT_URL=<qdrant-cloud-cluster-url>
QDRANT_API_KEY=<qdrant-cloud-api-key>
QDRANT_COLLECTION=insurance_clauses
SUPABASE_URL=<supabase-project-url>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>
INTERNAL_AUTH_TOKEN=<same-as-root>
```

- [ ] **Step 3: `query-service/.env.production.example`**

```bash
# query-service 전용 (Doppler config: prd_query)
# PORT 는 Railway 가 자동 주입

ANTHROPIC_API_KEY=<anthropic-api-key>
VOYAGE_API_KEY=<voyage-api-key>
QDRANT_URL=<qdrant-cloud-cluster-url>
QDRANT_API_KEY=<qdrant-cloud-api-key>
QDRANT_COLLECTION=insurance_clauses
SUPABASE_URL=<supabase-project-url>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>
LANGFUSE_PUBLIC_KEY=<langfuse-public-key>
LANGFUSE_SECRET_KEY=<langfuse-secret-key>
LANGFUSE_HOST=https://cloud.langfuse.com
INTERNAL_AUTH_TOKEN=<same-as-root>
# eval worker가 자기 자신을 호출하는 용도 (Railway reference variable):
QUERY_SERVICE_URL=http://${{query-service.RAILWAY_PRIVATE_DOMAIN}}:${{query-service.PORT}}
```

- [ ] **Step 4: `ui-service/.env.production.example`**

```bash
# ui-service 전용 (Doppler config: prd_ui)
# PORT 는 Railway 가 자동 주입
# NEXT_PUBLIC_* 는 Dockerfile build ARG 로도 주입 필요 (Railway build 설정)

NEXT_PUBLIC_SUPABASE_URL=<supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>
INTERNAL_AUTH_TOKEN=<same-as-root>
# Railway reference variable 로 Doppler 에 입력:
QUERY_API_URL=http://${{query-service.RAILWAY_PRIVATE_DOMAIN}}:${{query-service.PORT}}
INGESTION_API_URL=http://${{ingestion-service.RAILWAY_PRIVATE_DOMAIN}}:${{ingestion-service.PORT}}
```

- [ ] **Step 5: 보안 게이트 E 재확인 — 값이 없는지**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
grep -rE "=(sk-ant-|pcsk_|voyage-[A-Za-z0-9]|eyJ|[A-Za-z0-9]{30,})" \
  .env.production.example \
  ingestion-service/.env.production.example \
  query-service/.env.production.example \
  ui-service/.env.production.example 2>/dev/null
```

기대: 출력 0줄. 매치 있으면 **중단** → 값 제거.

- [ ] **Step 6: Commit**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
git add .env.production.example \
        ingestion-service/.env.production.example \
        query-service/.env.production.example \
        ui-service/.env.production.example
git commit -m "docs: add .env.production.example reference for Doppler/Railway"
```

---

## Task 3: ingestion-service — PORT 환경변수 우선 바인딩 (TDD)

**Why:** 현재 `cmd/main.go:87` 은 `cfg.Server.Port` 만 사용. Railway 는 `$PORT` 를 주입하는데 코드가 읽지 않으면 잘못된 포트에 바인딩해 health check 실패.

**Files:**
- Create: `ingestion-service/internal/config/env_override_test.go`
- Create: `ingestion-service/internal/config/env_override.go`
- Modify: `ingestion-service/internal/config/config.go`
- Modify: `ingestion-service/cmd/main.go:87`

- [ ] **Step 1: 실패하는 테스트 작성**

경로: `ingestion-service/internal/config/env_override_test.go`

```go
package config

import (
	"testing"
)

func TestApplyEnvOverrides_PortFromEnv(t *testing.T) {
	cfg := &Config{Server: ServerConfig{Port: 8081}}

	t.Setenv("PORT", "9999")
	ApplyEnvOverrides(cfg)

	if cfg.Server.Port != 9999 {
		t.Fatalf("expected port 9999 from env, got %d", cfg.Server.Port)
	}
}

func TestApplyEnvOverrides_PortFallsBackToConfig(t *testing.T) {
	cfg := &Config{Server: ServerConfig{Port: 8081}}

	t.Setenv("PORT", "")
	ApplyEnvOverrides(cfg)

	if cfg.Server.Port != 8081 {
		t.Fatalf("expected fallback port 8081, got %d", cfg.Server.Port)
	}
}

func TestApplyEnvOverrides_PortInvalidIgnored(t *testing.T) {
	cfg := &Config{Server: ServerConfig{Port: 8081}}

	t.Setenv("PORT", "not-a-number")
	ApplyEnvOverrides(cfg)

	if cfg.Server.Port != 8081 {
		t.Fatalf("expected fallback port 8081 on invalid env, got %d", cfg.Server.Port)
	}
}

func TestApplyEnvOverrides_QdrantFromEnv(t *testing.T) {
	cfg := &Config{Qdrant: QdrantConfig{BaseURL: "http://qdrant:6333", Collection: "insurance_clauses"}}

	t.Setenv("QDRANT_URL", "https://xyz.qdrant.cloud")
	t.Setenv("QDRANT_COLLECTION", "prod_clauses")
	ApplyEnvOverrides(cfg)

	if cfg.Qdrant.BaseURL != "https://xyz.qdrant.cloud" {
		t.Fatalf("expected qdrant url from env, got %q", cfg.Qdrant.BaseURL)
	}
	if cfg.Qdrant.Collection != "prod_clauses" {
		t.Fatalf("expected qdrant collection from env, got %q", cfg.Qdrant.Collection)
	}
}

func TestApplyEnvOverrides_QdrantFallsBackToConfig(t *testing.T) {
	cfg := &Config{Qdrant: QdrantConfig{BaseURL: "http://qdrant:6333", Collection: "insurance_clauses"}}

	t.Setenv("QDRANT_URL", "")
	t.Setenv("QDRANT_COLLECTION", "")
	ApplyEnvOverrides(cfg)

	if cfg.Qdrant.BaseURL != "http://qdrant:6333" {
		t.Fatalf("expected fallback qdrant url, got %q", cfg.Qdrant.BaseURL)
	}
	if cfg.Qdrant.Collection != "insurance_clauses" {
		t.Fatalf("expected fallback collection, got %q", cfg.Qdrant.Collection)
	}
}
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/ingestion-service"
go test ./internal/config/... -run TestApplyEnvOverrides -v
```

기대: 컴파일 에러 `undefined: ApplyEnvOverrides` 또는 동일 취지 실패.

- [ ] **Step 3: 최소 구현 작성**

경로: `ingestion-service/internal/config/env_override.go`

```go
package config

import (
	"os"
	"strconv"
)

// ApplyEnvOverrides 는 Config 의 프로덕션 민감 필드를 환경변수 값으로 덮어쓴다.
// 환경변수가 비어 있거나 잘못된 값이면 기존 config.toml 값을 유지한다.
// Railway 배포 환경에서 $PORT / $QDRANT_URL / $QDRANT_COLLECTION 을 주입받기 위함.
func ApplyEnvOverrides(cfg *Config) {
	if raw := os.Getenv("PORT"); raw != "" {
		if p, err := strconv.Atoi(raw); err == nil && p > 0 {
			cfg.Server.Port = p
		}
	}
	if v := os.Getenv("QDRANT_URL"); v != "" {
		cfg.Qdrant.BaseURL = v
	}
	if v := os.Getenv("QDRANT_COLLECTION"); v != "" {
		cfg.Qdrant.Collection = v
	}
}
```

- [ ] **Step 4: 테스트 재실행해서 통과 확인**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/ingestion-service"
go test ./internal/config/... -run TestApplyEnvOverrides -v
```

기대: `PASS` 5 test 모두.

- [ ] **Step 5: `cmd/main.go` 에서 override 호출**

`cmd/main.go:30` 부근 `cfg, err := config.Load(...)` 직후에 한 줄 추가.

```go
	cfg, err := config.Load("config.toml")
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}
	config.ApplyEnvOverrides(cfg)  // ← 추가
```

- [ ] **Step 6: 전체 Go 테스트 실행**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/ingestion-service"
go test ./... -v
```

기대: 모든 테스트 PASS. 회귀 없음.

- [ ] **Step 7: Commit**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
git add ingestion-service/internal/config/env_override.go \
        ingestion-service/internal/config/env_override_test.go \
        ingestion-service/cmd/main.go
git commit -m "feat(ingestion): override PORT/QDRANT_URL/QDRANT_COLLECTION from env for Railway"
```

---

## Task 4: ui-service — `/api/health` 라우트 신규 생성 (TDD)

**Why:** Railway 는 각 service 에 health check 경로를 요구. ingestion / query 에는 이미 `/health` 존재. ui-service 에만 없음.

**Files:**
- Create: `ui-service/app/api/health/__tests__/route.test.ts`
- Create: `ui-service/app/api/health/route.ts`
- Modify: (optional) `ui-service/package.json` 에 테스트 설정 없으면 단순 smoke 로 대체

- [ ] **Step 1: 테스트 환경 확인**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/ui-service"
cat package.json | grep -A2 '"scripts"' | head -10
ls __tests__ app/**/*.test.ts 2>/dev/null
```

ui-service 에 vitest/jest 가 설정되어 있으면 테스트 파일 방식. 없으면 **smoke test 로 대체** (Step 2a 건너뛰고 2b 사용).

- [ ] **Step 2a: vitest/jest 가 있으면 실패 테스트 작성**

경로: `ui-service/app/api/health/__tests__/route.test.ts`

```typescript
import { describe, it, expect } from "vitest"; // 또는 jest
import { GET } from "../route";

describe("GET /api/health", () => {
  it("returns 200 with status ok", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 2b: 테스트 프레임워크 없으면 smoke test 파일**

경로: `ui-service/app/api/health/route.smoke.sh`

```bash
#!/bin/bash
# Smoke test: ui-service 가 로컬에서 실행 중일 때 /api/health 가 200 OK 를 반환하는지 확인
set -euo pipefail
URL="${1:-http://localhost:3000/api/health}"
BODY=$(curl -sf "$URL")
echo "response: $BODY"
echo "$BODY" | grep -q '"status":"ok"' || { echo "FAIL: status != ok"; exit 1; }
echo "PASS"
```

```bash
chmod +x ui-service/app/api/health/route.smoke.sh
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Step 2a 라면: `cd ui-service && npx vitest run app/api/health` → 실패 (route 없음)
Step 2b 라면: 이 단계 건너뛰고 Step 5 에서 로컬 기동 후 smoke 확인

- [ ] **Step 4: route 구현**

경로: `ui-service/app/api/health/route.ts`

```typescript
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
```

- [ ] **Step 5: 테스트 or smoke 재실행**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/ui-service"
# Step 2a 방식:
npx vitest run app/api/health 2>/dev/null || echo "(vitest 미설정 시 skip)"

# Step 2b smoke test 방식 (로컬 기동 후):
# npm run dev & sleep 5 && ./app/api/health/route.smoke.sh && kill %1
```

기대: 200 OK + `{"status":"ok"}`.

- [ ] **Step 6: TypeScript 체크 + build 확인**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/ui-service"
npx tsc --noEmit
```

기대: 에러 0.

- [ ] **Step 7: Commit**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
git add ui-service/app/api/health/
git commit -m "feat(ui): add /api/health endpoint for Railway health check"
```

---

## Task 5: query-service — PORT/health 회귀 검증 (no-op 확인)

**Why:** 스펙 §5.3 R1/R3 는 3 서비스 전부. query-service 는 이미 조건 충족 (확인된 코드 상태: `src/index.ts:238` PORT env 읽음, `src/index.ts:236` /health endpoint). 이 task 는 검증만.

**Files:**
- Modify: (예상) 없음

- [ ] **Step 1: PORT env 사용 확인**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/query-service"
grep -n "process.env.PORT" src/index.ts
```

기대: `const port = Number(process.env.PORT ?? 8082);` 한 줄 매치.

- [ ] **Step 2: `/health` 엔드포인트 존재 확인**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/query-service"
grep -n "/health" src/index.ts src/middleware/internal-auth.ts
```

기대: `src/index.ts` 에 `app.get("/health", ...)`, middleware 에 `path === "/health"` exempt 로직. 둘 다 존재.

- [ ] **Step 3: 헬스체크 스모크 (로컬 기동해서 200 확인)**

옵션 A — docker compose 이미 기동 중이면:
```bash
curl -sf http://localhost:8082/health
```

옵션 B — 기동 안 되어 있으면 이 단계 skip, Task 15 Railway 배포 후 검증.

기대 (옵션 A): `{"status":"ok"}`.

- [ ] **Step 4: Task 종료 — 코드 변경 없음**

이 task 는 커밋 없음. 변경 사항이 없어야 정상.

---

## Task 6: CI 워크플로우 파일 추가

**Why:** main push 및 PR 시 자동 검증. Railway 는 "Wait for CI Checks" 로 3+1 matrix job 의 status check 를 감시.

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: CI 워크플로우 파일 작성**

경로: `/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ingestion-tests:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./ingestion-service
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.23'
          cache: true
          cache-dependency-path: ingestion-service/go.sum
      - run: go mod download
      - run: go test ./... -v

  query-tests:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./query-service
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: query-service/package-lock.json
      - run: npm ci
      - run: npm test
      - run: npx tsc --noEmit

  ui-build-check:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./ui-service
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: ui-service/package-lock.json
      - run: npm ci
      - run: npm run build -- --no-lint
        env:
          # build-time env 는 placeholder 로 충분. 실제 값은 Railway build ARG 로 주입.
          NEXT_PUBLIC_SUPABASE_URL: https://placeholder.supabase.co
          NEXT_PUBLIC_SUPABASE_ANON_KEY: placeholder
          NEXT_TELEMETRY_DISABLED: '1'

  docker-build-check:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [ingestion-service, query-service, ui-service]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - name: Build ${{ matrix.service }} Dockerfile
        uses: docker/build-push-action@v5
        with:
          context: ./${{ matrix.service }}
          file: ./${{ matrix.service }}/Dockerfile
          push: false
          tags: ${{ matrix.service }}:ci
          cache-from: type=gha,scope=${{ matrix.service }}
          cache-to: type=gha,mode=max,scope=${{ matrix.service }}
```

- [ ] **Step 2: yamllint (선택)**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "OK"
```

기대: `OK`.

- [ ] **Step 3: 로컬에서 각 CI job 재현**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"

# ingestion-tests 재현
(cd ingestion-service && go test ./... -v) | tail -20

# query-tests 재현
(cd query-service && npm ci && npm test && npx tsc --noEmit) | tail -20

# ui-build-check 재현
(cd ui-service && npm ci && NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder \
  npm run build -- --no-lint) | tail -20

# docker-build-check 재현 (시간 걸림, 선택)
(cd ingestion-service && docker build -f Dockerfile -t ingestion-service:ci .) > /dev/null && echo "ingestion OK"
(cd query-service && docker build -f Dockerfile -t query-service:ci .) > /dev/null && echo "query OK"
(cd ui-service && docker build -f Dockerfile -t ui-service:ci --build-arg NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder .) > /dev/null && echo "ui OK"
```

기대: 모든 job 로컬에서 성공. 실패 시 **중단** → 원인 수정 후 재실행.

- [ ] **Step 4: Commit**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow (3 tests + docker build matrix)"
```

---

## Task 7: GitHub 첫 push + 원격 저장소 확인

**Why:** Task 1-6 의 변경을 원격에 반영. CI 가 push 즉시 트리거되며 통과하는지 확인.

**작업은 Claude 가 직접 수행 가능 (git 명령). GitHub 계정 인증은 사용자 환경에 이미 되어 있음을 전제.**

- [ ] **Step 1: git status 깨끗한지 확인**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
git status
```

기대: `nothing to commit, working tree clean` 또는 의도된 untracked 만.

- [ ] **Step 2: 첫 push (upstream 설정)**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
git push -u origin main 2>&1 | tee /tmp/push-output.txt
```

실패 케이스:
- `push protection` 에 걸리면 → 해당 경로의 리터럴 키 제거 후 history rewrite → 재시도
- `rejected (non-fast-forward)` → 원격이 비어 있지 않음. `git fetch && git log origin/main..HEAD` 로 확인 후 판단 (보통 strange edge case, 사용자에게 에스컬레이션)

기대: `Branch 'main' set up to track 'origin/main'` + 커밋 리스트 업로드.

- [ ] **Step 3: GitHub Actions 트리거 확인**

```bash
# 1-2분 대기 후
gh run list --workflow ci.yml --limit 1 2>/dev/null || \
  echo "gh CLI 미설치 — 웹에서 https://github.com/Claude-su-Factory/qa--insurance-agent-work/actions 확인"
```

기대: 가장 최근 run 이 `in_progress` 또는 `completed success`. 실패 시 실패 job 로그 확인.

- [ ] **Step 4: 모든 job 성공 대기**

```bash
gh run watch --exit-status 2>/dev/null || \
  echo "웹 대시보드에서 4 job (3 test + docker matrix 3) 전부 초록색 확인"
```

기대: 4 job 체크 전부 통과. 실패 시 즉시 원인 수정 → 재push.

---

## Task 8: GitHub 저장소 보안 설정 + branch protection

**Why:** public repo 기본 보호. secret scanning, push protection, branch protection, Dependabot 모두 활성.

**수행 방식:** GitHub 웹 UI 또는 `gh` CLI. 대부분 1-click 토글.

- [ ] **Step 1: Secret scanning / Push protection / Dependabot 활성화**

웹 UI: Settings → Code security and analysis
- Secret scanning: **Enable**
- Push protection: **Enable**
- Dependabot alerts: **Enable**
- Dependabot security updates: **Enable**

`gh` CLI 대안:
```bash
gh api -X PATCH /repos/Claude-su-Factory/qa--insurance-agent-work \
  -f security_and_analysis='{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}' \
  2>/dev/null || echo "웹 UI 로 진행"
```

기대: 4 항목 모두 초록 ON.

- [ ] **Step 2: `main` branch protection rule 생성**

웹 UI: Settings → Branches → Add branch protection rule
- Branch name pattern: `main`
- ☑ Require a pull request before merging
  - ☑ Require approvals: 0 (본인 프로젝트라 0도 허용. 리뷰 문화 증빙용이면 1)
- ☑ Require status checks to pass before merging
  - ☑ Require branches to be up to date before merging
  - 추가할 checks (첫 CI run 이후 검색 가능):
    - `ingestion-tests`
    - `query-tests`
    - `ui-build-check`
    - `docker-build-check (ingestion-service)`
    - `docker-build-check (query-service)`
    - `docker-build-check (ui-service)`
- ☑ Do not allow bypassing the above settings

`gh` CLI 대안 (주의: branch rule API 는 페이로드 길어서 JSON 파일 권장):
```bash
cat > /tmp/protect.json <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "ingestion-tests",
      "query-tests",
      "ui-build-check",
      "docker-build-check (ingestion-service)",
      "docker-build-check (query-service)",
      "docker-build-check (ui-service)"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0
  },
  "restrictions": null
}
EOF
gh api -X PUT /repos/Claude-su-Factory/qa--insurance-agent-work/branches/main/protection \
  --input /tmp/protect.json 2>&1 | head -20
```

기대: 200 응답 + rule 생성됨.

- [ ] **Step 3: 확인 — 웹에서 `main` 옆 자물쇠 아이콘 보이는지**

웹 UI: 저장소 메인 페이지 → branch dropdown 에서 main 옆 🔒 확인.

---

## Task 9: 외부 서비스 계정/키 발급 (Qdrant Cloud + Langfuse Cloud)

**Why:** Doppler 에 넣을 실제 값이 필요. Supabase / Anthropic / Voyage 는 기존 키 재사용.

**수행 방식:** 사용자가 웹 UI 로 가입 후 키 복사. Claude 는 가이드.

- [ ] **Step 1: Qdrant Cloud 가입 + free cluster 생성**

1. https://cloud.qdrant.io 가입
2. Region: AWS Seoul (ap-northeast-2) 또는 Tokyo (ap-northeast-1) — Railway Oregon 에서 붙는 latency 허용 범위
3. Free cluster (1GB) 생성
4. Cluster URL (예: `https://xyz-abc.us-east.aws.cloud.qdrant.io:6333`) 복사
5. API Key 탭에서 **read/write** key 발급 → 복사
6. 값 2개를 임시 노트에 메모 (이후 Doppler 에만 입력)

- [ ] **Step 2: Langfuse Cloud 가입 + 프로젝트 생성**

1. https://cloud.langfuse.com 가입
2. Organization → New project: `insurance-qa-agent`
3. Project settings → API Keys → New API keys
4. `public key` (`pk-lf-...`), `secret key` (`sk-lf-...`) 복사
5. Host = `https://cloud.langfuse.com`
6. 값 3개 임시 노트

- [ ] **Step 3: Supabase Site URL 업데이트 (Railway URL 확정 후 Task 14 에서 재방문)**

지금 시점엔 Railway URL 이 없으므로 skip. Task 14 에서 처리.

- [ ] **Step 4: 기존 키 확인**

로컬 `.env` 에서 아래 값들을 보관용으로 사용자에게 받아 임시 노트 작성 (Doppler 입력용):
- `ANTHROPIC_API_KEY`
- `VOYAGE_API_KEY`
- `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL` (보통 동일)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

- [ ] **Step 5: `INTERNAL_AUTH_TOKEN` 프로덕션 값 생성**

```bash
openssl rand -hex 32
```

예상 출력: `f3a9c5...` (64자 hex).
이 값을 임시 노트에 추가. 로컬 값과 **다르게** 유지 (prod/dev 분리).

---

## Task 10: Doppler 프로젝트 + 3 config 생성 + 값 입력

**Why:** Railway 의 secret source. 이후 운영에서 값 변경은 Doppler 에서만.

**수행 방식:** 웹 UI. `doppler` CLI 불필요.

- [ ] **Step 1: Doppler 가입 + 프로젝트 생성**

1. https://doppler.com 가입 (Free plan)
2. **New project**: name `insurance-qa-agent`
3. 자동 생성된 default `dev/stg/prd` config 는 **삭제**
4. **Add config**: `prd_ingestion`
5. **Add config**: `prd_query`
6. **Add config**: `prd_ui`

- [ ] **Step 2: `prd_ingestion` 값 입력**

아래 키/값 쌍 입력:
- `VOYAGE_API_KEY` = (기존 값)
- `QDRANT_URL` = (Qdrant Cloud URL)
- `QDRANT_API_KEY` = (Qdrant Cloud key)
- `QDRANT_COLLECTION` = `insurance_clauses`
- `SUPABASE_URL` = (기존)
- `SUPABASE_SERVICE_ROLE_KEY` = (기존)
- `INTERNAL_AUTH_TOKEN` = (Task 9 Step 5 에서 생성한 prod 값)

- [ ] **Step 3: `prd_query` 값 입력**

- `ANTHROPIC_API_KEY` = (기존)
- `VOYAGE_API_KEY` = (기존)
- `QDRANT_URL` = (Qdrant Cloud URL)
- `QDRANT_API_KEY` = (Qdrant Cloud key)
- `QDRANT_COLLECTION` = `insurance_clauses`
- `SUPABASE_URL` = (기존)
- `SUPABASE_SERVICE_ROLE_KEY` = (기존)
- `LANGFUSE_PUBLIC_KEY` = (신규)
- `LANGFUSE_SECRET_KEY` = (신규)
- `LANGFUSE_HOST` = `https://cloud.langfuse.com`
- `INTERNAL_AUTH_TOKEN` = (동일 prod 값)
- `QUERY_SERVICE_URL` = (Task 13 에서 reference variable 입력, 지금은 빈 값 또는 placeholder)

- [ ] **Step 4: `prd_ui` 값 입력**

- `NEXT_PUBLIC_SUPABASE_URL` = (기존)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (기존)
- `SUPABASE_SERVICE_ROLE_KEY` = (기존)
- `INTERNAL_AUTH_TOKEN` = (동일 prod 값)
- `QUERY_API_URL` = (Task 13 에서 reference variable, 지금은 placeholder)
- `INGESTION_API_URL` = (Task 13 에서 reference variable, 지금은 placeholder)

- [ ] **Step 5: secret 수 검증 (Doppler Free 20 개 한도)**

3 config 별 Dashboard 에 표시되는 secret count 확인:
- prd_ingestion: ~7
- prd_query: ~12
- prd_ui: ~6

**Free plan 은 총 개수 제한이 아닌 config 별 제한일 수 있음 — 공식 문서 재확인.** 어떤 config 든 20 개 초과 시:
- 옵션 A: Doppler Team plan ($20/월) 업그레이드
- 옵션 B: 해당 service 의 `QDRANT_COLLECTION` 처럼 non-secret 은 Railway plain env 로 이동

현재 예상은 최대 config 가 ~12 개 → **여유 있음**.

---

## Task 11: Railway 프로젝트 + 3 service 등록

**Why:** 배포 대상 실체 생성. 이 단계 후 Railway 가 각 service 의 `RAILWAY_PRIVATE_DOMAIN` 과 `PORT` 를 발급 → Task 13 에서 reference variable 치환 가능.

**수행 방식:** Railway 웹 UI.

- [ ] **Step 1: Railway 가입 + 신규 프로젝트 생성**

1. https://railway.com 가입 + Hobby plan 활성화 ($5/월 또는 free credit)
2. **New Project** → "Empty Project"
3. Project name: `insurance-qa-agent`

- [ ] **Step 2: ingestion-service 서비스 추가**

1. `+ New` → "GitHub Repo" → `Claude-su-Factory/qa--insurance-agent-work` 선택
2. Service name: `ingestion-service`
3. **Settings → Source**:
   - Root Directory: `ingestion-service`
   - Watch Paths (선택): `ingestion-service/**`
4. **Settings → Build**:
   - Builder: **Dockerfile**
   - Dockerfile Path: `ingestion-service/Dockerfile`
5. **Settings → Deploy**:
   - Health Check Path: `/health`
   - Health Check Timeout: `30`
   - **Wait for CI**: ON (만약 UI 에 옵션 이름이 다르면 Railway docs 참조; 핵심은 "Require GitHub status checks before deploy")
   - Required checks: 모든 6개 체크 (3 test + 3 docker matrix)
6. **Settings → Networking**:
   - Public Networking: **OFF** (internal only)
7. 아직 배포는 시작하지 말 것 (env 미입력 상태라 실패). 지금은 "Service created, awaiting Doppler integration" 상태 OK.

- [ ] **Step 3: query-service 서비스 추가**

동일 절차, 차이점:
- Service name: `query-service`
- Root Directory: `query-service`
- Dockerfile Path: `query-service/Dockerfile`
- Health Check Path: `/health`
- Public Networking: **OFF**

- [ ] **Step 4: ui-service 서비스 추가**

동일 절차, 차이점:
- Service name: `ui-service`
- Root Directory: `ui-service`
- Dockerfile Path: `ui-service/Dockerfile`
- Health Check Path: `/api/health`
- Public Networking: **ON** (Generate Domain)
- **Build ARGs** (Dockerfile ARG 를 Railway build 시점에 주입):
  - `NEXT_PUBLIC_SUPABASE_URL` = (Supabase URL)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (Supabase anon key)
  - (기타 NEXT_PUBLIC_* 가 Dockerfile 에 선언돼 있지만 값이 없으면 빈 문자열로 빌드)

   **주의:** NEXT_PUBLIC_* 값들은 브라우저 번들에 embed 되므로 이미 공개 안전값. Doppler 경유 대신 Railway build ARG 에 직접 입력해도 보안상 동일.

- [ ] **Step 5: 3 service 의 Railway 변수 자동 발급 확인**

Railway dashboard → 각 service → Variables → `RAILWAY_PRIVATE_DOMAIN` 값이 `<service>.railway.internal` 형태로 보이는지 확인.

---

## Task 12: Railway ↔ Doppler 통합 (3 service)

**Why:** Doppler 값이 Railway env 로 자동 push. 이후 값 변경은 Doppler 에서만.

- [ ] **Step 1: Railway 에서 Doppler integration 활성화**

Railway dashboard → **Integrations** → **Doppler** → **Connect** → OAuth 인증.

- [ ] **Step 2: ingestion-service ↔ `prd_ingestion` 매핑**

Railway dashboard → ingestion-service → Variables → **Import from Doppler** →
- Project: `insurance-qa-agent`
- Config: `prd_ingestion`
- Sync mode: **Two-way / Read-only from Doppler** (Doppler 를 단일 진실 원천으로)

기대: Doppler 의 7 개 변수가 Railway Variables 에 나타남.

- [ ] **Step 3: query-service ↔ `prd_query` 매핑**

동일 절차, Config = `prd_query`.

- [ ] **Step 4: ui-service ↔ `prd_ui` 매핑**

동일 절차, Config = `prd_ui`.

- [ ] **Step 5: 연결 검증**

Doppler dashboard 에서 아무 값이나 한 글자 수정 → 저장 → 몇 초 내 Railway Variables 에 반영되는지 확인.

---

## Task 13: 서비스 간 URL reference variable 배선

**Why:** Task 11 에서 3 service 가 생긴 덕분에 Railway 가 각 서비스의 `RAILWAY_PRIVATE_DOMAIN` + `PORT` 를 발급. 이제 Doppler 에 literal reference 문자열을 입력하면 Railway 가 배포 시점에 치환.

- [ ] **Step 1: `prd_ui` 에 `QUERY_API_URL` 입력**

Doppler dashboard → prd_ui → `QUERY_API_URL` 값을 아래 문자열로 **그대로** 설정 (literal):

```
http://${{query-service.RAILWAY_PRIVATE_DOMAIN}}:${{query-service.PORT}}
```

**주의:** Doppler dashboard 에는 이 리터럴이 그대로 보여야 정상. 치환은 Railway 가 deploy 시점에 수행.

- [ ] **Step 2: `prd_ui` 에 `INGESTION_API_URL` 입력**

값:
```
http://${{ingestion-service.RAILWAY_PRIVATE_DOMAIN}}:${{ingestion-service.PORT}}
```

- [ ] **Step 3: `prd_query` 에 `QUERY_SERVICE_URL` 입력**

값 (eval worker 자기 자신 호출용):
```
http://${{query-service.RAILWAY_PRIVATE_DOMAIN}}:${{query-service.PORT}}
```

- [ ] **Step 4: Railway 로 sync 됐는지 확인**

Doppler 저장 후 몇 초 뒤 Railway dashboard → ui-service → Variables → `QUERY_API_URL` 이 위 literal 로 보이는지 확인. deploy 시점에 실제 URL 로 치환되므로 여기선 literal 상태가 정상.

---

## Task 14: 첫 배포 + 스모크 테스트

**Why:** 앞 단계가 모두 제자리면 이 지점에서 3 service 모두 Healthy. UI public URL 에서 사용자 플로우 전체 동작 검증.

- [ ] **Step 1: main 에 trivial commit 후 push (or Railway redeploy 수동 트리거)**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
git commit --allow-empty -m "chore: trigger Railway first deploy"
git push origin main
```

대안: Railway dashboard → 각 service → **Redeploy**.

- [ ] **Step 2: CI 통과 → Railway 빌드 대기**

```bash
# 웹에서 https://github.com/Claude-su-Factory/qa--insurance-agent-work/actions 관찰
# 전부 초록색 → Railway 가 pull 시작
```

Railway dashboard → 각 service → Deployments → "Build logs" 탭 에서 실시간 추적.

기대: 3 service 모두 `Healthy` 상태로 전이 (5-10분 소요).

- [ ] **Step 3: ui-service public URL 확인**

Railway dashboard → ui-service → Networking → `https://ui-service-production-XXXX.up.railway.app` 복사.

- [ ] **Step 4: Supabase Site URL + Redirect URLs 등록**

Supabase dashboard → Authentication → URL Configuration:
- Site URL: `https://ui-service-production-XXXX.up.railway.app`
- Redirect URLs: `https://ui-service-production-XXXX.up.railway.app/**`

저장.

- [ ] **Step 5: 스모크 테스트 — 랜딩 + Auth**

```bash
curl -sf "https://ui-service-production-XXXX.up.railway.app/api/health"
# 기대: {"status":"ok"}
```

브라우저에서 public URL 접속 → Supabase magic link / OAuth 로 로그인 → 성공.

- [ ] **Step 6: 스모크 테스트 — 문서 업로드 + 일반 질문**

1. 보험 약관 PDF 업로드 → ingestion SSE 진행 → 완료
2. 질문: "보험금 청구 절차를 알려주세요"
3. SSE 5-step 진행 (supervisor → retrieval → answer_team → 완료) → 답변 수신
4. 인용 표시 확인

- [ ] **Step 7: 스모크 테스트 — claim_eligibility 질문**

1. 질문: "내가 자동차 사고로 다쳤는데 보험금 받을 수 있나요?"
2. SSE 6-step 진행 (tools_agent 포함) → 답변 수신

- [ ] **Step 8: Langfuse 대시보드 검증**

https://cloud.langfuse.com → project `insurance-qa-agent` → Traces →
- 방금 두 질문이 trace 로 적재
- Nested span: supervisor → retrieval_team → answer_team 트리 구조 가시화

---

## Task 15: 자동 배포 E2E 검증

**Why:** "main push → 사람 손 0회" 가 이번 작업의 핵심 산출물. 2 시나리오로 증빙.

- [ ] **Step 1: 성공 시나리오 — README 더미 수정 → 자동 배포**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
printf "\n<!-- Railway deploy probe %s -->\n" "$(date +%s)" >> README.md
git add README.md
git commit -m "docs: railway auto-deploy probe"
git push origin main
```

- 2-3분 후 GitHub Actions 4 job 모두 초록 확인
- Railway dashboard → 3 service 에 새 deploy 자동 시작 확인
- public URL 새 버전 반영 확인 (README 반영은 UI 에 안 보이니 Railway Deployment 목록의 commit hash 가 바뀌었는지로 판단)
- 검증 기록: commit SHA + Railway deployment ID 메모

- [ ] **Step 2: 실패 시나리오 — 의도적 깨뜨린 테스트 → 배포 차단**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
git checkout -b probe/ci-fail
# ingestion-service 의 테스트 하나에서 expected 값을 일부러 틀리게 수정
# 예: ingestion-service/internal/config/env_override_test.go 에서 9999 → 8888
git commit -am "test: intentionally break ingestion test to verify CI gate"
git push -u origin probe/ci-fail
gh pr create --title "probe: CI gate fail" --body "Intentional failure to verify branch protection"
```

- GitHub Actions 에 `ingestion-tests` job **FAIL** 확인
- PR 머지 버튼이 "Required status checks must pass" 로 **비활성화** 되어 있는지 확인
- Railway 는 main 으로 머지되지 않았으므로 배포 **시도조차 없음** 확인

- [ ] **Step 3: 실패 시나리오 revert**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
gh pr close probe/ci-fail
git checkout main
git branch -D probe/ci-fail
git push origin --delete probe/ci-fail
```

- [ ] **Step 4: 검증 기록**

두 시나리오 스크린샷 또는 URL 을 docs/STATUS.md 최근 변경 이력 항목에 근거로 남김 (Task 17 에서 문서화).

---

## Task 16: `scripts/apply-secrets.sh` 정리

**Why:** k8s 전용 스크립트. Railway 환경에선 불필요. 남겨두면 혼란.

**Files:**
- Delete or deprecate: `scripts/apply-secrets.sh`

- [ ] **Step 1: 현재 사용처 확인**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
grep -rn "apply-secrets" --exclude-dir=node_modules --exclude-dir=.git
```

기대: `scripts/deploy.sh` 및 문서 몇 곳 정도. deploy.sh 가 호출한다면 "--no-build 모드에서만 호출" 같은 구조.

- [ ] **Step 2: 옵션 A (권장) — 파일 삭제 + deploy.sh 에서 호출 제거**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
# 사용처가 deploy.sh 뿐이고, k8s 자체가 레거시라면 삭제가 깔끔
git rm scripts/apply-secrets.sh
# deploy.sh 에서 호출 라인 제거 (수동 편집 필요 시 sed/편집기 사용)
```

옵션 B (보수적) — 파일 상단에 deprecated 주석 추가:
```bash
# scripts/apply-secrets.sh 맨 앞에:
# !!! DEPRECATED: Railway + Doppler 로 대체됨 (2026-04-18)
# 이 스크립트는 레거시 minikube 흐름 증빙용으로만 남아있음.
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
git add scripts/
git commit -m "chore: deprecate apply-secrets.sh (Railway/Doppler 로 대체)"
```

---

## Task 17: 문서 업데이트 (CLAUDE.md / STATUS / ROADMAP / ARCHITECTURE / README)

**Why:** 작업 완료 = 문서 반영 완료 (CLAUDE.md 필수 규칙).

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `README.md`

- [ ] **Step 1: `CLAUDE.md` — 배포 규칙 섹션 교체**

**기존** (지금 CLAUDE.md 의 "배포 규칙 (MANDATORY)" 섹션):
```
bash scripts/deploy.sh
...
```

**교체안**:
```markdown
## 배포 규칙 (MANDATORY)

프로덕션 배포는 **Railway 가 자동 수행**한다. 사람 손 개입 0.

- `main` 브랜치에 push 또는 PR 머지 → GitHub Actions 4 job (3 test + docker matrix) 통과 → Railway 3 service 자동 배포
- 환경변수는 Doppler → Railway 자동 sync. 코드 저장소에 키 값 없음
- 로컬 개발은 기존 `.env.local` 방식 유지 (외부 서비스 의존 없이 로컬 돌리기 위함)
- minikube `scripts/deploy.sh` 는 레거시 증빙용 보존 (프로덕션엔 사용 안 함)

### 로컬 개발
\`\`\`bash
docker compose up -d
# 또는 각 service 루트에서 npm run dev / go run ./cmd/main.go
\`\`\`

### 프로덕션 관찰
- Railway dashboard: 서비스 상태, 로그, 롤백
- Doppler dashboard: env 값 관리
- Langfuse dashboard: LLM trace
- GitHub Actions: CI 이력
```

- [ ] **Step 2: `docs/STATUS.md` — 최근 변경 이력 갱신**

파일 맨 앞 "최근 변경 이력" 섹션에 한 줄 추가:
```markdown
- **2026-04-19 — Railway 실배포 완료:** 3 service (ingestion/query/ui) Railway Hobby 배포. Doppler ↔ Railway 자동 sync. GitHub Actions 4 job CI (main push → auto-deploy). Qdrant Cloud + Langfuse Cloud 활성. live URL: https://<ui-host>.up.railway.app
```

그리고 "마지막 업데이트" 날짜 갱신 (2026-04-19).

Tier 1 체크리스트에서 "Railway 클라우드 실배포" 항목을 ✅ 로 마킹.

- [ ] **Step 3: `docs/ROADMAP.md` — JD 매핑 + 현재 추천 작업 갱신**

JD 매핑 테이블에서 "클라우드 (AWS, Azure)" 행을 `❌ 로컬 minikube만` → `✅ Railway Hobby 실배포 + CI/CD 자동화` 로 변경.

"현재 추천 다음 작업" 을 `Railway 클라우드 실배포` → `model-service (CPU 양자화 자체 서빙)` 으로 교체.

Tier 1 §4 "Railway 클라우드 실배포" 섹션 삭제 또는 "완료 (2026-04-19)" 로 표기.

- [ ] **Step 4: `docs/ARCHITECTURE.md` — 배포 토폴로지 섹션 추가 + Langfuse 주석**

"배포 아키텍처" 신규 섹션 추가 (적절한 위치에):
```markdown
## 배포 아키텍처 (Railway, 2026-04-19)

\`\`\`
GitHub (main push) → GitHub Actions (4 job CI) → Railway
                                                    ├─ ingestion-service (private)
                                                    ├─ query-service (private)
                                                    └─ ui-service (public)
Doppler (3 prd_* config) ── two-way sync ── Railway Variables
\`\`\`

- 서비스 간 URL: Railway reference variable
- Secret: Doppler 단일 진실 원천
- Health check: 각 service `/health` (ui는 `/api/health`)
- 롤백: Railway dashboard 원클릭
- 로컬 개발: 기존 docker-compose / `.env.local` 방식 유지 (외부 cloud 의존 없음)
```

"Langfuse keys 미구성, nested span 관찰 불가" 줄이 있으면 "Langfuse Cloud 활성 (2026-04-19). nested span 관찰 완성" 으로 수정.

- [ ] **Step 5: `README.md` — live URL + CI 배지**

파일 상단에:
```markdown
[![CI](https://github.com/Claude-su-Factory/qa--insurance-agent-work/actions/workflows/ci.yml/badge.svg)](https://github.com/Claude-su-Factory/qa--insurance-agent-work/actions/workflows/ci.yml)

**Live demo:** https://<ui-host>.up.railway.app
```

- [ ] **Step 6: 문서 검증 — 모든 링크/URL 유효성**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
# 간단 링크 체크: docs/* 의 relative 참조
grep -rE "\]\(docs/" docs/ --include="*.md" | head -10
```

깨진 링크 수정.

- [ ] **Step 7: 최종 Commit + push (정식 PR 흐름)**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent"
git add CLAUDE.md docs/STATUS.md docs/ROADMAP.md docs/ARCHITECTURE.md README.md
git commit -m "docs: reflect Railway + CI/CD deploy completion"

# 이번 작업을 통째로 feature branch 로 묶어 PR 로 올리는 게 branch protection 증빙에 더 좋음.
# 단, 이미 Task 7 에서 main 에 직접 push 한 상태라면 이 문서 커밋도 동일 흐름.
git push origin main
```

---

## Self-Review (작성자 체크)

### Spec 커버리지

| 스펙 §섹션 | 커버 Task |
|---|---|
| §3 Repo 재구성 | Task 1 |
| §4 보안 게이트 A-E | Task 1 (Step 7-12) |
| §4.3 GitHub 보안 설정 + branch protection | Task 8 |
| §5 Railway 프로젝트 구성 | Task 11 |
| §5.3 R1 PORT env 우선 | Task 3 (ingestion), Task 5 (query verify) |
| §5.3 R2 서비스 URL env | Task 13 (Doppler reference var), Task 5 (query/ui verify) |
| §5.3 R3 `/health` | Task 4 (ui new), Task 5 (query verify), Task 3 은 ingestion /health 이미 있음 |
| §6 Doppler 통합 | Task 10, Task 12 |
| §6.2 env 목록 | Task 2 .env.production.example, Task 10 Doppler 입력 |
| §7 CI 워크플로우 | Task 6 |
| §7.3 Branch protection | Task 8 |
| §8.1 Qdrant Cloud | Task 9 |
| §8.2 Langfuse Cloud | Task 9, Task 14 Step 8 검증 |
| §8.3 Supabase URL | Task 14 Step 4 |
| §8.5 서비스 간 URL 배선 | Task 13 |
| §9.1 스모크 테스트 | Task 14 Step 5-7 |
| §9.2 인프라 검증 | Task 14 Step 2, Task 15 |
| §9.3 자동 배포 검증 | Task 15 |
| §10.3 apply-secrets.sh | Task 16 |
| §10.2 문서 업데이트 | Task 17 |

모든 스펙 섹션 커버 확인.

### Placeholder 스캔

- "TBD" / "구현 단계에서 정함" 등 의사결정 보류 표현 없음 ✓
- 모든 코드 스텝에 실제 파일 경로 + 실제 코드 blob 포함 ✓
- 모든 명령 스텝에 기대 출력 명시 ✓

### Type/이름 일관성

- Task 2 .env.production.example, Task 10 Doppler 입력, Task 13 reference variable 입력 — 3 곳에서 env 이름 동일:
  - ui: `QUERY_API_URL`, `INGESTION_API_URL` ✓
  - query: `QUERY_SERVICE_URL` (self-hit) ✓
  - 공유: `INTERNAL_AUTH_TOKEN` ✓
- `ApplyEnvOverrides` 함수명 Task 3 Step 1 / Step 3 / Step 5 전부 동일 ✓

### 주의 포인트

- **Task 4 Step 2:** ui-service 테스트 프레임워크 유무에 따라 2a / 2b 분기. 실행자가 판단해야 함.
- **Task 8 Step 2:** `gh api` PUT 의 branch protection 페이로드는 GitHub API 문서와 실제 응답이 다를 수 있음. 웹 UI 가 안전한 fallback.
- **Task 10 Step 5:** Doppler Free plan 한도는 플랜 페이지 재확인 필요. 초과 시 Team plan 업그레이드 또는 non-secret 분리 필요.
- **Task 11 Step 2 Wait for CI:** Railway 의 UI 용어는 변할 수 있음 ("Deploy Triggers" 또는 "CI Integration"). Railway docs 로 최신 경로 확인.
- **Task 13:** reference variable 문법 (`${{svc.RAILWAY_PRIVATE_DOMAIN}}`) 은 Railway 문서 기준. 오타 한 글자만 있어도 literal 로 저장되니 주의.
- **Task 15 Step 1:** "README 더미 수정" 은 `.github/workflows/ci.yml` 트리거 조건에 포함됨 (on: push: branches: [main]). Docker 빌드 캐시가 활용돼 CI 는 빠르게 끝날 것.
