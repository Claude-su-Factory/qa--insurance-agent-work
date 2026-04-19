# Railway 클라우드 실배포 + CI/CD 자동화 설계 스펙

**작성일:** 2026-04-18
**상태:** Draft → 사용자 리뷰 대기
**JD 매핑:** 클라우드 서비스 (필수), AI 서비스 운영 (필수), LLMOps 운영 고도화 (주요 업무)

## 1. 목적 & 범위

로컬 minikube 전용으로 돌고 있는 보험 약관 QA Agent를 Railway로 실제 배포하고, `main` 브랜치 push → 자동 배포가 되는 완전 자동화 파이프라인을 구축한다.

**스코프 기준 (portfolio 최소 증빙):**
- 사용자가 직접 조작하지 않아도 push 후 live URL에 변경이 반영되는 상태
- 단일 production 환경 (staging 미포함)
- 커스텀 도메인 없음 (Railway 기본 서브도메인)
- 과투자 항목(부하 테스트, canary, multi-region)은 전부 드롭 (§7 드롭 목록 참고)

**비범위:**
- `model-service` (CPU 양자화 자체 서빙) — 별도 스펙
- Agent 고도화 옵션 B/C — 별도 스펙
- Evaluation 파이프라인 신규 작업 — 이미 완료, Railway 상에서 그대로 동작

## 2. 전체 배포 토폴로지

```
┌─────────────────────────────────────────────────────────────┐
│  GitHub: qa--insurance-agent-work (public)                  │
│  branch: main (protected)                                   │
└────────────────────┬────────────────────────────────────────┘
         push to main│
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  GitHub Actions (.github/workflows/ci.yml)                  │
│  ├─ ingestion-tests   (go test ./...)                       │
│  ├─ query-tests       (vitest + tsc --noEmit)               │
│  └─ ui-build-check    (next build --no-lint)                │
│  3 jobs 병렬, 전부 통과해야 status check 초록 ✓             │
└────────────────────┬────────────────────────────────────────┘
                     │ GitHub status check
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Railway Project: insurance-qa-agent                        │
│  ├─ ingestion-service  (Dockerfile, internal only)          │
│  ├─ query-service      (Dockerfile, internal only)          │
│  └─ ui-service         (Dockerfile, public URL)             │
│  "Wait for CI" ON → CI 실패 시 배포 차단                    │
└────────────────────┬────────────────────────────────────────┘
                     │ Doppler ↔ Railway 통합 (env 자동 주입)
                     ▼
    Qdrant Cloud ─ Supabase ─ Langfuse Cloud ─ Voyage AI ─ Anthropic
```

**핵심 원칙:** main 머지 이후 사람 손 개입 0.

## 3. Repo 재구성

현재 nested git 구조를 정리. 작업 순서는 고정.

### 3.1 현재 상태

```
/Users/yuhojin/Desktop/QA Agent/
├── .git/                                 ← outer (remote 연결됨: qa--insurance-agent-work)
├── .claude/                              ← Claude Code 설정 (프로젝트 밖 성격)
├── docs/                                 ← 2026-04-15 초기 설계 문서 2개만 포함
│   └── superpowers/{plans,specs}/2026-04-15-*
└── insurance-qa-agent/
    ├── .git/                             ← inner (우리가 작업해온 모든 commit 여기에 있음)
    └── (프로젝트 전체 코드)
```

### 3.2 재구성 절차

1. **outer docs 2 파일 → inner로 이동**
   - `mv /Users/yuhojin/Desktop/QA Agent/docs/superpowers/plans/2026-04-15-insurance-qa-agent.md` → `insurance-qa-agent/docs/superpowers/plans/`
   - `mv /Users/yuhojin/Desktop/QA Agent/docs/superpowers/specs/2026-04-15-insurance-qa-agent-design.md` → `insurance-qa-agent/docs/superpowers/specs/`
   - inner에서 `git add` + 커밋
