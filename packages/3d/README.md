# @karmo/3d — three.js 한 벌

> 정본. **three.js 를 쓰는 곳은 전부 여기를 거친다.**
> 만든 이유 = 2026-08-21 실측: 이미 세 곳이 three 를 쓰는데 **판이 갈려 있었다** —
> WM Web `r169`(vendored) · `packages/companion` `^0.185` · KarmoLab 간판 방.
> 넷째가 붙기 전에 한 곳으로 모은다.

## 무엇이 여기 있나 (그리고 무엇이 없나)

**있다** — ① 버전 한 개 고정 + 받아 둔 빌드 ② 렌더러 기본값(색공간·톤매핑·화소배율)
③ **GPU 없는 기계 가드** ④ 방 조명 한 벌 ⑤ 가짜 접지 그림자 ⑥ 캔버스 텍스처 헬퍼.

**없다** — 엔진 래핑, 씬 그래프 추상화, 컴포넌트 체계. three 를 가리지 않는다.
`import * as THREE from 'karmo-three/three'` 로 원본을 그대로 쓴다.

## 왜 GPU 가드가 여기 있나 (제일 중요한 한 가지)

2026-08-21, 데스크톱 크롬이 `ANGLE (Microsoft Basic Render Driver)` 로 돌고 있었다 = **CPU 로 그리는 중**.
그 상태에서 그림자 + 번짐(bloom)을 켠 페이지는 **한 프레임이 초 단위로 늘어 창이 통째로 멎었다**
(스크린샷조차 못 찍었다). 이건 「느리다」가 아니라 **안 열린다**이다.

그래서 무거운 것을 켜기 전에 **먼저 묻는다**. 이 판단을 페이지마다 다시 적으면 언젠가 한 곳이 빠지고,
빠진 그 페이지가 누군가에겐 죽은 페이지가 된다. → `gpuTier()` 한 곳.

## 쓰는 법

```js
import * as THREE from 'karmo-three/three';
import { createRenderer, gpuTier, roomLight, contactShadow, canvasTex } from '@karmo/3d';

const { renderer, soft } = createRenderer(canvas);   // soft = GPU 없이 그리는 중
roomLight(scene, { warm: 0xffb673, soft });
scene.add(contactShadow(0.6, 0.4));                  // 물건 밑 그림자 (그림자 맵 없이)
```

## 판 올리기 (버전 바꾸기)

`vendor/` 를 통째로 갈고 `package.json` 의 `threeVersion` 을 같이 고친다. 두 곳이 갈리면
`test/version-test.mjs` 가 빨개진다 — 판이 갈리는 건 이 꾸러미가 막으려는 바로 그 일이다.
