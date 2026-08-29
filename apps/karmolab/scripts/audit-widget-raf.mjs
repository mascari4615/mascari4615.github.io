/**
 * 위젯이 그리기 루프를 **직접** 걸었나 (change.widget-idle-cost 잔여).
 *
 * `test:widget-idle` 은 진짜로 도는 것을 재지만 여덟 개만 열어 본다 — 새 위젯이 rAF 를
 * 직접 걸어도 그 검사가 그 위젯을 안 열면 조용히 지나간다. 여기서는 **글자로** 잡는다.
 *
 * 무엇이 걸리나: 스스로를 다시 거는 루프(`raf = requestAnimationFrame(frame)` 처럼 이름에
 * 담아 두는 것). 한 번만 미루는 `requestAnimationFrame(() => ...)` 은 루프가 아니라
 * 「다음 프레임에 한 번」이라 그냥 둔다.
 *
 * 예외를 두려면 위젯이 `Toolbox.keepAlive('왜')` 로 **이유를 적어야** 한다.
 *
 * **이미 있던 것은 명부(`data/widget-raf-baseline.json`)에 적어 두고 새 것만 막는다.**
 * 스물몇 곳을 한 번에 고치는 것은 이 검사의 값이 아니다 — 실측으로 나온 뒤에도 계속 그리던
 * 것은 정원과 멍 둘뿐이었고(`test:widget-idle` 로 갈래마다 쟀다) 둘 다 고쳤다.
 * 명부의 파일을 고쳐서 더는 안 걸리면 그 줄을 지우라고 말해 준다.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');
const ROOTS = [path.join(APP, 'src/widgets'), path.join(APP, 'src/lib')];
const BASELINE_PATH = path.join(APP, 'data/widget-raf-baseline.json');

/** 이름에 담아 다시 거는 모양 = 루프. */
const LOOP = /(^|[^.\w])(\w+)\s*=\s*requestAnimationFrame\s*\(/;

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

const baseline = new Set(JSON.parse(await readFile(BASELINE_PATH, 'utf-8')).files);
const offenders = [];
const seen = new Set();

for (const root of ROOTS) {
  for (const file of await walk(root)) {
    const source = await readFile(file, 'utf-8');
    if (!LOOP.test(source)) continue;
    // 이유를 적어 둔 것은 예외다 — 이유 없는 예외는 없다.
    if (source.includes('keepAlive(')) continue;
    const rel = path.relative(APP, file).split(path.sep).join('/');
    seen.add(rel);
    if (baseline.has(rel)) continue;
    const line = source.split('\n').findIndex((text) => LOOP.test(text)) + 1;
    offenders.push(`${rel}:${line}`);
  }
}

const fixed = [...baseline].filter((rel) => !seen.has(rel));
if (fixed.length) {
  console.error(`[widget-raf] 명부에 있는데 이제 안 걸리는 것 ${fixed.length}곳 — 명부에서 지워라 (data/widget-raf-baseline.json)`);
  for (const line of fixed) console.error(`  - ${line}`);
  process.exit(1);
}

if (offenders.length) {
  console.error(`[widget-raf] 새로 스스로 거는 그리기 루프 ${offenders.length}곳 — 화면에서 나가도 계속 돈다`);
  for (const line of offenders) console.error(`  - ${line}`);
  console.error('  고치는 법: Toolbox.raf(fn) 로 걸면 안 보이는 동안 멈췄다 이어서 돈다.');
  console.error("  정말 계속 돌아야 하면 Toolbox.keepAlive('왜') 로 이유를 남겨라.");
  process.exit(1);
}
console.log(`[widget-raf] OK — 새로 직접 거는 그리기 루프 없음 (명부에 남은 옛 것 ${baseline.size}곳)`);