2. **outer cleanup**
   - outer `.git`, `docs/`, `.DS_Store` 제거
   - outer `.claude/` 는 프로젝트 외부 Claude Code 설정이라 그대로 두거나 `~/Desktop/` 으로 상단 이동 (프로젝트 git에 영향 없음)
3. **inner 브랜치 rename**
   - `git branch -m master main`
4. **inner에 remote 연결**
   - `git remote add origin https://github.com/Claude-su-Factory/qa--insurance-agent-work.git`
5. **보안 스캔 게이트 (§4)** — 통과 전엔 push 금지
6. **uncommitted 변경 정리** — 현재 working tree 상태 점검, 논리 단위로 분할 커밋
7. **`.env.production.example` 3개 + 공용 1개 생성** — 키 이름만, 값 없음
8. **첫 push** — `git push -u origin main`

### 3.3 완료 후 최종 구조

```
/Users/yuhojin/Desktop/QA Agent/
├── .claude/                              ← 유지 (또는 외부로 이동)
└── insurance-qa-agent/                   ← 유일한 git repo, main 브랜치, origin 연결됨
    ├── .git/
    ├── .github/workflows/ci.yml
    ├── .env.production.example
    ├── ingestion-service/
    ├── query-service/
    ├── ui-service/
    ├── k8s/                              ← 기존 유지 (증빙용 레거시)
    ├── scripts/
    ├── supabase/
    └── docs/
```

## 4. 보안 체크리스트 (Pre-push 게이트)

GitHub 저장소가 **public**이기 때문에 push 전에 반드시 통과해야 할 검증.

### 4.1 게이트 항목

**게이트 A — git history 전수 스캔:**
```bash
git log -p --all | grep -iE "(api[_-]?key|secret|token|sk-ant|pcsk-|voyage|langfuse_secret|password|bearer)"
```
매치 0건이어야 통과. 매치되면 해당 commit hash 기록 → `git filter-branch` 또는 `git-filter-repo` 로 history rewrite 후 재검사.

**게이트 B — 소스 하드코딩 스캔:**
```bash
grep -rIE "(sk-ant-|pcsk_|voyage_|SUPABASE_SERVICE_ROLE_KEY=[^$])" \
  --exclude-dir=node_modules --exclude-dir=.git \
  --exclude-dir=vendor --exclude="*.md" \
  ingestion-service/ query-service/ ui-service/ scripts/
```
매치 0건이어야 통과. `.md` 는 예시 값이 있을 수 있어 제외 (대신 수동 확인).

**게이트 C — `scripts/apply-secrets.sh` 본문 검증:**
- 리터럴 키 값 없음
- 오직 환경변수 읽기 또는 `.env` 파일 참조만 수행

**게이트 D — `.gitignore` 커버리지:**
- `.env`, `.env.local`, `*.env`, `.env*.local`, `.env.production` 모두 포함
- 실제로 `.env.production` 파일 만들어서 `git status` 에서 Untracked로 잡히는지 확인

**게이트 E — `.env.production.example` 내용 검증:**
- 키 이름만, `=` 뒤 값 없거나 `<your-key-here>` 같은 placeholder

### 4.2 통과 실패 시

- 하나라도 실패하면 **push 전면 중단** → 사용자에게 상세 보고 → 원인 제거 후 게이트 재실행
- push 후 사후 발견 시: **keys 즉시 회전** (Anthropic/Voyage/Supabase 대시보드에서 revoke + 신규 발급) → git history rewrite → force push → Doppler 값 갱신

### 4.3 GitHub 저장소 보안 설정

- Secret Scanning: ON (public repo는 기본 활성)
- Secret push protection: ON (push 시점에 키 패턴 감지)
- Dependabot alerts: ON
- Branch protection rule on `main`:
  - Require a pull request before merging
  - Require status checks to pass before merging (ingestion-tests, query-tests, ui-build-check)
  - Require branches to be up to date before merging
  - Do not allow bypassing the above settings

