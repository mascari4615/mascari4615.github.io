# karmoddrine-pulse

> 자율 팀 상황판 single pane. 정본 TASK = `memo/tasks/TASK-KAR-119-karmoddrine-pulse-dashboard.md`. 발의 = `memo/.claude/session-bus.md` 2026-05-23 slot-C entry.

## 의도 (사용자 발화 cite)

> 2026-05-23 slot-C `/goal`: "우리 에이전트는 완전 자율화되게 만들어서 팀 빠르게 자가발전 하고, 자기들끼리 뭘 만들어볼까 아이디어 내서 새로운 프로젝트들도 만들고…".

자율 팀이 *자기들끼리* 발의한 첫 신프로젝트. 운영 중 substrate (cadence cron / agent-state / session-bus / proposals / evolution-events / git-hygiene / heavy-op-guard / rule-violations / TASK 큐 / PR 큐) 의 single pane.

## 현 상태

🚧 **skeleton 단계 (2026-05-23 slot-C 자율 진입)**. UI 디자인은 사용자 영역 (process.md 비주얼 톤 룰) — 진입 전 ASCII 컨펌 필요.

## 구조 (예정)

```
karmoddrine-pulse/
├── README.md        # 본 파일
├── index.html       # 진입 페이지
├── script.js        # laptop-ops fetch + 카드 렌더 (10s 폴링)
├── style.css        # ASCII-only proto, 색은 사용자 컨펌 후
└── data-sources.md  # source 매핑 표 (session-bus / agent-state / ledger 등)
```

## 데이터 source (재사용, 평행 정의 0)

- `laptop.mascari4615.com/{status,tail,service}` — 노트북 ops 데이터
- `memo/.claude/active-sessions.md` — 슬롯 보드
- `memo/.claude/session-bus.md` — 슬롯 대화
- `memo/.claude/agent-state.json` — 에이전트 런타임
- `memo/.claude/agents/README.md` — 코어 로스터
- `memo/.claude/proposals.jsonl` + `evolution-events.jsonl` — ledger
- `memo/scripts/repo-metrics.mjs --json` — 3 레포 hunk drift
- `memo/scripts/agent-tools-allowlist-check.mjs --json` — 코어 권한 검사

## 인터럽트 인터페이스 (예정)

- `!kill <agent-id>` 한 클릭 (laptop-ops `/exec` 경유)
- heavy-op reap 한 클릭

## 호스팅 (결정 보류)

- 옵션 A: 데스크톱 KarmoLab Server Monitor 카드 등록 (`apps/karmolab/data/servermonitor-config.json`)
- 옵션 B: 노트북 NSSM 서비스 (yawnbot-prod 옆)
- 옵션 C: 정적 페이지 + 데스크톱 browser 로컬

사용자 컨펌 후 진입.

## Cross-links (session-bus)

- [session-bus] 2026-05-23 10:10 KST slot-C — 💡 발의 후보 #2
- [session-bus] 2026-05-23 10:40 KST slot-C — 🤝 자율 채택 사이클 5
- [session-bus] 2026-05-23 10:50 KST slot-C — ✅ skeleton 진입
