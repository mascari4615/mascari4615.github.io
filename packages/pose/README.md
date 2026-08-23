# KarmoPose (`@karmo/pose`)

손·폰·마우스를 **한 그릇**으로. 화면 쪽은 무엇으로 조작하는지 몰라도 된다.

## 계약

- 판(frame) 모양 하나: `{ t, ok, kind, point, depth, grip, buttons, raw }`
  - `point` = 0~1 화면 자리 · `grip` = 0~1 쥔 정도 · `kind` = `hand|phone|pointer`
- **판정은 한 곳** (`gesture.mjs`) — 소스는 값만 낸다
- 무거운 연장(손 인식)은 **부른 쪽이 건넨다**(`createLandmarker`). 안 켜면 무게 0 · 카메라 0
- 손은 **연속 조작**에만 (끌기·당기기). **고르기는 마우스·자판 몫**

## 쓰기

```js
import { pointerSource, mergeSources, createGestures } from '@karmo/pose';

const pose = mergeSources([pointerSource(canvas)]).start();
const g = createGestures({ size: () => [canvas.clientWidth, canvas.clientHeight] });
g.attach(pose);
g.on('drag', (dx, dy, frame) => orbit.rotate(dx, dy));   // 화소로 온다
```

손을 켤 때만 얹는다 — 나머지는 그대로다:

```js
import { createHandSource } from '@karmo/pose';
const hand = createHandSource({ video, createLandmarker: () => makeMediapipeLandmarker() });
const pose = mergeSources([hand, pointerSource(canvas)]).start();   // 손이 쉬면 마우스가 잇는다
```

## 알아 둘 것 (실측)

- **무게**: MediaPipe 통짜 36MB · 골라도 wasm 12MB → 기본 꺼짐, 버튼으로 켠다
- **고릴라 팔**: 허공에 손 든 자세는 짧은 시간에도 지친다. 24초 영상이 멋있는 건 24초라서다
  → 책상에 팔 얹고 손가락만 · 무동작이면 꺼 준다
- **고르기 금지**: 손으로 고르게 하면 처리량 절반 · 틀림 4배
- **문턱은 둘**(쥘 때 0.7 / 놓을 때 0.45) — 하나면 손 떨림이 그대로 사건이 된다
- **떨림 누르개는 속도에 따라**: 느릴 땐 세게 눌러 조용하게, 빠를 땐 풀어서 따라간다.
  한 계수로 고정하면 「조용하지만 굼뜬」 조작이 된다
- **거울**: 카메라는 좌우가 반대다. 안 뒤집으면 손을 오른쪽으로 옮겼는데 점이 왼쪽으로 간다

## 검사

```bash
npm run test:pose        # apps/karmolab 에서 (순수 셈 11개 · 심는 대조군 포함)
npm run smoke:atlas-3d   # 조작이 정말 이 꾸러미를 거치는지 (진짜 브라우저)
```

## 쓰는 곳

- 지형도 돌려 보기 (`apps/karmolab/tools/atlas-3d/`)
