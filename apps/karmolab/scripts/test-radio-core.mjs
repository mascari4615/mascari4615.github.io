/**
 * 지구본 라디오 알맹이 — 브라우저 없이 도는 규칙들 (TASK-KL-241).
 *
 * 왜 있나: 이 기능이 무너지는 자리는 화면이 아니라 **셈법과 실패 처리**다 —
 * http 스트림을 안 걸러 조용해지거나, 뭉친 좌표를 안 묶어 점이 겹치거나,
 * 죽은 방송국에서 안 넘어가 사람이 「고장났네」 하고 닫는 것. 전부 화면 없이 잴 수 있다.
 *
 * 사용: node scripts/test-radio-core.mjs   (npm run test:radio)
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
  const entry = path.join(os.tmpdir(), `radio-core-${Date.now()}.ts`);
  fs.writeFileSync(
    entry,
    `export * from ${JSON.stringify(path.join(root, 'src/widgets/bluemarble/radio.ts'))};\n`
  );
  const out = path.join(os.tmpdir(), `radio-core-${Date.now()}.mjs`);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(entry, { force: true });
  fs.rmSync(out, { force: true });
  return mod;
}

/** 진짜 `Audio` 대신 끼우는 가짜 — 이벤트를 손으로 쏘아 실패/성공을 만든다.
    진짜와 같이 **요소 하나를 계속 쓰므로** 가짜도 하나만 만들어진다. */
function fakeAudio() {
  const made = [];
  const make = (url) => {
    const listeners = {};
    const el = {
      paused: true,
      currentTime: 0,
      src: url,
      addEventListener: (k, fn) => {
        (listeners[k] || (listeners[k] = [])).push(fn);
      },
      removeAttribute: () => {
        el.src = '';
      },
      remove: () => undefined,
      pause: () => {
        el.paused = true;
      },
      play: () => {
        el.paused = false;
        return { catch: () => undefined };
      },
      fire: (k) => (listeners[k] || []).forEach((fn) => fn()),
      succeed: () => {
        el.currentTime = 1;
        el.paused = false;
        el.fire('playing');
      }
    };
    made.push(el);
    return el;
  };
  return {
    make,
    made,
    get el() {
      return made[0];
    }
  };
}

const st = (i, lat, lon) => ({
  stationuuid: `uuid-${i}-0000000000`,
  name: `Station ${i}`,
  url_resolved: `https://s${i}.example/stream`,
  geo_lat: lat,
  geo_long: lon,
  countrycode: 'KR'
});

