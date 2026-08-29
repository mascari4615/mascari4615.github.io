#!/usr/bin/env node
/**
 * **재우고 바로 읽는 자리**를 세는 자 (2026-08-16, TASK-KAR-220)
 *
 * 왜: 하루에 아홉 번 같은 것을 고쳤다. 팔레트 번쩍임, 놀이 표 세기, 오락실 시간비 , 
 * 겹침 카드 이름, 더 보기, 시점 되돌림, StudyMap 번쩍임, 성능 자기시험, 오락실 자판.
 * 전부 한 모양이었다: `waitForTimeout(N)` 으로 **시간을 재운 다음 곧바로 값을 읽는다.**
 * 바쁜 판(CI)에서는 그 사이에 다시 그리기가 안 끝나 **옛 값**이 읽히고, 그래서 판마다
 * 엉뚱한 검사가 빨개진다. 제품은 멀쩡한데 사람이 매번 그걸 쫓는다.
 *
 * 규칙 정본 = `memo/rules/quality.md § 순간을 나중에 보지 마라`.
 * 그 글에 세는 자를 붙여 래칫으로 조이는 것이 다음 판의 일이다라고 적었다. 이것이 그 자다.
 *
 * 무엇을 세나: `waitForTimeout(...)` **바로 뒤 두 줄 안**에서 값을 읽는 자리
 * (`evaluate`, `$$eval`, `textContent`, `screenshot`, `boundingBox` 등).
 * 사이에 다른 `waitFor...`(조건 기다리기)가 있으면 세지 않는다. 그건 제대로 기다린 것이다.
 *
 * 왜 전부를 빨강으로 안 하나: 250자리가 이미 있다. 늘 빨간 검사는 곧 꺼진다.
 * **톱니**로 둔다. 지금 수를 기준선으로 박고 **늘면 빨강**, 갚으면 기준선이 저절로 조여진다.
 *
 * 사용: node scripts/audit-sleep-then-read.mjs [--write-baseline]
 * exit: 0 = 안 늘었다 / 1 = 늘었다 / 2 = 볼 파일이 없다(못 쟀다)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const gateDir = path.join(root, 'scripts');
const baselineFile = path.join(root, 'data/sleep-then-read-baseline.json');

/** 값을 읽는 꼴. 이것이 재운 직후에 오면 옛 값을 읽을 수 있다. */
const READ_CALL = /[.](evaluate|[$][$]eval|[$]eval|textContent|innerText|screenshot|boundingBox)[(]/;

function listFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(full));
    else if (e.name.endsWith('.mjs')) out.push(full);
  }
  return out;
}

const hits = [];
const files = listFiles(gateDir);
for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split(String.fromCharCode(10));
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes('waitForTimeout(')) continue;
    /* ★ **재우는 것이 곧 재려는 것일 때가 있다** (2026-08-16). 눌러 놓고 0.5초 뒤에도 표시가
       남아 있나처럼 **시간이 지난 뒤의 상태**가 판정 대상이면 재우는 게 맞다. 그건 빚이 아니다.
       그 자리에는 재우는 줄(또는 바로 윗줄)에 `재움-의도` 를 적어 둔다. 표시가 없는 것만 센다.
       (표시를 남발하면 이 자가 죽는다. 무엇을 재려고 재우는지 한 줄로 같이 적을 것.) */
    const precedingLines = lines.slice(Math.max(0, i - 3), i + 1).join(String.fromCharCode(10));
    if (precedingLines.includes('재움-의도')) continue;
    for (let j = i + 1; j < Math.min(i + 3, lines.length); j += 1) {
      /* 사이에 조건 기다리기가 있으면 제대로 기다린 것이다. 세지 않는다. */
      if (lines[j].includes('waitFor') && !lines[j].includes('waitForTimeout')) break;
      if (READ_CALL.test(lines[j])) {
        hits.push(`${path.relative(root, file).split(path.sep).join('/')}:${i + 1}`);
        break;
      }
    }
  }
}

if (files.length === 0) {
  console.error('[sleep-then-read] 못 쟀다. 볼 파일이 없다. 통과가 아니다.');
  process.exit(2);
}

const baseline = fs.existsSync(baselineFile)
  ? JSON.parse(fs.readFileSync(baselineFile, 'utf8'))
  : { note: '재우고 바로 읽는 자리. 늘면 빨강, 갚으면 저절로 줄어든다', count: Number.POSITIVE_INFINITY };
const baselineCount = Number(baseline.count);
const currentCount = hits.length;

