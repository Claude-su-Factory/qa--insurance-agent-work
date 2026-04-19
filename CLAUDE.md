# CLAUDE.md — 보험 약관 QA Agent

## 프로젝트 개요

Go + TypeScript 마이크로서비스 기반 보험 약관 QA Agent.
AI Backend Engineer 포트폴리오 프로젝트.

```
ingestion-service/   Go + Fiber  — PDF 파싱 → Voyage AI 임베딩 → Qdrant 저장
query-service/       TypeScript + Hono + LangGraph.js — multi-step reasoning Agent
ui-service/          Next.js 14 + Tailwind — 3분할 대시보드 UI
k8s/                 minikube K8s 배포 매니페스트
```

## 빠른 네비게이션

새 세션을 시작할 때 아래 문서를 순서대로 확인하여 프로젝트 컨텍스트를 복원한다.

1. [`docs/STATUS.md`](docs/STATUS.md) — 현재 어디까지 구현됐나 (Phase별 체크리스트, 서비스 상태, 최근 변경)
2. [`docs/ROADMAP.md`](docs/ROADMAP.md) — 다음 작업은 무엇인가 (JD 매핑, Tier 1/2/3 작업)
3. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — 시스템 구성 및 주요 설계 결정 이력 (Why 포함)
4. [`docs/superpowers/specs/`](docs/superpowers/specs/) — 기능별 상세 설계 문서
5. [`docs/superpowers/plans/`](docs/superpowers/plans/) — 기능별 구현 계획

## 타겟 JD

AI Backend Engineer (5년 이상 경력).
주요 요구사항 및 현재 충족도는 `docs/ROADMAP.md`의 "JD 매핑" 섹션 참조.

## 스코프 기준 (MANDATORY)

이 프로젝트는 실서비스 제공이 아닌 **AI Backend Engineer 포트폴리오**다.
모든 기능 스코프 결정은 **"JD 요구사항 매핑 증빙 최소 수준"** 을 기준으로 한다.

- Full 구현 vs 최소 증빙 옵션이 있으면 **항상 후자** 선택
- 스코프 합리화 질문: "이 기능은 JD의 어느 줄을 채우는가?" — 답이 모호하면 드롭
- 이미 JD 매핑된 기능에 추가 디테일 쌓기 금지 (증빙이 됐으면 끝)
- 실사용자 UX 튜닝, 엣지 케이스 커버, 스케일 인프라 드롭 (YAGNI 강화)
- 포트폴리오에 설명하기 애매한 기능은 착수 전에 드롭

## 개발 실행 방식

구현 계획 실행 시 **항상 Subagent-Driven 방식**을 사용한다.

- `superpowers:subagent-driven-development` 스킬을 호출한다
- Task마다 새 서브에이전트를 디스패치하고, 스펙 리뷰 → 코드 퀄리티 리뷰 2단계 검토를 거친다
- Inline Execution은 사용하지 않는다

## 스펙 작성 규칙 (MANDATORY)

스펙(`docs/superpowers/specs/*.md`)을 작성하면 사용자에게 보여주기 전에 **반드시 자체 검토** 사이클을 거친다.

1. 작성 직후 스스로 검토하여 이슈 식별
   - Critical: 명세 그대로 구현 시 동작 안 함 (race, chunk 경계, 잘못된 API)
   - Important: 리소스 누수, 비효율 패턴, 에러 핸들링 누락
   - Minor: 명확성, 비범위 명시, 예시 코드 helper 누락
2. 우선순위별로 사용자에게 보고
3. 스펙 파일을 직접 패치
4. 스펙 하단에 "검토 이력" 섹션 추가/업데이트

별도 요청 없이도 작성→검토→패치→보고가 한 사이클이다.

## 기술 스택 & 설정

| 서비스 | 언어 | 설정 파일 |
|--------|------|-----------|
| ingestion-service | Go 1.23 + Fiber v2 | `config.toml` (비민감), `.env` (API 키) |
| query-service | TypeScript 5 + Hono | `.env` |
| ui-service | Next.js 14 | `.env.local` |

- 벡터 DB: Qdrant v1.9.2 (포트 6333)
- LLM: Claude claude-sonnet-4-6 (Anthropic API)
- 임베딩: Voyage AI voyage-2
- K8s: minikube (로컬), `eval $(minikube docker-env)` 필요
- 트레이싱: Langfuse (cloud)

## 로컬 개발

```bash
# 전체 스택 실행
docker compose up -d

# UI 접근 (K8s)
kubectl port-forward svc/ui-service 3000:3000 &
# → http://localhost:3000
```

## 배포 규칙 (MANDATORY)

Claude가 직접 수행한다. 사용자에게 인프라 작업을 요청하지 않는다.

```bash
# 코드 변경 후 — 전체 빌드 + 재배포
bash scripts/deploy.sh

# 특정 서비스만 빌드 후 배포
bash scripts/deploy.sh ui-service
bash scripts/deploy.sh ingestion-service query-service

# 코드 변경 없음 — 환경만 복구 (minikube 기동, Pod 대기, 포트포워드)
bash scripts/deploy.sh --no-build
```

스크립트가 minikube 상태 체크 → 시크릿 적용 → (옵션) Docker 빌드 → K8s apply → (옵션) rollout → 포트포워드 → 헬스체크를 모두 처리한다. minikube가 중지된 상태여도 자동으로 기동된다. K8s secret yaml은 존재하지 않으며, 시크릿은 오직 `.env` 파일 → `apply-secrets.sh`를 통해서만 생성된다.

## 문서 업데이트 규칙 (MANDATORY)

기능 구현 완료 시 다음 파일을 반드시 업데이트한다. 문서 업데이트 없이는 작업이 완료된 것으로 간주하지 않는다.

1. `docs/STATUS.md` — 해당 항목을 ✅로 이동, "최근 변경 이력" 맨 위에 한 줄 추가, "마지막 업데이트" 날짜 갱신
2. `docs/ROADMAP.md` — 완료된 항목 제거, 필요 시 "현재 추천 다음 작업" 재설정
3. `docs/ARCHITECTURE.md` — 아키텍처에 영향을 준 변경에만 반영 (새 컴포넌트, 설계 결정 등)

## Supabase 스키마 관리 (MANDATORY)

Supabase 테이블 DDL은 `supabase/migrations/NNNN_설명.sql` 번호 순서로 관리한다. 스키마 변경 시 **반드시** 이 디렉토리에 파일을 추가하고 번호를 올려야 한다. 코드에만 반영하고 이 디렉토리를 건너뛰면 Railway 등 새 환경 배포 시 스키마가 깨진다. 상세 규칙은 `supabase/README.md` 참조.

## 스펙 & 계획 위치

```
docs/superpowers/specs/   — 설계 문서 (기능별)
docs/superpowers/plans/   — 구현 계획 (기능별)
supabase/migrations/      — DB 스키마 (번호 순서)
```
