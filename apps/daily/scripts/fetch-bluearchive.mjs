/**
 * 블루 아카이브 학생 표 만들기 (TASK-KL-200).
 * 출처 = SchaleDB 공개 자료의 **한국어** 판. 호출 두 번(학생·낱말)이면 끝난다.
 *
 *   node scripts/fetch-bluearchive.mjs
 *
 * 낱말(학교·역할·공격·방어 이름)을 여기에 손으로 적지 않는다 — 손으로 적은 표는 반드시
 * 원본과 어긋난다. 같은 곳에서 온 `localization` 을 그대로 쓴다.
 */
import { saveTable } from './lib-table.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../data/bluearchive.json');
const BASE = 'https://schaledb.com';

const get = async (path) => {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} 를 못 받았다 (${res.status})`);
  return res.json();
};

const [studentsRaw, loc] = await Promise.all([get('/data/kr/students.min.json'), get('/data/kr/localization.min.json')]);
const students = Array.isArray(studentsRaw) ? studentsRaw : Object.values(studentsRaw);

/** 낱말을 못 찾으면 영어 열쇠가 그대로 화면에 뜬다 — 그건 표가 바뀌었다는 신호라 세운다. */
const say = (group, key) => {
  const word = loc[group]?.[key];
  if (!word) throw new Error(`${group} 에 「${key}」 낱말이 없다 — 원본이 바뀌었다`);
  return word;
};

const seen = new Set();
const items = students
  .filter((s) => s.IsReleased?.[0])
  .filter((s) => {
    // 같은 이름이 둘이면 정답이 여럿이 되어 놀이가 성립하지 않는다(빌드도 여기서 막는다).
    if (seen.has(s.Name)) {
      console.log(`   같은 이름이라 뺀다: ${s.Name} (Id ${s.Id})`);
      return false;
    }
    seen.add(s.Name);
    return true;
  })
  .map((s) => ({
    name: s.Name,
    img: `${BASE}/images/student/collection/${s.Id}.webp`,
    school: say('School', s.School),
    role: say('TacticRole', s.TacticRole),
    bullet: say('BulletType', s.BulletType),
    armor: say('ArmorType', s.ArmorType),
    // 총기 종류는 낱말표에 없다(AR·SMG 가 그대로 쓰이는 이름이다).
    weapon: s.WeaponType,
    star: s.StarGrade,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

const topic = {
  id: 'bluearchive',
  title: '블루 아카이브 학생',
  subtitle: '오늘의 학생은 누구?',
  emoji: '🔵',
  source: 'SchaleDB',
  maxGuesses: 8,
  fetchedAt: new Date().toISOString().slice(0, 10),
  fields: [
    { key: 'school', label: '학교', kind: 'category' },
    { key: 'role', label: '역할', kind: 'category' },
    { key: 'bullet', label: '공격', kind: 'category' },
    { key: 'armor', label: '방어', kind: 'category' },
    { key: 'weapon', label: '총기', kind: 'category' },
    { key: 'star', label: '등급', kind: 'number', unit: '성' },
  ],
  items,
};

saveTable(OUT, topic);