console.log(`[sleep-then-read] 검사 ${files.length}개, 재우고 바로 읽는 자리 ${currentCount}개 (기준선 ${baselineCount})`);

/* ★ **갚으라고 세는 것이면 어디부터 갚을지 보여야 한다** (2026-08-16). 세는 수만 있으면
   249개는 그냥 큰 수다. 아무도 손을 못 댄다. `--list` 로 **파일별로 몇 개인지**를 낸다.
   빨강일 때만 보여 주면 갚으려는 사람이 볼 수가 없다(빨강이 아니어야 정상이므로). */
if (process.argv.includes('--list')) {
  const byFile = new Map();
  for (const one of hits) {
    const filePath = one.slice(0, one.lastIndexOf(':'));
    byFile.set(filePath, (byFile.get(filePath) || 0) + 1);
  }
  const rows = [...byFile.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`[sleep-then-read] 파일 ${rows.length}개에 퍼져 있다. 많은 곳부터:`);
  for (const [filePath, count] of rows.slice(0, 12)) console.log(`   ${String(count).padStart(3)}  ${filePath}`);
  if (rows.length > 12) console.log(`   ... 그 외 파일 ${rows.length - 12}개`);
  console.log('  갚는 법: 시간을 재우지 말고 **된 상태**를 기다려라(`waitForFunction`).');
  console.log('  재우는 것 자체가 판정이면(0.5초 뒤에도 남아 있나) 그 줄 앞에 `재움-의도` 를 적어라.');
}

/* ★ **그냥 돌렸을 뿐인데 기준선이 조여지면 안 된다** (2026-08-16, 스스로 밟은 함정).
   처음엔 수가 줄면 곧바로 기준선을 새로 썼다. 그런데 이 자는 **고치는 중에도** 돌린다 . 
   고치다 만 것을 되돌리면 기준선만 조인 채 남아 **모두의 CI 가 빨개진다**.
   톱니를 조이는 것은 갚았다는 **판단**이지 재 봤다가 아니다. 그러니 굳히는 건 시켜야 한다.
   (늘리는 쪽은 원래 자동이 아니다. 늘면 빨강이다.) */
const writeBaseline = process.argv.includes('--write-baseline');
if (currentCount < baselineCount && !writeBaseline) {
  console.log(`[sleep-then-read] ${baselineCount - currentCount}자리 갚은 것으로 보인다. 검사를 돌려 확인한 뒤`);
  console.log('  `node scripts/audit-sleep-then-read.mjs --write-baseline` 로 굳혀라(기준선은 굳혀야 조여진다).');
}
if (writeBaseline) {
  fs.writeFileSync(
    baselineFile,
    `${JSON.stringify({ ...baseline, updated: new Date().toISOString().slice(0, 10), count: currentCount }, null, 2)}
`,
    'utf8'
  );
  if (Number.isFinite(baselineCount) && currentCount < baselineCount) {
    console.log(`[sleep-then-read] ${baselineCount - currentCount}자리 갚았다. 기준선을 ${currentCount} 으로 조인다`);
  } else if (!Number.isFinite(baselineCount)) {
    console.log(`[sleep-then-read] 기준선을 처음 박는다. ${currentCount}. 여기서 **늘면** 빨강이다.`);
  }
}

if (currentCount > baselineCount) {
  console.error(`[sleep-then-read] 재우고 바로 읽는 자리가 ${currentCount - baselineCount}개 늘었다 (${baselineCount} → ${currentCount}).`);
  console.error('  시간을 재우지 말고 **된 상태를 기다려라**. `waitForFunction` / `waitForSelector`.');
  console.error('  까닭: 바쁜 판에서는 다시 그리기가 안 끝나 옛 값이 읽힌다. 오늘 하루에만 아홉 번 그랬다.');
  console.error('  손쉬운 두 가지 (scripts/lib/settle.mjs):');
  console.error("   , 값이 어떤 값으로 굳는 자리 → 멎을때까지(page, () => 읽기())");
  console.error("   , 되기를 아는 자리       → 될때까지(page, () => 조건)  ← 이쪽이 더 정확하다");
  console.error('  일부러 흘려보내는 자리라면(쌓이라고 재우는 것) 그 위에 `재움-의도` 와 까닭을 한 줄 적어라. 그러면 안 센다.');
  console.error('  정본: memo/rules/quality.md § 순간을 나중에 보지 마라');
  for (const one of hits.slice(0, 10)) console.error(`    ${one}`);
  process.exit(1);
}