## 5. Railway 프로젝트 구성

### 5.1 서비스 구성

| Service | Root directory | Dockerfile | 포트 바인딩 | 외부 노출 | Health check |
|---|---|---|---|---|---|
| `ingestion-service` | `ingestion-service/` | `ingestion-service/Dockerfile` | `$PORT` | 비공개 | `/health` |
| `query-service` | `query-service/` | `query-service/Dockerfile` | `$PORT` | 비공개 | `/health` |
| `ui-service` | `ui-service/` | `ui-service/Dockerfile` | `$PORT` | 공개 | `/` (또는 `/api/health`) |

### 5.2 네트워킹 원칙

- UI만 public URL 부여: `https://ui-service-production-XXXX.up.railway.app` 형태
- ingestion, query는 Railway internal DNS 전용 (`<service>.railway.internal`)
- 서비스 간 URL은 Railway **reference variable** 로 Doppler에 입력:
  - `QUERY_SERVICE_URL = http://${{query-service.RAILWAY_PRIVATE_DOMAIN}}:${{query-service.PORT}}`
  - `INGESTION_SERVICE_URL = http://${{ingestion-service.RAILWAY_PRIVATE_DOMAIN}}:${{ingestion-service.PORT}}`
  - Railway가 deploy 시점에 자동 치환 → "먼저 배포해서 DNS 확인 → 값 입력 → 재배포" 닭-달걀 루프 불필요
- 브라우저 → UI → (server-side proxy) → query/ingestion. 외부에서 query/ingestion 직접 호출 경로 없음
- 공격 표면 = UI 하나

### 5.3 Code 변경 필요 항목

스펙 단계에서 확정된 요구사항. 구현 계획에서 Task로 분리.

**요구사항 R1 — PORT 환경변수 우선 바인딩 (3 서비스 공통):**
- ingestion-service (Go): `config.toml` 포트보다 `os.Getenv("PORT")` 우선
- query-service (TS): `process.env.PORT` 우선
- ui-service (Next.js): Next.js는 `PORT` env 자동 존중. Dockerfile CMD에 `-p ${PORT:-3000}` 명시

**요구사항 R2 — 서비스 URL 환경변수화:**
- ui-service: `QUERY_SERVICE_URL`, `INGESTION_SERVICE_URL` 환경변수 기반 호출. 하드코딩된 localhost/k8s DNS 전면 제거
- query-service: ingestion 호출 경로가 있으면 `INGESTION_SERVICE_URL` 환경변수 사용

**요구사항 R3 — `/health` 엔드포인트 존재 보장 (스펙 수준 필수):**
- Railway health check를 위한 필수. 3 서비스 모두 `/health` (또는 UI는 `/api/health`) 로 200 반환 필요
- 구현 계획 Task 1에서 현재 상태를 각 서비스별로 스캔 (`grep -r "/health"`) → 없는 서비스엔 단순 handler 추가
- 응답 본문은 `{"status":"ok"}` 수준으로 충분. DB/외부서비스 의존성 체크 포함 안 함 (health check가 외부 장애로 flapping 되는 것 방지)

### 5.4 Railway service 설정값

각 service dashboard에서:
- Deploy → Source: GitHub `qa--insurance-agent-work` 선택, root directory 지정
- Deploy → Builder: Dockerfile 선택, path `<service>/Dockerfile`
- Deploy → Health check: `/health`, timeout 30s
- Deploy → **Wait for CI Checks** ON, required checks에 3 job 이름 등록
- Networking → Public (ui-service만) 또는 Private only
- Integrations → Doppler 연결 (§6)

### 5.5 리소스 플랜

- Railway Hobby tier ($5/월 무료 크레딧 + 사용량 기반 과금)
- 3 서비스 상시 가동 월 $5~$10 예상
- Volume 불사용 (모든 서비스 stateless, 상태는 Supabase/Qdrant Cloud에)

