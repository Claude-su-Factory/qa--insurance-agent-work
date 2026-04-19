# Insurance QA Agent

Go + TypeScript 마이크로서비스 기반 보험 약관 QA Agent.

```
ingestion-service/   Go + Fiber  — PDF 파싱 → Voyage AI 임베딩 → Qdrant 저장
query-service/       TypeScript + Hono + LangGraph.js — multi-step reasoning Agent
ui-service/          Next.js 14 + Tailwind — 3분할 대시보드 UI
k8s/                 minikube K8s 배포 매니페스트
```

## 배포

모든 배포는 `scripts/deploy.sh` 하나로 처리한다. minikube가 중지돼 있으면 자동으로 기동한다.

```bash
# 코드 변경 후 — 전체 빌드 + 재배포
bash scripts/deploy.sh

# 특정 서비스만 빌드 후 배포
bash scripts/deploy.sh ui-service
bash scripts/deploy.sh ingestion-service query-service

# 코드 변경 없음 — 환경만 복구 (minikube 기동, Pod 대기, 포트포워드)
bash scripts/deploy.sh --no-build
```

스크립트 수행 단계:

1. minikube 상태 체크 (중지 시 자동 `minikube start`)
2. `.env` → K8s secret 적용 (`apply-secrets.sh`)
3. minikube Docker env 설정
4. Docker 이미지 빌드 (`--no-build` 시 생략)
5. K8s 매니페스트 apply
6. Deployment rollout (`--no-build` 시 restart 없이 status 대기만)
7. 포트포워드 (`3000`, `8081`)
8. 헬스체크 (`http://localhost:3000`, `http://localhost:8081/health`)

## 접근

- UI: http://localhost:3000
- Ingestion API: http://localhost:8081
- Qdrant: 클러스터 내부에서만 접근

## 시크릿

시크릿은 오직 `.env` 파일 → `apply-secrets.sh`를 통해서만 생성된다. K8s secret yaml은 저장소에 존재하지 않는다.
