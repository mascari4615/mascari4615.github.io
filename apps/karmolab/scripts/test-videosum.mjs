/**
 * 영상 줄이기. **없는 말을 만들지 않는가** (TASK-KL-238 / 39 summarize.tech).
 *
 * 목차의 이름표는 그럴듯하면 위험하다. 사람은 그걸 믿고 그 구간을 건너뛴다. 그래서 여기서
 * 재는 것은 예쁨이 아니라 **이름표가 자막에 실제로 있는 문장인가**, 그리고 시간이 어긋나지 않는가다.
 *
 * 사용: node scripts/test-videosum.mjs   (npm run test:vidsum)
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
const eq = (got, want, label) => check(got === want, `${label}: ${got} (기대 ${want})`);

async function load() {
  const stamp = Date.now();
  const entry = path.join(os.tmpdir(), `vs-${stamp}.ts`);
  fs.writeFileSync(entry, `export * from ${JSON.stringify(path.join(root, 'src/lib/videosum.ts'))};\n`);
  const out = path.join(os.tmpdir(), `vs-${stamp}.mjs`);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(entry, { force: true });
  fs.rmSync(out, { force: true });
  return mod;
}

const V = await load();

/* ── 읽기 ── */
const SRT = [
  '1',
  '00:00:00,000 --> 00:00:04,000',
  'Today we build a compiler from scratch',
  '',
  '2',
  '00:00:04,500 --> 00:00:09,000',
  'First the lexer turns text into tokens',
  '',
  '3',
  '00:06:00,000 --> 00:06:05,000',
  'Now the parser builds a syntax tree from tokens',
  ''
].join('\n');

{
  const cues = V.parseCues(SRT);
  eq(cues.length, 3, 'SRT 세 줄을 읽는다');
  eq(cues[0].start, 0, '시작 시각');
  eq(cues[1].end, 9, '끝 시각');
  eq(cues[2].text, 'Now the parser builds a syntax tree from tokens', '글자는 그대로');
}
{
  const vtt = 'WEBVTT\n\n00:00.000 --> 00:02.000\nhello there friend\n';
  eq(V.parseCues(vtt).length, 1, 'VTT 도 읽는다 (머리말, 짧은 시각 표기)');
}
eq(V.parseCues('').length, 0, '빈 글은 빈 목록');
eq(V.parseCues('그냥 글, 시각 없음').length, 0, '시각이 없으면 자막이 아니다');
check(Number.isNaN(V.parseTime('없음')), '못 읽는 시각은 NaN');

/* ── 시계 ── */
eq(V.clock(65), '1:05', '한 시간 미만은 분:초');
eq(V.clock(3725), '1:02:05', '한 시간 넘으면 시:분:초');
eq(V.clock(-5), '0:00', '음수는 0');

/* ── 글로 펴기 ── */
{
  const auto = V.parseCues(
    ['00:00:00,000 --> 00:00:01,000', 'we', '', '00:00:01,000 --> 00:00:02,000', 'we build', '',
     '00:00:02,000 --> 00:00:03,000', 'we build things', ''].join('\n')
  );
  eq(V.plainText(auto), 'we build things', '한 글자씩 늘어나는 자동 자막은 마지막 것만 남긴다');
}
{
  const tagged = V.parseCues('00:00:00,000 --> 00:00:01,000\n<i>기울인</i>  글자\n');
  eq(V.plainText(tagged), '기울인 글자', '꾸밈표는 걷어낸다');
}

/* ── 목차 ── */
{
  const cues = V.parseCues(SRT);
  const o = V.outline(cues, 300);
  check(o !== null, '목차가 나온다');
  check(o.chapters.length >= 2, '5분 넘게 벌어지면 칸이 갈린다');
  // ★ 이름표는 **자막에 실제로 있는 문장**이어야 한다
  const all = cues.map((c) => c.text);
  check(o.chapters.every((c) => all.includes(c.label)), '이름표는 지어낸 문장이 아니다');
  check(o.chapters[0].start <= o.chapters[0].end, '칸의 시작이 끝보다 늦지 않다');
  for (let i = 1; i < o.chapters.length; i++) {
    check(o.chapters[i].start >= o.chapters[i - 1].start, `칸 ${i} 은 앞 칸보다 뒤에서 시작한다`);
  }
  eq(o.duration, 365, '자막이 덮는 길이');
  check(o.chars > 0, '글자 수를 센다');
}
eq(V.outline([], 300), null, '자막이 없으면 목차도 없다');
{
  // 짧은 영상도 칸이 나온다 (한 칸이라도)
  const short = V.parseCues('00:00:00,000 --> 00:00:20,000\n짧은 영상 하나 있습니다\n');
  const o = V.outline(short, 300);
  eq(o.chapters.length, 1, '짧으면 한 칸');
  eq(o.chapters[0].label, '짧은 영상 하나 있습니다', '한 칸짜리 이름표도 원문 그대로');
}
{
  // 맞장구만 있으면 이름표가 없다. 지어내지 않는다
  const nod = V.parseCues('00:00:00,000 --> 00:00:02,000\n네\n\n00:00:02,000 --> 00:00:04,000\n음\n');
  eq(V.labelOf(nod), '', '맞장구뿐이면 이름표를 비운다 (지어내기 금지)');
}

process.stdout.write('\n');
if (failures.length) {
  console.error(`\n영상 줄이기. ${failures.length}건 실패:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('영상 줄이기. 전부 통과');
