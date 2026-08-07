/**
 * 결산 카드·대시보드를 실제 브라우저로 찍는다 (TASK-YB-042).
 *
 * 왜 있나: HTML 을 고치고 "됐겠지" 로 넘기면 화면이 깨진 걸 아무도 못 본다.
 * 단위 테스트는 문자열만 본다 — 배치·잘림·빈칸은 눈으로만 잡힌다.
 * 실제로 이 루프가 잡아낸 것: 30일 표가 페이지를 삼킴, 비중 막대가 점이 됨,
 * 타일 설명이 두 줄로 접힘, 스크롤 그림자가 마지막 열을 덮음.
 *
 *   npm run shoot:wrapped            # dist 를 그대로 띄워 4장 찍는다
 *   npm run shoot:wrapped -- <폴더>  # 저장 위치 지정
 *
 * 선행: npm run build (dist 필요). Edge 가 없으면 그 자리에서 알려 준다.
 */
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

// ★ 반드시 비동기 — execFileSync 는 이벤트 루프를 막아 같은 프로세스의 express 가
//   응답을 못 하고, 브라우저는 영원히 기다리다 죽는다(브라우저 탓으로 오해하기 쉽다).
const run = promisify(execFile);
const require = createRequire(import.meta.url);

const PKG_ROOT = resolve(import.meta.dirname, '..');
const DIST = join(PKG_ROOT, 'dist', 'src');
const OUT = process.argv[2] ? resolve(process.argv[2]) : join(tmpdir(), 'yawnbot-wrapped-shots');

const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const browser = EDGE_CANDIDATES.find((p) => existsSync(p));
if (!browser) {
  console.error('[shoot] Edge/Chrome 을 못 찾았다 — 스크린샷 생략. 페이지 자체는 npm test 가 본다.');
  process.exit(0);
}
if (!existsSync(join(DIST, 'bot', 'wrapped-web.js'))) {
  console.error('[shoot] dist 가 없다 — 먼저 npm run build.');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const express = require('express');
const stats = await import(pathToFileURL(join(DIST, 'services', 'server-stats.js')).href);
const web = await import(pathToFileURL(join(DIST, 'bot', 'wrapped-web.js')).href);

// ── 그럴듯한 30일치 활동 (실제 state 파일은 건드리지 않는다) ──
const recorder = stats.getServerStatsRecorder();
recorder.state = stats.emptyState();
const GUILD = 'g-shot';
const PEOPLE = [
  { id: 'u1', name: '카르모', weight: 1.0, night: 0.1 },
  { id: 'u2', name: '링', weight: 0.62, night: 0.05 },
  { id: 'u3', name: '알리사', weight: 0.4, night: 0.02 },
  { id: 'u4', name: '욘', weight: 0.3, night: 0.75 },
  { id: 'u5', name: '아리아', weight: 0.16, night: 0.1 },
];
const CHANNELS = ['잡담', '작업로그', '음악', '질문'];
const EMOJI = ['🎉', '😂', '👍', '😴', '🔥', '🥹'];

let seed = 20260806;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const now = new Date();
for (let back = 29; back >= 0; back -= 1) {
  const day = new Date(now.getTime() - back * 86400000);
  const weekday = new Date(day.getTime() + 9 * 3600000).getUTCDay();
  const busy = (weekday === 0 || weekday === 6 ? 1.5 : 1) * (1 + (29 - back) * 0.02);
  for (const person of PEOPLE) {
    if (person.id === 'u5' && back > 10) continue; // 늦게 합류 = 「처음 온 사람」 확인용
    const count = Math.round(person.weight * busy * (6 + rand() * 8));
    for (let i = 0; i < count; i += 1) {
      const kstHour = rand() < person.night ? Math.floor(rand() * 6) : 9 + Math.floor(rand() * 14);
      const at = new Date(Date.UTC(
        day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), kstHour - 9, Math.floor(rand() * 60),
      ));
      const emoji = rand() < 0.35 ? ` ${EMOJI[Math.floor(rand() * EMOJI.length)]}` : '';
      recorder.onMessage({
        guildId: GUILD, userId: person.id, userName: person.name,
        channelId: CHANNELS[Math.floor(rand() * CHANNELS.length)],
        content: '오늘은 이런 걸 했다'.slice(0, 4 + Math.floor(rand() * 14)) + emoji,
        at,
      });
      if (rand() < 0.25) {
        const other = PEOPLE[Math.floor(rand() * PEOPLE.length)];
        if (other.id !== person.id) {
          recorder.onReaction({
            guildId: GUILD, giverId: other.id, giverName: other.name,
            authorId: person.id, authorName: person.name,
            emojiName: EMOJI[Math.floor(rand() * EMOJI.length)], at,
          });
        }
      }
    }
  }
}

const key = stats.getOrCreateShareKey(recorder.load(), GUILD);

const app = express();
web.mountWrappedWeb(app, null);
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const port = server.address().port;

const SHOTS = [
  { name: 'card', path: `/w/${key}`, size: '520,1500' },
  { name: 'board-7', path: `/w/${key}/board?days=7`, size: '1100,1500' },
  { name: 'board-30', path: `/w/${key}/board?days=30`, size: '1100,1500' },
  { name: 'board-mobile', path: `/w/${key}/board?days=30`, size: '420,2000' },
];

for (const shot of SHOTS) {
  const file = join(OUT, `${shot.name}.png`);
  await run(browser, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    // 전용 프로필이 없으면 이미 떠 있는 브라우저에 붙어 스크린샷 없이 매달린다.
    `--user-data-dir=${join(OUT, '.browser-profile')}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-sync', '--virtual-time-budget=4000',
    `--screenshot=${file}`, `--window-size=${shot.size}`,
    `http://127.0.0.1:${port}${shot.path}`,
  ], { timeout: 90000 }).catch((e) => console.error(`  (browser: ${e.code ?? e.message})`));
  console.log(existsSync(file) ? `OK   ${shot.name}.png` : `FAIL ${shot.name}.png`);
}

const a = recorder.analytics(GUILD, 30);
console.log(`\n데이터: 메시지 ${a.current.messages} · 참여 ${a.current.activeUsers}명 · 반응 ${a.current.reactions}`);
console.log(`저장: ${OUT}`);
server.close();
