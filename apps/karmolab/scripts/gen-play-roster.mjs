#!/usr/bin/env node
/**
 * 놀이 명부를 앱 쪽으로 옮겨 적는다 (2026-08-14)
 *
 * 정본은 `apps/play/games.json` 하나다. 그런데 앱은 `/apps/karmolab/data/games.json` 을
 * **받아서**(fetch) 로비를 그린다. 배포되는 자리가 달라서 사본이 필요하다.
 * 그 사본에는 여기서 만들어진다. 여기를 고치지 마라고 적혀 있었는데,
 * **정작 만드는 놈이 없었다.** 그래서 손으로 한 번 복사된 뒤 조용히 갈라졌다:
 * 2026-08-14 실측. 정본 10개(오늘의 한글 타자, 오늘의 초성 추가), 사본 8개.
 * 그 사이 로비, 검사, 공유 카드가 서로 다른 수를 보고 있었다.
 *
 * 이제 진짜로 만든다. 갈라지면 `audit:generated` 가 잡는다(파생물 표에 올려 두었다).
 *
 * 사용: node scripts/gen-play-roster.mjs   (npm run gen:play-roster)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const canonical = path.join(root, '../play/games.json');
const copy = path.join(root, 'data/games.json');

if (!fs.existsSync(canonical)) {
  console.log('[gen-play-roster] CANNOT-RUN. 놀이 명부(apps/play/games.json)가 없다');
  process.exit(2);
}

const src = JSON.parse(fs.readFileSync(canonical, 'utf8'));
const out = {
  $comment: 'apps/play/games.json 에서 만들어진다. 여기를 고치지 마라 (npm run gen:play-roster).',
  games: src.games || []
};
const text = JSON.stringify(out, null, 2) + String.fromCharCode(10);
const before = fs.existsSync(copy) ? fs.readFileSync(copy, 'utf8') : '';
fs.writeFileSync(copy, text, 'utf8');
console.log(
  `[gen-play-roster] 놀이 ${out.games.length}개 → data/games.json` + (before === text ? ' (그대로)' : ' (바뀌었다)')
);