async function main() {
  const R = await load();

  /* ── 받는 자리에서 거르기 ─────────────────────────────────────── */
  check(R.slim(st(1, 37.5, 127)) !== null, 'https 방송국은 통과해야 한다');
  check(
    R.slim({ ...st(2, 37.5, 127), url_resolved: 'http://s.example/x' }) === null,
    'http 스트림은 버려야 한다 (https 페이지에서 소리가 안 난다)'
  );
  check(R.slim(st(3, -48.877, -123.393)) === null, 'Point Nemo 는 가짜 좌표라 버려야 한다');
  check(R.slim(st(4, 0, 0)) === null, 'Null Island 는 좌표 미입력이라 버려야 한다');
  check(R.slim({ ...st(5, 37.5, 127), name: '  ' }) === null, '이름 없는 방송국은 버려야 한다');
  check(R.slim({ ...st(6, 37.5, 127), geo_lat: null }) === null, '좌표 없는 방송국은 버려야 한다');

  /* ── 뭉친 좌표 묶기 ──────────────────────────────────────────── */
  const near = [R.slim(st(1, 37.5, 127)), R.slim(st(2, 37.51, 127.01)), R.slim(st(3, 48.2, 16.3))];
  const spots = R.toSpots(near);
  eq(spots.length, 2, '5km 안쪽 둘은 한 자리로 묶인다');
  eq(spots[0].stations.length, 2, '한 자리에 방송국 둘');
  eq(spots[0].stations[0].name, 'Station 1', '먼저 온 것(인기순)이 그 자리의 대표');

  const many = [];
  for (let i = 0; i < 40; i += 1) many.push(R.slim(st(i, 37.5, 127)));
  eq(R.toSpots(many)[0].stations.length, 24, '한 자리 상한 24 — 182개를 훑게 하지 않는다');

  /* ── 가장 가까운 자리 ────────────────────────────────────────── */
  const world = R.toSpots([R.slim(st(1, 37.5, 127)), R.slim(st(2, 48.2, 16.3)), R.slim(st(3, 35.7, 139.7))]);
  eq(R.nearestSpot(world, 37.6, 127.1, 3)?.stations[0].name, 'Station 1', '가까운 자리를 고른다');
  check(R.nearestSpot(world, 10, 10, 3) === null, '멀면 아무 자리도 안 잡힌다');
  const dateline = R.toSpots([R.slim(st(1, 0, 179.5))]);
  check(
    R.nearestSpot(dateline, 0, -179.8, 2) !== null,
    '날짜변경선 너머도 이웃이다 (경도 179.5 와 -179.8 은 0.7° 차이)'
  );
  /* 위도 80° 에서 경도 10° 는 실거리로 3° 남짓이다. 경도를 안 줄이면 「10° 떨어짐」으로 재서
     3° 짜리 잡이 범위를 벗어난다 — 바로 옆 방송국을 못 잡는다. */
  const polar = R.toSpots([R.slim(st(1, 80, 20))]);
  check(
    R.nearestSpot(polar, 80, 30, 3) !== null,
    '고위도에서 경도 10° 는 실거리로 짧다 — 줄여 재야 옆 방송국이 잡힌다'
  );
  check(
    R.nearestSpot(R.toSpots([R.slim(st(1, 0, 20))]), 0, 30, 3) === null,
    '적도에서는 같은 경도 10° 가 멀다 — 줄이는 정도가 위도를 따라야 한다'
  );

  /* ── 죽은 방송국에서 손 안 가게 넘어가기 ──────────────────────── */
  const spot = R.toSpots([R.slim(st(1, 37.5, 127)), R.slim(st(2, 37.5, 127)), R.slim(st(3, 37.5, 127))])[0];

  {
    const seen = [];
    const fa = fakeAudio();
    const p = new R.RadioPlayer((s2) => seen.push(s2), 50, fa.make);
    p.play(spot);
    eq(seen[0].kind, 'tuning', '누르면 먼저 맞추는 중');
    eq(fa.made.length, 1, '소리 그릇은 하나만 만든다(제스처 밖에서 새로 만들면 브라우저가 막는다)');
    fa.el.fire('error');
    eq(seen[seen.length - 1].station.name, 'Station 2', '죽으면 말없이 다음 국으로');
    eq(fa.made.length, 1, '다음 국으로 가도 그릇은 그대로 — 주소만 갈아 끼운다');
    fa.el.succeed();
    eq(seen[seen.length - 1].kind, 'playing', '소리가 나면 재생 중');
    eq(p.current.name, 'Station 2', '지금 나오는 국을 안다');
    p.stop();
    eq(seen[seen.length - 1].kind, 'idle', '멈추면 빈 상태');
  }

  {
    const seen = [];
    const fa = fakeAudio();
    const p = new R.RadioPlayer((s2) => seen.push(s2), 50, fa.make);
    p.play(spot);
    fa.el.fire('error');
    fa.el.fire('error');
    fa.el.fire('error');
    eq(seen[seen.length - 1].kind, 'dead', '한 바퀴 다 돌면 그 자리는 죽은 것');
    check(fa.el.paused, '죽은 자리에서는 소리를 멈춘다');
  }

  {
    const seen = [];
    const fa = fakeAudio();
    const p = new R.RadioPlayer((s2) => seen.push(s2), 50, fa.make);
    p.play(spot);
    fa.el.succeed();
    p.play(spot);
    eq(p.current.name, 'Station 2', '같은 자리를 다시 누르면 그 안에서 다음 방송국');
  }

  {
    /* 지난 시도의 메아리 — 앞 주소가 낸 실패가 다음 방송이 시작된 뒤 도착해도 죽이면 안 된다. */
    const seen = [];
    const fa = fakeAudio();
    const p = new R.RadioPlayer((s2) => seen.push(s2), 50, fa.make);
    p.unlock();
    check(fa.el.src.startsWith('data:audio'), '허락을 받을 때는 빈 주소가 아니라 무음 조각을 쓴다');
    p.play(spot);
    const stale = fa.el.src;
    fa.el.src = 'https://s9.example/other'; // 지난 주소에서 온 알림인 척
    fa.el.fire('error');
    eq(p.current.name, 'Station 1', '지난 주소의 실패는 지금 방송을 넘기지 않는다');
    fa.el.src = stale;
  }

  {
    const fa = fakeAudio();
    const p = new R.RadioPlayer(() => undefined, 50, fa.make);
    p.unlock();
    eq(fa.made.length, 1, '누른 순간 소리 그릇을 미리 만든다');
    p.play(spot);
    eq(fa.made.length, 1, '나중에 틀 때는 그 그릇을 그대로 쓴다');
    eq(fa.el.src, 'https://s1.example/stream', '미리 잡아 둔 그릇에 주소만 끼운다');
  }

  {
    const seen = [];
    const fa = fakeAudio();
    const p = new R.RadioPlayer((s2) => seen.push(s2), 20, fa.make);
    p.play(spot);
    await new Promise((r) => setTimeout(r, 35));
    eq(seen[seen.length - 1].station.name, 'Station 2', '조용히 안 끊는 서버는 시간 초과로 넘어간다');
    p.stop();
  }

  process.stdout.write('\n');
  if (failures.length) {
    console.error(`\n[test-radio] 실패 ${failures.length}건`);
    failures.forEach((f) => console.error('  - ' + f));
    process.exit(1);
  }
  console.log('[test-radio] 전부 통과');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
