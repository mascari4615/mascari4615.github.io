/**
 * 일기 — 하루 한 장이 맞나 (TASK-KL-322).
 *
 * 여기서 크게 지키는 것 셋:
 *   ① 같은 날 또 쓰면 **그 장을 고치는 것**이지 두 장이 되지 않는다
 *   ② 빈 글은 지운 것으로 본다 (열었다 그냥 닫아도 달력에 표식이 켜지면 안 된다)
 *   ③ 두 기계의 것을 합칠 때는 **나중에 고친 쪽**이 이긴다
 *
 * 사용: node scripts/test-diary.mjs   (npm run test:diary)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};
const eq = (got, want, label) => check(got === want, `${label}: 「${got}」 (기대 「${want}」)`);

globalThis.localStorage = (() => {
  const box = new Map();
  return {
    getItem: (k) => (box.has(k) ? box.get(k) : null),
    setItem: (k, v) => box.set(k, String(v)),
    removeItem: (k) => box.delete(k),
    clear: () => box.clear(),
  };
})();

async function load() {
  const stamp = `diary-${Date.now()}`;
  const entry = path.join(os.tmpdir(), `${stamp}.ts`);
  fs.writeFileSync(entry, `export * from ${JSON.stringify(path.join(root, 'src/widgets/planner/diary-store.ts'))};\n`);
  const out = path.join(os.tmpdir(), `${stamp}.mjs`);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(entry, { force: true });
  fs.rmSync(out, { force: true });
  return mod;
}

const D = await load();

/* ── 쓰고 읽기 ── */
{
  localStorage.clear();
  eq(D.readDiary('2026-08-17'), null, '안 쓴 날은 없다');
  eq(D.writeDiary('2026-08-17', '플래너에서 리액트를 걷어냈다.'), true, '쓰면 참');
  eq(D.readDiary('2026-08-17').text, '플래너에서 리액트를 걷어냈다.', '쓴 그대로 읽힌다');
  eq(D.listDiary().length, 1, '한 장');
}

/* ── ① 같은 날 다시 쓰면 고치는 것 ── */
{
  localStorage.clear();
  D.writeDiary('2026-08-17', '처음');
  D.writeDiary('2026-08-17', '고침');
  eq(D.listDiary().length, 1, '같은 날은 늘 한 장');
  eq(D.readDiary('2026-08-17').text, '고침', '나중에 쓴 것이 남는다');
}

/* ── ② 빈 글 = 지움 ── */
{
  localStorage.clear();
  D.writeDiary('2026-08-17', '뭔가 썼다');
  eq(D.writeDiary('2026-08-17', ''), false, '빈 글은 거짓');
  eq(D.readDiary('2026-08-17'), null, '빈 글로 덮으면 지워진다');
  eq(D.writeDiary('2026-08-16', '   \n  '), false, '공백뿐이어도 빈 글');
  eq(D.diaryDates().size, 0, '표식 켜질 날이 없다');
}

/* ── 앞뒤 공백은 잘라 둔다 ── */
{
  localStorage.clear();
  D.writeDiary('2026-08-17', '  가운데 글  \n');
  eq(D.readDiary('2026-08-17').text, '가운데 글', '앞뒤 공백은 잘린다');
}

/* ── 최근 날짜가 위 ── */
{
  localStorage.clear();
  D.writeDiary('2026-08-10', '열흘');
  D.writeDiary('2026-08-17', '오늘');
  D.writeDiary('2026-07-30', '지난달');
  const list = D.listDiary();
  eq(list[0].date, '2026-08-17', '첫 줄 = 가장 최근');
  eq(list[2].date, '2026-07-30', '마지막 줄 = 가장 오래된 것');
  eq(D.exportAll()[0].date, '2026-07-30', '내보낼 때는 오래된 것부터 (파일로 읽기 좋게)');
}

/* ── 지우기 ── */
{
  localStorage.clear();
  D.writeDiary('2026-08-17', '쓴다');
  D.deleteDiary('2026-08-17');
  eq(D.readDiary('2026-08-17'), null, '지워진다');
  D.deleteDiary('2026-01-01');
  eq(D.listDiary().length, 0, '없는 날을 지워도 안 죽는다');
}