## 6. Doppler 통합 (환경변수 관리)

### 6.1 Doppler 프로젝트 구조

```
Doppler Project: insurance-qa-agent
├── Config: prd_ingestion    → Railway ingestion-service에 연결
├── Config: prd_query        → Railway query-service에 연결
└── Config: prd_ui           → Railway ui-service에 연결
```

- Doppler는 **프로덕션 환경변수 관리만** 담당. 로컬 개발은 기존 `.env.local` / `.env` 파일 방식 유지 (로컬 개발이 외부 서비스 의존하지 않도록)
- 공유 변수(VOYAGE_API_KEY, QDRANT_URL, QDRANT_API_KEY, SUPABASE_*, INTERNAL_AUTH_SECRET)는 3 config에 중복 입력. parent/child inherited config 는 포트폴리오 스코프에서 드롭 (학습 비용 대비 이득 낮음)
- `.env.production.example` 파일들이 각 config의 "필요 키 목록" 레퍼런스 역할

### 6.2 서비스별 환경변수 목록 (예상)

최종 목록은 구현 단계에서 현재 `.env` 파일들을 대조해 확정. 지금까지 파악된 것:

**prd_ingestion:**
- `VOYAGE_API_KEY`
- `QDRANT_URL`, `QDRANT_API_KEY`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `INTERNAL_AUTH_SECRET`
- `PORT` (Railway 주입)

**prd_query:**
- `ANTHROPIC_API_KEY`
- `VOYAGE_API_KEY`
- `QDRANT_URL`, `QDRANT_API_KEY`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`
- `INTERNAL_AUTH_SECRET`
- `INGESTION_SERVICE_URL`
- `PORT`

**prd_ui:**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `QUERY_SERVICE_URL`, `INGESTION_SERVICE_URL`
- `INTERNAL_AUTH_SECRET`
- `PORT`

**총 예상 키 수:** 약 25개. Doppler Free plan 20 secrets 한도 초과 가능성 있음 → **구현 단계에서 실제 세어보고 초과 시 Team plan ($20/월) 또는 공유 변수 중복 제거 전략 재평가**.

### 6.3 Doppler ↔ Railway 연동

1. Doppler dashboard → Project `insurance-qa-agent` 생성 → 3 config 추가
2. 각 config에 값 입력 (수동 또는 CSV 업로드)
3. Railway dashboard → 각 service → Integrations → Doppler 선택 → OAuth 인증
4. 각 Railway service를 대응 Doppler config에 매핑
5. 초기 sync 자동 실행 → Railway env 채워짐

이후 운영: Doppler dashboard에서 값 수정 → Doppler가 Railway로 자동 push → Railway 자동 redeploy. 사람 손 개입 0.

### 6.4 로컬 개발

- 기존 방식 유지. 각 서비스의 로컬 `.env`, `.env.local` 파일에서 환경변수를 읽음
- Doppler CLI 설치 불필요. 로컬 개발 경로에 외부 서비스 의존성 추가하지 않음
- `.env.production.example` 파일로 "프로덕션에 필요한 키 목록" 만 레퍼런스화
- 로컬 `.env` 와 Doppler 값이 drift할 가능성이 있으나, 포트폴리오 규모에선 새 키 추가 시 두 곳을 인지하고 수동 동기화하는 것으로 충분 (`.env.production.example` 업데이트가 암묵적 체크리스트 역할)

### 6.5 장애 모드

- Doppler 장애 → Railway의 신규 배포 시 env fetch 실패 → 배포 실패
- 이미 실행 중인 서비스는 영향 없음 (Railway가 이전에 주입한 env로 유지)
- Doppler Free plan SLA는 포트폴리오 수준에서 허용

## 7. CI/CD 파이프라인 (GitHub Actions)

### 7.1 워크플로우 파일

`.github/workflows/ci.yml` (repo root)

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

4 job 병렬 (3 test + 1 matrix docker-build). docker-build-check는 matrix 3 parallel → 사실상 6 job 동시 실행. Dockerfile 빌드 실패 시 배포 단계 전에 차단. 예상 전체 소요 4-7분 (Docker 빌드 캐시 hit 시 더 빠름).

### 7.2 Railway 배포 트리거

- Railway service dashboard → **Wait for CI Checks** ON (Railway UI 용어는 변경될 수 있음, 구현 단계에서 정확한 경로 확인)
- Required checks: `ingestion-tests`, `query-tests`, `ui-build-check`, `docker-build-check (ingestion-service)`, `docker-build-check (query-service)`, `docker-build-check (ui-service)`
- 모든 check 통과해야 Railway 배포 시작
- 테스트 또는 Docker 빌드 실패 = 배포 0회

### 7.3 Branch protection (GitHub 저장소 설정)

`main` 브랜치:
- Require a pull request before merging
- Require status checks to pass before merging (3 jobs 필수)
- Require branches to be up to date before merging
- Do not allow bypassing the above settings (admin 포함)

직접 push 경로 차단 → 모든 변경은 PR 경유 → CI 게이트 통과 후 머지.

### 7.4 Secret 관리 방침

- CI에서 비밀 값이 필요한 테스트 없음. 현재 vitest 27개 + Go 테스트 모두 순수 로직 / stub 기반 (구현 단계에서 재검증)
- 만약 외부 API 호출 E2E 테스트가 추가되면 별도 workflow로 분리 + GitHub Secrets에 key 저장. 지금 스코프엔 불필요

### 7.5 배포 플로우 (end-to-end)

```
로컬 PR 작성
     ↓ git push
