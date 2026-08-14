/**
 * 판 도는 중에 「무슨 일」이 나르고, 소리가 **한 번씩만** 우는가 (arcade-next 「놀이마다의 소리」)
 *
 * 재는 것 셋:
 *  ① 커널이 **판이 안 끝나도** 말을 나른다 (전에는 끝날 때만 받아서 화살이 든 순간이 안 남았다)
 *  ② 말에 소리 이름이 붙는다 — 게임은 「무슨 일」만 말하고 어떤 소리인지는 껍데기가 고른다
 *  ③ **한 사건에 한 번**만 운다. 껍데기는 「말이 바뀌었나」로 견주는데, 같은 사람이 연달아
 *     빗나가면 말이 똑같아 두 번째가 안 운다 — 그래서 놀이가 발마다 달라지는 값을 실어야 한다.
 *     그 값이 빠지면 이 검사가 **몇 십 배로 뻥튀기된 수**를 잡는다(실측: 60 → 3000).
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'note-'));
const out = join(dir, 'a.mjs');
await build({ entryPoints: ['src/widgets/arcade/index.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
const { Match, gameById, partySize } = await import(pathToFileURL(out).href);

let bad = 0;
const ok = (cond, name, detail = '') => {
  console.log(`  [${cond ? 'O' : 'X'}] ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) bad++;
};

/**
 * 놀이마다 「일어난 일」을 어디에 적어 두는지가 다르다 — 함대는 `last`, 투호는 `shots` 끝.
 * 그래서 **몇 번째 사건인가**를 세는 법도 놀이마다 준다. 이음매가 참인지 보려면 둘 이상이어야
 * 한다 — 하나만 재면 그 놀이가 되는 것이지 이음매가 되는 것이 아니다.
 */
const CASES = [
  { id: 'fleet', events: (st) => (st.last ? JSON.stringify(st.last) : ''), want: ['arcade.fleet.hit', 'arcade.fleet.miss'] },
  { id: 'tuho', events: (st) => String((st.shots ?? []).length), want: ['arcade.tuho.in', 'arcade.tuho.out'] },
  /* 협동 놀이 — 「불이 꺼졌다」는 모두의 손해라 소리가 특히 값어치 있다. 일어난 일은
     `last` 에 있고, 사건 세기는 산·줄·불씨가 바뀌는 것으로 본다(한 수에 하나는 바뀐다). */
  {
    id: 'lanterns',
    events: (st) => (st.last ? `${st.deck.length}${(st.piles ?? []).join('')}${st.fuses}${st.last.kind}${st.last.who}` : ''),
    want: ['arcade.lanterns.lit', 'arcade.lanterns.told']
  },
  /* 짝 맞추기 — 좋고 나쁨이 제일 또렷한 놀이(맞히면 한 번 더, 틀리면 넘어간다).
     사건은 `last` 가 바뀌는 것으로 센다. */
  {
    id: 'memory',
    events: (st) => (st.last ? `${st.last.by}${st.last.hit}${st.taken.filter((v) => v !== 0).length}` : ''),
    want: ['arcade.memory.hit', 'arcade.memory.miss']
  },
  /* 하이로우 — 이어 맞히면 배로, 틀리면 0. 「한 장만 더」가 심장이라 소리가 곧 놀이다.
     사건 세기는 판돈·남은 판으로 본다 — 한 수마다 반드시 둘 중 하나가 바뀐다.
     (분간용 번호를 따로 실어 봤지만 **빼도 안 빨개져서** 뺐다: 판돈이 이미 분간해 준다.
      증명 못 하는 코드는 안 남긴다 — 짝 맞추기와 달리 여기선 필요 없었다.) */
  {
    id: 'highlow',
    events: (st) => `${st.pot}${(st.left ?? []).join('')}${st.last}`,
    want: ['arcade.highlow.hit', 'arcade.highlow.bust']
  },
  /* 지뢰찾기 — 여럿이 **동시에** 파는 놀이라 매 칸마다 울리면 시끄럽다. 밟은 순간만 운다.
     그래서 사건 세기도 「밟은 사람 수」다. 한 사람은 한 번만 밟는다(밟으면 그 판은 끝). */
  {
    id: 'minesweeper',
    events: (st) => String((st.dead ?? []).filter(Boolean).length),
    /* 이 놀이의 사건은 한 종류다 — 칸을 여는 데는 일부러 소리를 안 붙였다(시끄럽다). */
    want: ['arcade.mine.boom']
  },
  /* 점 잇기 — 선은 수십 번 긋지만 **칸을 닫는 순간**만 값어치가 있다(닫으면 한 번 더).
     그래서 사건 세기도 닫힌 칸 수다. 선 긋기에는 일부러 소리를 안 붙였다. */
  {
    id: 'dots',
    events: (st) => String((st.boxes ?? []).filter((b) => b !== 0).length),
    want: ['arcade.dots.got']
  },
  /* 따내기 바둑 — 돌은 수십 번 놓지만 순간은 **따낼 때**다. 사건 세기도 따낸 돌 수. */
  {
    id: 'capturego',
    events: (st) => (st.caught ?? []).join('-'),
    want: ['arcade.go.took']
  },
  /* 거짓말 주사위 — 거는 말은 수십 번이지만 순간은 **주사위를 잃을 때**다.
     사건 세기도 남은 주사위 총수(잃을 때마다 반드시 준다). */
  {
    id: 'liars',
    events: (st) => String((st.dice ?? []).reduce((a, d) => a + d.length, 0)),
    want: ['arcade.liars.lost']
  },
  /* 윷놀이 — 던지기·움직이기는 수십 번이지만 순간은 **잡을 때**다(잡으면 한 번 더 던진다).
     사건 세기 = 여태 잡은 횟수. */
  {
    id: 'yut',
    events: (st) => String(st.catches ?? 0),
    want: ['arcade.yut.caughtBy']
  }
];

