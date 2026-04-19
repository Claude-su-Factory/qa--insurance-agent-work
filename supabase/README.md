# Supabase 스키마 관리

이 디렉토리는 프로젝트가 사용하는 Supabase 테이블 DDL을 단일 소스로 보관한다. Railway 등 신규 환경에 배포할 때 순서대로 실행하면 동일한 스키마가 구성된다.

## 구조

```
supabase/
├── README.md                  (본 문서)
└── migrations/
    ├── 0001_*.sql             기존 테이블 (TODO: Supabase Studio에서 export해 백필)
    ├── ...
    └── NNNN_*.sql             최신 마이그레이션
```

## 네이밍 규칙

`NNNN_설명.sql` — 4자리 번호 + 스네이크케이스 설명.
번호는 적용 순서이며 겹치면 안 된다.

## 적용 방법

### 새 환경 부트스트랩

1. Supabase 프로젝트 생성
2. Supabase Studio → SQL Editor
3. `supabase/migrations/` 파일을 번호 순서대로 붙여넣어 실행
4. 완료

### 기존 환경에 새 마이그레이션 추가

1. `NNNN_설명.sql` 파일 생성 (번호는 최신+1)
2. Supabase Studio → SQL Editor에 붙여넣어 실행
3. 파일 커밋

## 현재 누락된 백필 목록

기존 테이블 DDL이 이 디렉토리에 없음. 추후 작업으로 백필 필요:

- `documents` (Phase 1)
- `chat_messages` (Phase 3)
- `citations` (Phase 3)

Supabase Studio → Table Editor → 각 테이블 → Definition에서 DDL export 가능.

## 현재 마이그레이션 목록

| 번호 | 파일 | 내용 |
|---|---|---|
| 0004 | `0004_eval_tables.sql` | Evaluation 파이프라인 4개 테이블 |

## 규칙 (CLAUDE.md 참조)

Supabase 스키마 변경 시 **반드시** `supabase/migrations/`에 번호 순서 파일을 추가해야 한다. 코드에만 반영하고 이 디렉토리를 건너뛰면 Railway 배포가 깨진다.