GitHub Actions 3 jobs 병렬 (3-5분)
     ↓ 모두 통과 → status check ✓
PR 머지 (main 업데이트)
     ↓
Railway가 main push 감지 + CI 통과 확인
     ↓
Railway가 Doppler에서 최신 env pull
     ↓
3 서비스 Docker 빌드 + 배포 (병렬, 3-8분)
     ↓
Railway 자동 health check
     ↓
새 버전 반영 → public URL에 적용
```

### 7.6 롤백 전략

- Railway dashboard → service → Deployments → 이전 배포 선택 → "Rollback" 원클릭
- 과투자(자동 rollback on failure, canary, blue-green)는 드롭

## 8. 외부 서비스 셋업

### 8.1 Qdrant Cloud (신규)

1. `cloud.qdrant.io` 가입 → Free cluster 생성 (region: AWS ap-northeast-2 또는 근접)
2. `QDRANT_URL`, `QDRANT_API_KEY` 발급
3. Doppler `prd_ingestion`, `prd_query` 에 입력
4. 배포 후 ingestion-service 첫 호출 시 collection 자동 생성 확인
   - **구현 단계 검증 필요:** 기존 collection 자동 생성 로직이 있는지. 없으면 초기화 API 호출 스크립트 추가

### 8.2 Langfuse Cloud (신규)

1. `cloud.langfuse.com` 가입 → project `insurance-qa-agent` 생성
2. Settings → API keys: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` (= `https://cloud.langfuse.com`)
3. Doppler `prd_query` 에만 입력 (query-service만 트레이싱 코드 있음)
4. 배포 후 첫 질의 → Langfuse dashboard에서 trace 수집 확인
5. **ARCHITECTURE.md:240 업데이트** — "Langfuse keys 미구성, nested span 관찰 불가" → "nested span 관찰 완성" 으로 수정 (Supervisor Task 8 후속 해소)

### 8.3 Supabase (기존 프로젝트 재사용)

