# karmoddrine-map

umbrella 전체 토폴로지 한 장 시각화 — D3 force-directed graph (Tauri 데스크톱 전용).

정본 TASK: `karmoddrine/memo/tasks/TASK-KAR-091-...md`.

## Phase

- **Phase 1 (MVP, 현재)** — 정적 노드/엣지 schema 손박힘. 드래그/줌/hover/클릭 패널.
- **Phase 2** — live overlay: 활성 세션·yawnbot prod 가동·최근 commit. Rust `get_karmoddrine_state` enrich.
- **Phase 3** — drift 게이트: schema vs 실 코드/메모 cross-check.
- **Phase 4** — narrative 모드: 흐름 시나리오 (3 레포 연결·yawnbot 배포 등) 강조 토글.

## 데이터 schema

`karmoddrine-map.ts` 안 `NODES` / `EDGES` 정적 const. 추가/수정:

```ts
{ id: '<short>', label: '<표시>', kind: 'umbrella|repo|app|service|infra|doc|rule|agent',
  cluster: 'umbrella|wm|kl|yb|kar|life|infra',
  desc?: '<클릭 패널 1~3줄>', link?: '<경로>', badge?: '<우상단 태그>' }

{ source: '<id>', target: '<id>',
  kind: 'contains|deploys|depends|mcp|webhook|data|rule',
  label?: '<엣지 캡션>' }
```

## 외부 lib

- `apps/karmolab/js/vendor/d3.min.js` (D3 v7, 동일 출처) — `widgets/docs/docs.ts` mermaid 로드 패턴 정합. CDN 금지 (Tauri Tracking Prevention).
