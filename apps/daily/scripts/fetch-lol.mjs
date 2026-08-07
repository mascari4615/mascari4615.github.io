/**
 * 롤 챔피언 표 만들기 (TASK-KAR-202).
 * 출처 = Riot Data Dragon (공개 정적 파일, 키 불요). 호출 2번이면 끝난다.
 *
 *   node scripts/fetch-lol.mjs
 */
import { saveTable } from './lib-table.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../data/lol.json');

const ROLE_KO = {
  Fighter: '전사',
  Tank: '탱커',
  Mage: '마법사',
  Assassin: '암살자',
  Marksman: '원거리 딜러',
  Support: '서포터',
};

const versions = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json();
const version = versions[0];
const raw = await (
  await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/ko_KR/champion.json`)
).json();

// Data Dragon 은 이벤트 스킨판을 **같은 이름의 별도 항목**으로 끼워 넣는다 (Jade_Ahri = 키 60103).
// 그대로 두면 「아리」가 표에 두 번 들어가 자동완성도 정답 판정도 어긋난다.
// 규칙: 이름이 같으면 번호가 가장 작은 것 하나만 남긴다 (원본이 언제나 제일 작다).
const canonical = new Map();
for (const c of Object.values(raw.data)) {
  const prev = canonical.get(c.name);
  if (!prev || Number(c.key) < Number(prev.key)) canonical.set(c.name, c);
}

const items = [...canonical.values()]
  .map((c) => ({
    name: c.name,
    img: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${c.image.full}`,
    roles: (c.tags ?? []).map((t) => ROLE_KO[t] ?? t),
    // 자원 표기가 비어 있는 챔피언이 있다 (자원을 안 쓰는 애들). 빈칸으로 두면 비교가 이상해진다.
    resource: (c.partype ?? '').trim() || '없음',
    range: Number(c.stats?.attackrange) >= 300 ? '원거리' : '근거리',
    // 라이엇이 안 채워 주는 값(info.attack/defense/difficulty)은 안 쓴다 — 신규 챔피언 여섯이
    // 0 으로 비어 있어서 「난이도 0」 같은 거짓 힌트가 떴다. stats 는 전원 채워져 있다.
    hp: Math.round(Number(c.stats?.hp ?? 0)),
    armor: Math.round(Number(c.stats?.armor ?? 0)),
    damage: Math.round(Number(c.stats?.attackdamage ?? 0)),
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

const topic = {
  id: 'lol',
  title: '롤 챔피언',
  subtitle: '오늘의 챔피언은 누구?',
  emoji: '⚔️',
  source: `Riot Data Dragon ${version}`,
  maxGuesses: 8,
  // 표가 언제 만들어졌는지 — 빌드가 이걸 보고 「너무 오래됐다」를 말한다.
  fetchedAt: new Date().toISOString().slice(0, 10),
  fields: [
    { key: 'roles', label: '역할', kind: 'set' },
    { key: 'resource', label: '자원', kind: 'category' },
    { key: 'range', label: '사거리', kind: 'category' },
    { key: 'hp', label: '체력', kind: 'number', near: 25 },
    { key: 'armor', label: '방어', kind: 'number', near: 3 },
    { key: 'damage', label: '공격', kind: 'number', near: 3 },
  ],
  items,
};

saveTable(OUT, topic);
console.log(`출처 Data Dragon ${version}`);
