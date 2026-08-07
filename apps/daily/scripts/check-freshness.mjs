/**
 * 표가 낡았는지 원본에 물어본다 (TASK-KAR-202).
 *
 *   node scripts/check-freshness.mjs
 *
 * 날짜만 보는 빌드 검사와 달리 여기는 **실제 항목 수**를 대조한다.
 * 새 챔피언이 나왔는데 우리 표엔 없으면 그 이름은 자동완성에도 정답에도 없다 —
 * 사람은 「낡은 사이트」로 읽고 떠나는데 우리는 아무 신호도 못 받는다.
 *
 * 배포에서는 안 돈다. 바깥 서버가 잠깐 말썽인 것으로 배포를 세울 이유가 없다.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 주제별로 「원본에는 몇 개인가」를 세는 법. 표를 늘리면 여기 한 줄 늘린다. */
const COUNTERS = {
  async lol() {
    const v = (await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json())[0];
    const raw = await (await fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/ko_KR/champion.json`)).json();
    // 이벤트 스킨판이 같은 이름으로 또 들어오므로 이름 기준으로 센다 (표 만들 때와 같은 규칙).
    return { count: new Set(Object.values(raw.data).map((c) => c.name)).size, note: v };
  },
  async genshin() {
    // 표 만들 때와 **같은 규칙**을 쓴다 — 따로 세면 갈려서 거짓 경보가 난다.
    const { playableGenshin, fetchGenshinList } = await import('./rules-genshin.mjs');
    return { count: playableGenshin(await fetchGenshinList()).length, note: '여행자 계열 제외' };
  },
  async pokemon() {
    const raw = await (await fetch('https://pokeapi.co/api/v2/pokemon-species?limit=1')).json();
    return { count: raw.count, note: '전 세대' };
  },
};

let stale = 0;
for (const file of readdirSync(join(app, 'data')).filter((f) => f.endsWith('.json'))) {
  const topic = JSON.parse(readFileSync(join(app, 'data', file), 'utf8'));
  const counter = COUNTERS[topic.id];
  if (!counter) {
    console.log(`?  ${topic.id.padEnd(9)} 세는 법이 없다 — check-freshness.mjs 에 한 줄 넣어라`);
    continue;
  }
  try {
    const { count, note } = await counter();
    const mine = topic.items.length;
    const same = count === mine;
    if (!same) stale += 1;
    console.log(
      `${same ? 'OK' : '⚠ '} ${topic.id.padEnd(9)} 우리 ${String(mine).padStart(4)} · 원본 ${String(count).padStart(4)}` +
        ` · 만든 날 ${topic.fetchedAt ?? '?'}${note ? ` (${note})` : ''}`,
    );
  } catch (err) {
    console.log(`?  ${topic.id.padEnd(9)} 원본에 못 물어봤다: ${err.message}`);
  }
}

if (stale) {
  console.log(`\n${stale}개가 원본과 다르다 — 한국 시각 자정 직후에 fetch 를 돌려라.`);
  console.log('(낮에 갈아끼우면 그날 이미 두던 사람의 정답이 바뀐다 — README 참고)');
}
process.exit(0); // 바깥 서버 사정으로 빨간불을 켜지 않는다. 이건 눈으로 보는 도구다.
