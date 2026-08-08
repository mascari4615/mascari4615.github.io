/**
 * 서버가 죽어도 읽기는 사는 규칙 (TASK-KL-183 F) — **무엇을 받아 두나**를 잠근다.
 *
 * 여기가 틀리면 사람마다 다른 답(내 계정·내 알림)이 캐시에 남아 **다음 사람이 그것을 본다**.
 * 화면에는 아무 표시도 안 난다 — 그래서 규칙을 글로 두지 않고 시험으로 잠근다.
 */
import { readFileSync } from 'node:fs';

const src = readFileSync('src/sw.ts', 'utf8');
const m = src.match(/const shared =\s*([\s\S]*?)\.test\(/);
if (!m) { console.error('규칙을 못 찾았다 — sw.ts 의 shared 판정이 바뀌었나?'); process.exit(1); }
// 소스에서 정규식을 그대로 꺼내 실제로 돌린다 (베껴 적으면 언젠가 갈라진다)
const re = new RegExp(eval(m[1].trim().replace(/^\/\^/, '/^')).source);

const shouldCache = [
  '/kl/tools/stats', '/kl/recent', '/kl/boards', '/kl/recap', '/kl/rooms',
  '/kl/missions', '/kl/suggest', '/kl/flows', '/kl/stats/leaders', '/kl/stats/achievements',
  '/kl/play/board', '/kl/play/season', '/kl/u/karmo', '/kl/u/karmo/works', '/kl/u/karmo/follows',
];
const mustNot = [
  '/kl/me', '/kl/me/activity', '/kl/me/works', '/kl/me/missions', '/kl/me/sessions',
  '/kl/me/security', '/kl/notifications', '/kl/me/passkeys', '/kl/me/visibility', '/kl/me/feed',
];
let bad = 0;
for (const p of shouldCache) if (!re.test(p)) { console.log('✗ 받아 둬야 하는데 안 담김:', p); bad++; }
for (const p of mustNot) if (re.test(p)) { console.log('✗ 사람마다 다른 답인데 담김:', p); bad++; }
console.log(bad ? `\n실패 ${bad}건` : `공유 ${shouldCache.length}개 담김 · 개인 ${mustNot.length}개 안 담김`);
process.exit(bad ? 1 : 0);
