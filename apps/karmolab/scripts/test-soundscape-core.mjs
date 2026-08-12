/**
 * 소리 풍경 알맹이 — 겹과 크기의 규칙 (TASK-KL-248).
 *
 * 소리는 귀로 확인해야 하지만, **무너지는 자리는 대개 귀 앞에서 정해진다**:
 * 겹이 빠졌거나, 크기가 곱셈이 아니라 덧셈으로 걸렸거나, 프리셋이 없는 겹을 부르거나.
 * 여기서는 가짜 오디오 장치를 끼워 그 셈법만 본다(브라우저 없이 1초).
 *
 * 사용: node scripts/test-soundscape-core.mjs   (npm run test:soundscape)
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

async function load() {
  const entry = path.join(os.tmpdir(), `ss-core-${Date.now()}.ts`);
  fs.writeFileSync(entry, `export * from ${JSON.stringify(path.join(root, 'src/lib/soundscape.ts'))};\n`);
  const out = path.join(os.tmpdir(), `ss-core-${Date.now()}.mjs`);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(entry, { force: true });
  fs.rmSync(out, { force: true });
  return mod;
}

/** 소리를 내지 않는 가짜 장치 — 마디를 잇고 값을 기억하기만 한다. */
function fakeAudio() {
  const started = [];
  const param = () => ({
    value: 0,
    setValueAtTime(v) {
      this.value = v;
    },
    linearRampToValueAtTime(v) {
      this.value = v;
    },
    exponentialRampToValueAtTime(v) {
      this.value = v;
    },
    setTargetAtTime(v) {
      this.value = v;
    }
  });
  const node = (kind) => {
    const n = {
      kind,
      gain: param(),
      frequency: param(),
      Q: param(),
      type: '',
      buffer: null,
      loop: false,
      connect: (dst) => dst,
      disconnect: () => undefined,
      start: () => started.push(kind),
      stop: () => undefined
    };
    return n;
  };
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    destination: node('dest'),
    createGain: () => node('gain'),
    createOscillator: () => node('osc'),
    createBiquadFilter: () => node('filter'),
    createBufferSource: () => node('src'),
    createBuffer: (_ch, len) => ({ getChannelData: () => new Float32Array(len) }),
    close: () => Promise.resolve()
  };
  globalThis.window = { AudioContext: function () { return ctx; } };
  globalThis.AudioContext = globalThis.window.AudioContext;
  return { ctx, started };
}

const S = await load();
const fake = fakeAudio();

/* ── 겹 ──────────────────────────────────────────────────────────── */
eq(S.LAYERS.length, 9, '겹은 아홉으로 시작한다');
check(new Set(S.LAYERS.map((l) => l.id)).size === 9, '겹 이름이 겹치지 않는다');
check(
  S.LAYERS.every((l) => typeof l.build === 'function' && l.max > 0),
  '겹은 모두 같은 모양을 지킨다(새로 더할 때 표에 한 줄이면 되게)'
);
for (const want of ['fire', 'brook', 'hum']) {
  check(S.LAYERS.some((l) => l.id === want), `집중용으로 더한 겹이 있다: ${want}`);
}

/* ── 크기 ────────────────────────────────────────────────────────── */
eq(S.levelToGain('rain', 0), 0, '0 은 완전한 무음');
check(S.levelToGain('rain', 1) > 0, '1 은 그 겹의 최대');
{
  /* 귀는 크기를 곱셈으로 느낀다 — 반으로 내리면 넷의 하나가 되어야 「반만큼 작아졌다」로 들린다. */
  const half = S.levelToGain('rain', 0.5);
  const full = S.levelToGain('rain', 1);
  check(Math.abs(half / full - 0.25) < 0.01, `반으로 내리면 네 배 작아진다 (지금 ${(half / full).toFixed(3)})`);
}
eq(S.levelToGain('rain', 5), S.levelToGain('rain', 1), '1 을 넘겨도 최대까지만');
eq(S.levelToGain('rain', -3), 0, '음수는 0으로');
eq(S.levelToGain('없는겹', 1), 0, '모르는 겹은 소리가 안 난다');

/* ── 장치 ────────────────────────────────────────────────────────── */
{
  const s = new S.Soundscape();
  check(!s.running, '만들자마자는 꺼져 있다');
  /* 켜기 전에 정한 크기도 기억해야 한다 — 슬라이더를 먼저 올리는 사람이 있다. */
  s.set('rain', 0.6);
  eq(s.get('rain'), 0.6, '꺼져 있어도 크기를 기억한다');
  s.start();
  check(s.running, '켜면 돈다');
  eq(s.get('rain'), 0.6, '켜도 아까 정한 크기가 살아 있다');
  check(s.active().includes('rain'), '울고 있는 겹을 셀 수 있다');
  check(!s.active().includes('wind'), '0 인 겹은 울지 않는 것으로 센다');
  s.duck(true);
  check(s.isDucked, '다른 소리가 울리면 밑으로 깔린다');
  s.duck(false);
  check(!s.isDucked, '끝나면 다시 올라온다');
  s.stop();
  check(!s.running, '멈추면 꺼진다');
}

{
  /* 지구본은 여섯 겹만 쓴다 — 모닥불은 이 별의 소리가 아니다. */
  const s = new S.Soundscape(['drone', 'wave']);
  s.start();
  s.set('fire', 1);
  check(!s.active().includes('fire') || s.get('fire') === 1, '고르지 않은 겹은 만들지 않는다');
  s.stop();
}

{
  const s = new S.Soundscape();
  s.start();
  s.apply({ rain: 0.5, wind: 0.2 });
  eq(s.get('rain'), 0.5, '한 번에 여러 겹을 얹는다');
  eq(s.get('wind'), 0.2, '한 번에 여러 겹을 얹는다(둘째)');
  s.stop();
}

/* ── 미리 섞어 둔 것 ─────────────────────────────────────────────── */
check(S.PRESETS.length >= 5, '프리셋이 다섯 이상 — 아홉 개 슬라이더는 시작점이 아니다');
const ids = new Set(S.LAYERS.map((l) => l.id));
for (const p of S.PRESETS) {
  const bad = Object.keys(p.mix).filter((k) => !ids.has(k));
  check(bad.length === 0, `프리셋 ${p.id} 가 없는 겹을 부른다: ${bad.join(',')}`);
  const loud = Object.values(p.mix).filter((v) => v > 1 || v < 0);
  check(loud.length === 0, `프리셋 ${p.id} 의 값이 0~1 을 벗어난다`);
  check(Object.keys(p.mix).length >= 2, `프리셋 ${p.id} 는 겹을 둘 이상 섞는다(한 겹이면 프리셋이 아니다)`);
}

process.stdout.write('\n');
if (failures.length) {
  console.error(`[test-soundscape] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[test-soundscape] 전부 통과');