for (const one of CASES) {
  const g = gameById(one.id);
  const n = partySize(g);
  const m = new Match(g, 777, Array.from({ length: n }, (_, k) => ({ name: 'b' + k, bot: true })));

  let last = '';
  let rang = 0;
  let withSound = 0;
  let frames = 0;
  let shots = 0;
  let lastShot = '';
  const kinds = new Set();
  for (let now = 0; now <= 200000; now += 16) {
    m.step(now);
    const v = m.view();
    const shot = one.events(v.state);
    if (shot && shot !== lastShot) {
      shots += 1;
      lastShot = shot;
    }
    if (v.note && !v.finished) {
      frames += 1;
      const said = v.note.key + JSON.stringify(v.note.params ?? {});
      if (said !== last) {
        rang += 1;
        kinds.add(v.note.key);
        if (v.note.sound) withSound += 1;
        last = said;
      }
    }
    if (v.finished) break;
  }

  ok(rang > 0, `${one.id}: 판이 안 끝나도 말이 나른다`, `${rang}번`);
  ok(one.want.some((k) => kinds.has(k)), `${one.id}: 그 놀이의 순간이 말로 나온다`, [...kinds].join(' '));
  ok(withSound >= rang - 1, `${one.id}: 말에 소리 이름이 붙어 있다`, `${withSound}/${rang}`);
  ok(rang < frames / 5, `${one.id}: 프레임마다 안 운다`, `프레임 ${frames} · 운 횟수 ${rang}`);
  /**
   * **놓친 사건이 없는가** — 이게 알맹이다. 처음엔 「운 횟수가 적당한가」만 봤는데 놀이에서
   * 발마다 달라지는 값을 빼도 **안 빨개졌다**(연속 같은-사람 발이 드물어 총량으로는 티가 안 났다).
   * 실제 사건 수와 견주니 그때 91발 중 10발을 놓치는 것이 잡힌다. 안 빨개지는 검사는 틀린 검사다.
   */
  /* **마지막 하나는 빠질 수 있다** — 그 사건으로 판이 끝나면 결과 말이 그 자리를 덮는다.
     그건 옳은 일이라(끝났다고 말해야 한다) 검사가 그것까지 빨갛게 하면 안 된다.
     투호에서 실제로 그렇게 잡혔다: 16발 중 15번 — 마지막 발이 「이겼다」로 바뀐 것이었다. */
  ok(rang >= shots - 1, `${one.id}: 일어난 사건마다 빠짐없이 운다 (마지막 하나는 결과가 덮는다)`,
    `사건 ${shots} · 운 횟수 ${rang} · 놓침 ${Math.max(0, shots - rang)}`);
}

if (bad) { console.error(`[note-sound] 실패 ${bad}건`); process.exit(1); }
console.log('[note-sound] 통과 — 놀이가 말하고, 사건마다 한 번씩 운다');