- 로컬에서 쓰던 Supabase 프로젝트 그대로 사용
- 기존 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` 를 Doppler 3 config에 각각 배치 (UI는 anon, 서비스는 service_role)
- **Supabase dashboard 설정 변경:**
  - Authentication → URL Configuration → Site URL에 Railway ui-service public URL 추가
  - Redirect URLs에 동일 URL 추가 (OAuth 리다이렉트 정상 동작)
- RLS 정책 그대로 유지

### 8.4 Voyage AI / Anthropic (기존 키 재사용)

- 기존 로컬 `.env` 값을 Doppler에 옮김
- Anthropic key 모델 접근 권한 확인: `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`
- 추가 조치 없음

### 8.5 서비스 간 URL 배선

§5.2의 Railway reference variable 방식으로 닭-달걀 문제 자체를 제거.

1. Railway 3 service 등록 (source = GitHub repo, root directory 지정). 이 시점에 Railway가 각 service의 internal DNS와 PORT를 확정
2. Doppler에 **literal reference variable 문자열**을 그대로 입력:
   - `prd_ui`.`QUERY_SERVICE_URL` = `http://${{query-service.RAILWAY_PRIVATE_DOMAIN}}:${{query-service.PORT}}`
   - `prd_ui`.`INGESTION_SERVICE_URL` = `http://${{ingestion-service.RAILWAY_PRIVATE_DOMAIN}}:${{ingestion-service.PORT}}`
   - `prd_query`.`INGESTION_SERVICE_URL` = `http://${{ingestion-service.RAILWAY_PRIVATE_DOMAIN}}:${{ingestion-service.PORT}}`
3. Doppler → Railway 자동 sync (Railway는 push 받은 시점에 reference variable 치환 수행)
4. 첫 deploy 실행 → 서비스 기동 성공
5. ui-service public URL 확인 후 Supabase dashboard (Authentication → URL Configuration) 에 site URL + redirect URLs 등록

**참고:** reference variable은 Doppler에 literal string 으로 저장되고, Railway가 deploy 시점에만 실제 값으로 치환한다. 따라서 Doppler dashboard에선 그대로 `${{...}}` 가 보이는 게 정상.

## 9. 배포 검증 체크리스트

### 9.1 스모크 테스트 (사용자 플로우)

1. ui-service public URL 접속 → 랜딩 페이지 로드
2. Supabase Auth 로그인 → 성공
3. 보험 약관 PDF 업로드 → Qdrant Cloud에 임베딩 저장
4. 일반 질문 입력 → SSE 5-step 진행 → 답변 수신
5. claim_eligibility 질문 → SSE 6-step (tools_agent 포함) → 답변 수신
6. 답변에 인용 하이라이트 표시

### 9.2 인프라 검증

- Railway dashboard: 3 service Running + Healthy
- Railway logs: 기동 시 fatal 에러 없음
- Doppler dashboard: 3 config 전부 Railway에 sync 성공 표시
- Langfuse dashboard: 질의 trace 수집됨 (supervisor → retrieval_team → answer_team nested span 관찰)
- Supabase dashboard: `eval_snapshots` 테이블에 grader≥2 레코드 적재
- GitHub Actions: 3 job 전부 통과 이력
- GitHub Secret Scanning: alerts 0

### 9.3 자동 배포 검증 (핵심)

1. main 브랜치에 의도적 더미 commit (예: README 한 줄 수정) push
2. GitHub Actions 자동 트리거 확인
3. Railway가 CI 통과 대기 후 자동 빌드 시작 확인
4. 새 배포 완료까지 사람 손 개입 0회 검증
5. 의도적으로 테스트 깨뜨린 commit push → GitHub Actions 실패 → Railway 배포 차단 확인 후 revert

### 9.4 보안 검증

- public URL에서 `/health` 외에 query/ingestion 직접 호출 시도 → 내부 DNS라 도달 불가 (expected)
- Langfuse trace에 env 값이 log로 새지 않는지 스팟 체크
- Doppler audit log에 비정상 접근 없음

## 10. 영향 파일

### 10.1 신규 생성

