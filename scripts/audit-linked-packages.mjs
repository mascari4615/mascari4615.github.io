/**
 * 안에서 링크로 쓰는 꾸러미가 **디스크에서 사라졌는지** 본다 (TASK-KL-191).
 *
 * 왜 이게 필요한가 — 실측 2026-08-08:
 *   `apps/discord-bots/node_modules/karmolab-ai` 는 심볼릭 링크가 아니라 **Junction** 이고,
 *   그 끝은 이 저장소 안의 `packages/karmolab-ai` 다(`file:` 의존성이라 npm 이 그렇게 건다).
 *   윈도에서 `npm ci` 는 `node_modules` 를 통째로 지우는데, **Junction 을 따라 들어가** 링크
 *   너머의 진짜 소스까지 지운다. 그래서 아무도 안 지웠는데 `packages/karmolab-ai` 와
 *   `packages/badapple` 이 워킹트리에서 사라진다 — 하루에 세 번 그랬다.
 *
 * 사라진 뒤의 증상이 고약하다: 커밋에는 멀쩡히 있으니 「소스가 지워졌다」고 아무도 안 본다.
 * 대신 `Cannot find module 'karmolab-ai/node'` 가 스무 줄 뜨고, 그건 **의존성 설치 문제**처럼
 * 생겼다. 그래서 사람이 `npm ci` 를 한 번 더 돌리고 — 남은 것까지 지운다.
 *
 * 이 검사는 그 오진을 끊는다: 없어진 것이 무엇이고 왜 없어졌는지, 되살리는 한 줄까지 말한다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = path.join(ROOT, 'packages');

if (!fs.existsSync(PACKAGES)) {
  console.error('❌ packages/ 자체가 없다 — 저장소가 통째로 얕게 받아졌거나 지워졌다');
  process.exit(1);
}

const missing = [];
const names = fs.readdirSync(PACKAGES, { withFileTypes: true }).filter((e) => e.isDirectory());

/* 0건 통과 금지 — 꾸러미를 하나도 못 찾았다는 것은 이 검사가 볼 자리를 잃었다는 뜻이다. */
if (names.length === 0) {
  console.error('❌ packages/ 아래에 꾸러미가 하나도 없다 — 전부 사라졌거나 검사가 낡았다');
  process.exit(1);
}

for (const entry of names) {
  const manifest = path.join(PACKAGES, entry.name, 'package.json');
  if (!fs.existsSync(manifest)) missing.push(entry.name);
}

if (missing.length) {
  console.error(`❌ 링크로 쓰는 꾸러미의 소스가 디스크에서 사라졌다: ${missing.join(' · ')}`);
  console.error('   원인은 대개 npm ci 다 — node_modules 안의 Junction 을 따라 들어가 원본을 지운다.');
  console.error('   되살리기: git checkout -- packages/');
  console.error('   그다음: 각 꾸러미에서 npm ci && npm run build (dist 도 같이 날아갔다)');
  process.exit(1);
}

console.log(`✅ 링크 꾸러미 ${names.length}개 전부 디스크에 있다 (${names.map((e) => e.name).join(' · ')})`);
