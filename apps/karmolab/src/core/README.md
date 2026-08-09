# `src/core/` — 도구의 알맹이 (TASK-KL / 흡수계획 S1)

> 위젯은 **껍데기**, 여기가 **알맹이**다.
> 설계 정본: `memo/projects/karmolab-absorption/06-execution-layer-design.md`

## 왜 나눴나

도구 하나가 파일 하나였다. 화면 그리는 코드와 실제 계산이 한 덩어리라, 그 계산을 **화면 밖에서**
쓸 방법이 없었다 — 주소로 부르는 것도, AI 에이전트가 부르는 것도, 시험하는 것도 전부 막혀 있었다.

그래서 계산만 떼어 여기 둔다. 떼어 놓으면 같은 알맹이를 **네 군데**서 쓴다:

```
core/<id>.ts (순수 계산 + spec)
   ├─ widgets/tools/<id>.ts   화면
   ├─ 주소 파라미터 (?op=…)    링크 하나로 결과 재현
   ├─ karmolab-mcp            AI 에이전트가 호출
   └─ scripts/test-core.mjs   시험 (브라우저 없이)
```

## 철칙 — 여기서 절대 안 쓰는 것

`document` · `window` · `Toolbox` · `Mdd` · `localStorage` · `fetch` · `alert`

하나라도 쓰면 Node 에서 안 돌고, 그 순간 위 네 갈래 중 셋이 막힌다.
`scripts/test-core.mjs` 가 이걸 실제로 검사한다 (주석 아님).

## 파일 모양

```ts
export const spec = {
  id: 'base64',
  ops: {
    encode: { in: { text: 'string', urlSafe: 'boolean?' }, out: 'string' },
    decode: { in: { code: 'string' }, out: 'string' }
  }
} as const;

export function encode(text: string, urlSafe = false): string { … }
export function decode(code: string): string { … }
```

- **`spec` 이 단일 진실.** 주소 파라미터 이름·MCP 도구 설명·문서가 전부 여기서 나온다.
  손으로 따로 적으면 어긋난다 — 적지 마라.
- **에러는 던진다(throw).** 사용자에게 뭐라고 말할지는 위젯이 정한다. 알맹이는 한국어 문구를 모른다.
- 새 의존성 넣지 마라. 넣는 순간 MCP 쪽 무게가 된다.
