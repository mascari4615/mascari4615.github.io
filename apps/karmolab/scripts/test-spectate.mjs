/**
 * 구경꾼에게 비밀이 안 새는가 — 창 없이, 게임 15개 전부 (TASK-KL-264 E2)
 *
 * 화면으로는 못 잰다. 화면은 남의 패를 애초에 안 그리므로 **새어도 그림이 똑같다**
 * (감추기 검사에서 한 번 속았다 — 일부러 새게 해도 화면 검사가 초록이었다).
 * 재는 것은 「보낸 값」이라 상태를 직접 비교해야 한다.
 *
 * 방법 — **샌다는 것을 정확히 정의한다**: 어떤 자리가 못 보게 지워진 값을 구경꾼은 원래
 * 값 그대로 들고 있다, 가 곧 샌 것이다. 그래서 판을 경로별로 펴 놓고
 *   「어느 자리 하나라도 `redact` 가 원래 값을 바꿔 놓았다면(= 그 자리는 못 본다),
 *    구경꾼 판의 그 자리도 원래 값이면 안 된다」
 * 를 못 박는다. 구경꾼이 *더 적게* 아는 것은 샌 것이 아니다 — 그게 목적이다.
 *
 * 「덜 안다」는 JSON 글자 수로 대충 재지 않는다 — 감춘 자리를 빈 배열로 바꾸면 글자 수가
 * 오히려 늘 수도 있다. 그래서 **경로별로** 판을 훑어 비교한다.
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'spect-'));
const out = join(dir, 'a.mjs');
await build({ entryPoints: ['src/widgets/arcade/index.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
const mod = await import(pathToFileURL(out).href);
const { Match, GAMES, partySize } = mod;

const sp = await build({ entryPoints: ['src/widgets/arcade/spectate.ts'], bundle: true, format: 'esm', write: false, platform: 'node' });
const { forWatcher } = await import('data:text/javascript;base64,' + Buffer.from(sp.outputFiles[0].text).toString('base64'));

let bad = 0;
const ok = (cond, name, detail = '') => {
  console.log(`  [${cond ? 'O' : 'X'}] ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) bad++;
};

/** 판을 「경로 → 값」 한 장으로 펴 놓는다. 그래야 무엇이 남았는지 정확히 비교된다. */
function flat(v, path = '', into = new Map()) {
  if (v === null || typeof v !== 'object') { into.set(path, v); return into; }
  if (Array.isArray(v)) { v.forEach((x, i) => flat(x, `${path}[${i}]`, into)); into.set(path + '#len', v.length); return into; }
  for (const [k, x] of Object.entries(v)) flat(x, path ? `${path}.${k}` : k, into);
  return into;
}

/** 판을 몇 수 굴려 둔다 — 초기 판은 대개 비어 있어 감추기가 드러나지 않는다. */
function warmed(g) {
  const n = partySize(g);
  const m = new Match(g, 4242, Array.from({ length: n }, (_, i) => ({ name: 'b' + i, bot: true })));
  for (let t = 0; t <= 8000; t += 50) { m.step(t); if (m.view().finished) break; }
  return m.view();
}

const secret = GAMES.filter((g) => typeof g.redact === 'function');
console.log(`[spectate] 감출 것이 있는 게임 ${secret.length}개`);

for (const g of secret) {
  const v = warmed(g);
  const seats = v.seats.length;
  const watcher = flat(forWatcher(g, v.state, seats));
  const perSeat = Array.from({ length: seats }, (_, i) => flat(g.redact(v.state, i)));

  const raw = flat(v.state);

  /* 어느 자리든 못 보게 지워진 값인데 구경꾼이 원래 값을 들고 있으면 샌 것이다. */
  const leaks = [];
  for (const [k, real] of raw) {
    const hiddenSomewhere = perSeat.some((m) => JSON.stringify(m.get(k)) !== JSON.stringify(real));
    if (!hiddenSomewhere) continue;
    if (JSON.stringify(watcher.get(k)) === JSON.stringify(real) && leaks.length < 3) {
      leaks.push(`${k} = ${JSON.stringify(real)} (감춰야 하는데 구경꾼이 그대로 안다)`);
    }
  }
  ok(leaks.length === 0, `${g.id}: 구경꾼이 아는 것은 모두가 아는 것뿐`, leaks.join(' | '));
}

if (bad) { console.error(`[spectate] 실패 ${bad}건`); process.exit(1); }
console.log('[spectate] 통과 — 구경꾼에게 남의 비밀이 안 간다');