/* ── 표식 켤 날들 ── */
{
  localStorage.clear();
  D.writeDiary('2026-08-15', 'ㄱ');
  D.writeDiary('2026-08-17', 'ㄴ');
  const dates = D.diaryDates();
  check(dates.has('2026-08-15') && dates.has('2026-08-17'), '쓴 날만 표식');
  check(!dates.has('2026-08-16'), '안 쓴 날은 표식 없음');
}

/* ── 찾기 ── */
{
  localStorage.clear();
  D.writeDiary('2026-08-15', '리액트를 걷어냈다');
  D.writeDiary('2026-08-16', '캘린더에 일기를 얹는다');
  D.writeDiary('2026-07-01', '아무 말');
  eq(D.searchDiary('리액트').length, 1, '글 안에서 찾는다');
  eq(D.searchDiary('리액트')[0].date, '2026-08-15', '찾은 날');
  eq(D.searchDiary('').length, 3, '빈 말이면 전부 (검색칸 비우면 원래대로)');
  eq(D.searchDiary('   ').length, 3, '공백만이어도 전부');
  eq(D.searchDiary('2026-08').length, 2, '날짜로도 찾는다');
  eq(D.searchDiary('없는말').length, 0, '없으면 0');
  D.writeDiary('2026-06-01', 'React 를 걷어냈다');
  eq(D.searchDiary('react').length, 1, '대소문자 안 가린다');
}

/* ── 글자 수·미리보기 ── */
{
  eq(D.charCount('  가나다  '), 3, '앞뒤 공백은 안 센다');
  eq(D.charCount('   '), 0, '공백뿐이면 0');
  eq(D.preview('\n\n첫 줄\n둘째 줄'), '첫 줄', '빈 줄을 건너뛰고 첫 줄');
  eq(D.preview('가'.repeat(200)).length, 81, '긴 줄은 잘리고 말줄임 하나');
  eq(D.preview(''), '', '빈 글은 빈 미리보기');
}

/* ── 긴 글도 그대로 ── */
{
  localStorage.clear();
  const long = '오늘 있었던 일. '.repeat(500);
  D.writeDiary('2026-08-17', long);
  eq(D.readDiary('2026-08-17').text.length, long.trim().length, '긴 글도 안 잘린다');
}

/* ── ③ 합칠 때는 나중에 고친 쪽이 이긴다 ── */
{
  localStorage.clear();
  D.writeDiary('2026-08-17', '이 기계에서 쓴 것', 1000);
  const r = D.importAll([
    { date: '2026-08-17', text: '저 기계에서 나중에 쓴 것', updatedAt: 2000 },
    { date: '2026-08-16', text: '저 기계에만 있던 것', updatedAt: 1500 },
  ]);
  eq(r.updated, 1, '겹친 하루는 고쳐짐');
  eq(r.added, 1, '없던 하루는 더해짐');
  eq(D.readDiary('2026-08-17').text, '저 기계에서 나중에 쓴 것', '나중에 고친 쪽이 이긴다');

  const older = D.importAll([{ date: '2026-08-17', text: '더 옛날 것', updatedAt: 500 }]);
  eq(older.updated, 0, '더 옛날 것은 안 이긴다');
  eq(D.readDiary('2026-08-17').text, '저 기계에서 나중에 쓴 것', '옛날 것이 덮지 못한다');
}

/* ── 이상한 것을 가져와도 안 죽는다 ── */
{
  localStorage.clear();
  const r = D.importAll([null, { date: 5, text: 'x' }, { date: '2026-08-17', text: '   ' }, undefined]);
  eq(r.added, 0, '말이 안 되는 것은 안 들인다');
  eq(D.listDiary().length, 0, '아무것도 안 남는다');
}

/* ── 깨진 저장값 ── */
{
  localStorage.setItem('karmolab_planner_diary', '{망가진}');
  eq(D.listDiary().length, 0, '깨진 값이면 빈 목록');
  eq(D.readDiary('2026-08-17'), null, '깨진 값이어도 안 죽는다');
  localStorage.clear();
}

process.stdout.write('\n');
if (failures.length) {
  console.error(`\n[test-diary] ${failures.length}건 실패:`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('[test-diary] 다 통과');
