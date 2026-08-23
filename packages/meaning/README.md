# KarmoMeaning (`@karmo/meaning`)

글의 **뜻을 숫자로** 재고, 뜻으로 **가까운 것**을 찾는다. 이 기계에서 돈다 — 열쇠·요금·하루치 없음.

## 계약

- 자료 모양을 모른다: `{ id, hash, text }` 만 받고 **번호로** 답한다 (글이든 상품이든 같다)
- **곳간(cache)은 부른 쪽이 소유**한다 — 이 꾸러미는 읽고 채우기만, 파일은 안 만든다
- 곳간 열쇠에 **모델 이름**이 들어간다 — 모델을 갈면 옛 벡터를 안 집는다
- **재는 연장은 부른 쪽이 건넨다** (`loadRunner`) — 벤더를 이름에도 의존에도 안 넣는다.
  `file:` 링크(윈도 Junction) 너머에서는 부른 쪽 `node_modules` 가 안 보이기도 한다

## 쓰기

```js
import { embedAll, removeSharedBias, nearest } from '@karmo/meaning';

const { vectors, tier } = await embedAll(items, {
  cache,                                              // 부른 쪽이 읽고 저장한다
  loadRunner: () => import('@huggingface/transformers'),
  onFlush: (c) => fs.writeFileSync(CACHE, JSON.stringify(c)),
});
const { vectors: flat } = removeSharedBias(vectors);  // 길이 쏠림 빼기
const { idx, sim } = nearest(flat, 8);                // 뜻으로 가까운 여덟
```

## 알아 둘 것 (실측)

- **모델은 다국어여야 한다.** 영어 전용은 한국어에서 뜻을 못 갈랐다 —
  완전 무관 0.594 > 같은 뜻 0.592 (글자를 보고 있었다)
- **E5 계열은 앞말(`passage:`) 필수** — 안 붙이면 순서가 뒤집힌다.
  e5-small 로 갈아타려다 되돌린 판: 닮은 글 15.1→63.7배(좋아짐)이나 정직도 0.886→0.735(나빠짐),
  사전 문턱 「자 넷 중 셋」을 못 넘었다
- **쏠림 빼기는 한 번으로 0 이 안 된다** — 뺀 뒤 길이를 1 로 다시 맞추면서 새 평균이 생긴다
  (0.7181 → 0.0708 → 0.0086). 한 번만 뺀다
- 벡터는 소수점 여섯 자리로 자른다 — 곳간이 세 배 작아지고 그 자리에서 뜻은 안 달라진다

## 검사

```bash
npm run test:meaning   # apps/karmolab 에서 (또는 node packages/meaning/test/parity.mjs)
```

빠른 셈을 **느리고 뻔한 셈**과 맞대 본다(옮기면서 셈이 바뀌지 않았나). 심는 대조군 포함 —
일부러 어긋낸 답을 못 잡으면 그 시험 자체가 빨개진다.

## 쓰는 곳

- 지형도 굽기 (`apps/karmolab/scripts/build-memo-atlas.mjs`)
