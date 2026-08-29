#!/usr/bin/env node
/**
 * **손 인식 연장 받아오기**. 저장소에 안 담고, 필요할 때 이 기계로만 받는다.
 *
 * 왜 안 담나: wasm 12MB + 손 모델 7MB 다. 이 저장소는 공개고, 방금 그림 역사를 덜어냈다.
 * 글꼴 원본(`.fontsrc/`)이 이미 같은 규칙으로 산다. **큰 원본은 받아 오고 산출물만 담는다**.
 *
 * 받는 곳: `apps/karmolab/.handsrc/` (gitignore). 안 받으면 손 조작 단추가 연장이 없다고 적는다.
 *
 * 쓰기: `npm run fetch:hand`
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', '.handsrc');

/* 판을 박는다. 최신을 받으면 어느 날 조용히 딴 것이 온다. */
const TASKS_VERSION = '1.0.1';
const FILES = [
  {
    name: 'vision_bundle.mjs',
    url: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/vision_bundle.mjs`,
  },
  {
    name: 'vision_wasm_internal.js',
    url: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm/vision_wasm_internal.js`,
  },
  {
    name: 'vision_wasm_internal.wasm',
    url: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm/vision_wasm_internal.wasm`,
  },
  {
    name: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  },
];

fs.mkdirSync(OUT, { recursive: true });
let got = 0;
for (const f of FILES) {
  const dest = path.join(OUT, f.name);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1024) {
    console.log(`[hand] 이미 있다: ${f.name} (${(fs.statSync(dest).size / 1024 / 1024).toFixed(1)}MB)`);
    continue;
  }
  console.log(`[hand] 받는다: ${f.name}`);
  const res = await fetch(f.url);
  if (!res.ok) {
    console.error(`[hand] 못 받았다 (${res.status}): ${f.url}`);
    process.exit(1);
  }
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  got += 1;
}
fs.writeFileSync(path.join(OUT, 'VERSION.txt'), `tasks-vision ${TASKS_VERSION}\n`);
const total = FILES.reduce((s, f) => s + fs.statSync(path.join(OUT, f.name)).size, 0);
console.log(`[hand] 새로 받은 것 ${got}개, 다 합쳐 ${(total / 1024 / 1024).toFixed(1)}MB, 자리 ${path.relative(process.cwd(), OUT)}`);
console.log('[hand] 저장소엔 안 담긴다 (.gitignore). 손 조작 단추가 이제 켜진다.');
