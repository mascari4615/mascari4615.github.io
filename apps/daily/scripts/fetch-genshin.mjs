/**
 * 원신 캐릭터 표 만들기 (TASK-KAR-202).
 * 출처 = yatta.moe(=ambr) 공개 API 의 **한국어** 자료. 호출 한 번이면 끝난다.
 *
 *   node scripts/fetch-genshin.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../data/genshin.json');

const ELEMENT = { Ice: '얼음', Wind: '바람', Electric: '번개', Water: '물', Fire: '불', Rock: '바위', Grass: '풀' };
const WEAPON = {
  WEAPON_SWORD_ONE_HAND: '한손검',
  WEAPON_CLAYMORE: '양손검',
  WEAPON_POLE: '창',
  WEAPON_BOW: '활',
  WEAPON_CATALYST: '법구',
};
const REGION = {
  MONDSTADT: '몬드', LIYUE: '리월', INAZUMA: '이나즈마', SUMERU: '수메르',
  FONTAINE: '폰타인', NATLAN: '나타', SNEZHNAYA: '스네즈나야', FATUI: '스네즈나야',
};
const BODY = { GIRL: '소녀', LADY: '여성', MALE: '남성', BOY: '소년', LOLI: '아이' };

const raw = await (await fetch('https://gi.yatta.moe/api/v2/kr/avatar')).json();

// 여행자는 한 이름에 원소 6 × 성별 2 = 12항목이다. 이름이 같은데 답이 여럿이면 게임이 성립하지
// 않는다 (이름으로 맞히는 놀이다). 그래서 이름이 유일하지 않은 항목은 통째로 뺀다.
const nameCount = {};
for (const c of Object.values(raw.data.items)) nameCount[c.name] = (nameCount[c.name] ?? 0) + 1;

const items = Object.values(raw.data.items)
  // 원소가 없는 항목은 속성 비교가 성립하지 않아 뺀다.
  .filter((c) => ELEMENT[c.element] && WEAPON[c.weaponType] && c.icon && c.release)
  .filter((c) => nameCount[c.name] === 1)
  .map((c) => ({
    name: c.name,
    img: `https://gi.yatta.moe/assets/UI/${c.icon}.png`,
    element: ELEMENT[c.element],
    weapon: WEAPON[c.weaponType],
    // 표에 없는 소속(파투스 분파 등)은 「기타」로 모은다 — 힌트가 뜻을 잃지 않게.
    region: REGION[c.region] ?? '기타',
    rank: c.rank,
    body: BODY[c.bodyType] ?? '기타',
    year: new Date(c.release * 1000).getUTCFullYear(),
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

const topic = {
  id: 'genshin',
  title: '원신 캐릭터',
  subtitle: '오늘의 캐릭터는 누구?',
  emoji: '🌠',
  source: 'yatta.moe (ambr)',
  maxGuesses: 8,
  fields: [
    { key: 'element', label: '원소', kind: 'category' },
    { key: 'weapon', label: '무기', kind: 'category' },
    { key: 'region', label: '소속', kind: 'category' },
    { key: 'rank', label: '등급', kind: 'number' },
    { key: 'body', label: '체형', kind: 'category' },
    { key: 'year', label: '출시', kind: 'number', near: 1 },
  ],
  items,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(topic)}\n`);
console.log(`원신 캐릭터 ${items.length}명 → data/genshin.json`);