- `.github/workflows/ci.yml`
- `.env.production.example` (repo root)
- `ingestion-service/.env.production.example`
- `query-service/.env.production.example`
- `ui-service/.env.production.example`
- `docs/superpowers/plans/2026-04-18-railway-deployment.md` (구현 계획)

### 10.2 수정

- `.gitignore` — `.env.production` 패턴 명시
- `CLAUDE.md` — 배포 규칙 섹션 교체 (minikube → Railway), 로컬 개발 섹션 `doppler run` 추가
- `docs/STATUS.md` — Railway 완료 반영, 다음 추천 작업 재설정
- `docs/ROADMAP.md` — JD "클라우드 서비스" ✅ 승격
- `docs/ARCHITECTURE.md` — 배포 아키텍처 섹션 추가, Langfuse 관찰 주석 수정
- `ingestion-service/` port binding 로직 — `$PORT` 환경변수 우선
- `query-service/src/index.ts` — `$PORT` 우선 + `INGESTION_SERVICE_URL` 환경변수화
- `ui-service/` — `QUERY_SERVICE_URL`, `INGESTION_SERVICE_URL` 환경변수화
- `README.md` — 배포 배지 + live URL 링크

### 10.3 삭제 / Deprecated

- outer `.git` (Desktop/QA Agent 상위)
- outer `docs/` (2 파일 inner로 이동 후 폴더 제거)
- `scripts/apply-secrets.sh` — k8s 전용이라 Railway에선 불필요. 즉시 삭제 or deprecated 주석

### 10.4 손대지 않음

- 3 서비스 Dockerfile (이미 production-ready)
- `supabase/migrations/*`
- `k8s/` (레거시 증빙용 보존)
- `docs/superpowers/specs/2026-04-17-*` 과거 문서

## 11. 드롭된 항목 (YAGNI)

**인프라 확장:**
- staging 환경 — prod only
- multi-region / edge deploy — 단일 region
- 커스텀 도메인 — Railway 기본 서브도메인
- 로드 밸런서 별도 설정

**CI/CD 과투자:**
- lint/format 별도 job — IDE / pre-commit 레벨로 충분
- Slack/Discord 배포 알림
- 자동 rollback on failure — dashboard 수동 원클릭
- Canary / blue-green deploy
- Performance / load testing job
- dependabot auto-merge
- semver 자동화 + git tag

**Secret 관리 과투자:**
- Doppler parent/child inherited config
- Secret 자동 회전
- Audit log dashboard

**관측성 과투자:**
- 자체 Grafana / Prometheus
- OpenTelemetry 별도 backend export
- Sentry 등 별도 에러 트래킹

**개발 편의 과투자:**
- 로컬 ↔ Railway env 양방향 sync 스크립트 (Doppler가 처리)
- GitHub Actions matrix 테스트
- monorepo 도구 (turborepo 등)

## 12. 운영 한계 (사전 고지)

- Railway Hobby tier 메모리 512MB 기본 — 큰 PDF 파싱 시 ingestion OOM 가능. 포트폴리오 테스트 데이터 수준은 허용
- Qdrant Cloud free 1GB — 대량 문서엔 부족. 데모용 충분
- Langfuse free 50k observations/월 — 포트폴리오 시연 규모에 여유
- Doppler free 20 secrets — 실제 키 수 25개 근처일 가능성. **구현 단계에서 세어보고 초과 시 대응**

## 13. JD 매핑 증빙

| JD 항목 | 이번 작업 증빙 | 증빙 매체 |
|---|---|---|
| 클라우드 (AWS, Azure) | Railway 실배포 | Live URL, Railway dashboard 스크린샷 |
| Docker/K8s/MSA | Railway Docker 배포 + 과거 `k8s/` 보존 | repo 구조 |
| AI 서비스 설계→개발→운영 | 프로덕션 배포까지 전 과정 | live + CI/CD |
| LLMOps 운영 고도화 | Langfuse nested trace 수집 | Langfuse dashboard |
| 팀 협업/의사소통 | PR 기반 + CI 게이트 + branch protection | GitHub repo |

