#!/usr/bin/env node
/**
 * **CI 와 같은 리눅스에서 돌린다** (TASK-KAR-216, 2026-08-16).
 *
 * 왜 있나: 화면 검사는 이 PC(윈도우)에서 돌고 **판정은 ubuntu-latest 에서 난다.** 글꼴 모양, 
 * 줄바꿈이 달라 좌표가 밀리는데, 그 차이는 윈도우에서 아무리 돌려도 안 보인다. 그래서
 * 밀어 보고 기다렸다 읽기를 반복했다. 빨강 하나에 배포 왕복 한 번(수십 분)이 들었다.
 *
 * 실제로 그렇게 몇 달 못 잡던 것이 이 길로 **한 판에** 갈렸다:
 *   블루마블 제목. 윈도우 88%, 리눅스 44%. 원인은 글꼴이 아니라 **재는 띠가 5px 였던 것**
 *   (글자 구역 전체로 넓히니 두 쪽 다 88%). 글꼴이 안 와서라고 적혀 있던 설명은 틀렸다.
 *
 * 쓰는 법:
 *   npm run linux -- scripts/smoke-bluemarble-frame.mjs     # 그 검사를 리눅스에서
 *   npm run linux -- scripts/linux-repro.mjs                # 자리 재기(윈도우 값과 대조)
 *
 * 전제: Docker 가 떠 있어야 한다. 안 떠 있으면 **여기서 그 사실을 말하고 멈춘다** . 
 * 돌렸는데 아무 일도 없었다가 제일 나쁘다.
 *
 * 앱의 `node_modules` 는 안 쓴다. 공식 playwright 이미지에 브라우저, 라이브러리가 다 있고,
 * 우리 검사들은 `playwright` 하나만 물기 때문이다(로컬 파일 import 는 그대로 동작).
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(APP, '..', '..');

/** 이미지 판은 우리가 쓰는 playwright 와 **같아야** 한다. 다르면 다른 브라우저를 재게 된다. */
const version = JSON.parse(readFileSync(resolve(APP, 'node_modules/playwright/package.json'), 'utf8')).version;
const IMAGE = `mcr.microsoft.com/playwright:v${version}-jammy`;

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('쓰는 법: npm run linux -- scripts/<검사>.mjs [인자...]');
  process.exit(2);
}

const alive = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8' });
if (alive.status !== 0) {
  console.error('[linux] CANNOT-RUN: Docker 가 안 떠 있다. Docker Desktop 을 켜고 다시.');
  console.error('  (못 돌린 것은 초록이 아니다. 여기서 멈춘다.)');
  process.exit(2);
}

console.log(`[linux] ${IMAGE} 안에서: node ${args.join(' ')}`);
const run = spawnSync(
  'docker',
  ['run', '--rm', '--ipc=host', '-v', `${REPO}:/w`, '-w', '/w/apps/karmolab', IMAGE, 'node', ...args],
  { stdio: 'inherit' },
);
process.exit(run.status ?? 1);