## 14. 실행 순서 요약

1. Repo 재구성 (§3) + 보안 스캔 게이트 (§4) → GitHub 첫 push
2. GitHub 저장소 보안 설정 + branch protection (§4.3, §7.3)
3. 외부 서비스 계정 생성 — Qdrant Cloud, Langfuse Cloud, Doppler (§6, §8)
4. Doppler 프로젝트/config 생성 + 값 입력 (§6)
5. 코드 변경 — port binding, URL 환경변수화, health check 엔드포인트 (§5.3)
6. `.github/workflows/ci.yml` 추가 + 테스트 로컬 성공 확인 (§7)
7. Railway 프로젝트/service 생성 + Doppler 연동 (§5, §6.3)
8. 서비스 간 URL 배선 처리 (§8.5)
9. 첫 배포 + 스모크 테스트 + 자동 배포 검증 (§9)
10. 문서 업데이트 (§10.2)

---

## 검토 이력

### 2026-04-18 1차 자체 검토

**Critical (패치됨):**
- C1 §5.2 / §8.5 — Railway internal DNS 표기 `${PORT}` literal이 혼란 → reference variable 문법 `${{<service>.RAILWAY_PRIVATE_DOMAIN}}:${{<service>.PORT}}` 로 전환. 부수 효과로 §8.5의 닭-달걀 배선 문제도 자동 해소.

**Important (패치됨):**
- I1 §8.5 — 서비스 간 URL 배선 절차가 "env 누락 상태에서 일단 기동 시도" 라서 실제 기동 실패 가능. Railway reference variable 채택으로 순서 종속성 제거.
- I2 §7.1 CI 워크플로우 — Dockerfile 빌드 검증 job 누락. `docker-build-check` matrix job 3 서비스분 추가. Railway 배포 전에 Docker 빌드 실패를 CI에서 차단.
- I3 §5.3 — `/health` 엔드포인트 존재 여부를 "구현 단계로 미룸" → R3 요구사항으로 스펙 수준 결정. 구현 계획 Task 1에서 grep 스캔 후 없는 서비스엔 handler 추가.

**Minor (사용자 판단에 맡김):**
- M1 §4.1 게이트 B grep 패턴이 `sk-ant-|pcsk_|voyage_` 세 가지뿐. JWT/bearer/AWS AKIA 등 더 포괄적 패턴을 추가하거나 `git-secrets` 같은 도구를 쓸 수도 있음. 포트폴리오 범위에선 현재 스펙으로 충분하다고 판단.
- M2 §6.1 — `dev_*` configs를 "선택" 이라 표기했으나 `doppler run --` 로컬 개발을 전제로 설명함. 로컬 개발 방식을 `.env.local` 유지 vs Doppler dev config 전면 이전 중 어느 쪽으로 갈지 명시적 결정 필요.

### 2026-04-19 사용자 리뷰 반영

- **M2 결정:** 로컬 개발은 기존 `.env.local` 방식 유지 (외부 서비스 의존성을 로컬까지 끌고 오지 않기 위함). Doppler는 프로덕션 전용.
  - §6.1: `dev_*` config 3개 제거, 3 prd_* config만 유지
  - §6.4: 로컬 개발 설명 재작성 — Doppler CLI 불필요. `.env.production.example` 이 암묵적 동기화 체크리스트 역할
- **M1 결정:** §4.1 보안 스캔 grep 패턴은 현재 수준 유지 (`sk-ant-|pcsk_|voyage_|SUPABASE_SERVICE_ROLE_KEY=`). 이유: 현재 프로젝트 의존 서비스에 딱 맞춰 false positive 최소화. 새 서비스 추가 시에만 패턴 확장 검토.

### 2026-04-19 스펙 확정

사용자 리뷰 완료. M1, M2 반영 후 스펙 finalize. 구현 계획 작성 단계로 진행.
