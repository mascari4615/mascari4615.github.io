/**
 * 올린 것이 **진짜 사람 화면에 닿았는지** 묻는다 (TASK-KL-124)
 *
 * 여태 우리가 아는 것은 「배포가 성공했다」까지였다. 그런데 배포가 초록인데도 옛 판이 계속
 * 서빙되는 일이 있었고(캐시·서비스 워커·생성기 중단), 한참 뒤에 눈으로 발견했다.
 * 200 이 오는지, 화면이 그려지는지는 다른 검사가 본다 — 이 검사는 **어느 판이 서빙되는지**
 * 하나만 본다.
 *
 * 어떻게: 빌드가 `build.json` 에 그 판의 커밋을 적어 둔다. 여기서 그 파일을 받아
 * 기대하는 커밋과 맞춰 본다. 배포가 퍼지는 데 시간이 걸리므로 몇 번 다시 묻는다.
 *
 * 사용:
 *   EXPECTED_SHA=<커밋> node scripts/check-live-version.mjs
 *   node scripts/check-live-version.mjs            (기대값 없으면 지금 서빙 중인 판만 알려 준다)
 */
const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const URL_ = `${BASE}/apps/karmolab/build.json`;
const expected = (process.env.EXPECTED_SHA || '').trim();
const TRIES = Number(process.env.TRIES || 10);
const WAIT_MS = Number(process.env.WAIT_MS || 30000);

const short = (s) => (s || '').slice(0, 8) || '(없음)';

async function read() {
  // 캐시가 옛 답을 주면 이 검사 자체가 거짓말이 된다 — 매번 다른 주소로 묻는다.
  const res = await fetch(`${URL_}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return { err: `http ${res.status}` };
  try {
    return { data: await res.json() };
  } catch {
    return { err: '표식 파일이 JSON 이 아니다 — 배포가 엉뚱한 것을 올렸다' };
  }
}

/**
 * **갈아 끼우는 중인 사이트는 재지 않는다** (2026-08-12 실측으로 붙임).
 *
 * 세션 여섯이 미는 시간대에는 배포가 1~2분 간격으로 난다. 그 사이에 실주소를 열면 새 판과
 * 옛 판의 조각이 섞인 화면을 보게 되고, 뒤따르는 검사들이 「칸이 없다」로 시간 초과가 난다 —
 * 오늘 라이브 점검 빨강 4건 중 2건이 그것이었다(같은 자리를 직접 찔러 보니 멀쩡했다).
 *
 * 그래서 검사에 들어가기 전에 **판이 잠잠해질 때까지** 기다린다: 서빙되는 커밋이
 * SETTLE_MS 동안 안 바뀌면 그때 시작한다. 끝내 계속 바뀌면 「지금은 잴 수 없다」로 물러선다
 * (거짓 빨강보다 낫다 — 다음 시계 판이 곧 다시 잰다).
 */
const SETTLE_MS = Number(process.env.SETTLE_MS || 45000);
const SETTLE_GIVEUP_MS = Number(process.env.SETTLE_GIVEUP_MS || 240000);

async function settle() {
  const until = Date.now() + SETTLE_GIVEUP_MS;
  let mark = null;
  let since = 0;
  while (Date.now() < until) {
    const { data } = await read();
    const now = data?.commit || null;
    if (now && now === mark) {
      if (Date.now() - since >= SETTLE_MS) {
        console.log(`[check-live-version] 판이 잠잠하다 — ${short(mark)} 가 ${Math.round(SETTLE_MS / 1000)}초째 그대로다. 검사 시작.`);
        return 0;
      }
    } else if (now) {
      if (mark) console.log(`  판이 바뀌었다 ${short(mark)} → ${short(now)} — 잠잠해질 때까지 다시 센다`);
      mark = now;
      since = Date.now();
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log(`[check-live-version] 배포가 계속 이어져 잠잠해지지 않는다 — 지금은 재지 않는다(다음 시계 판이 잰다).`);
  return 0;
}

async function main() {
  let last = null;
  for (let i = 1; i <= TRIES; i += 1) {
    const { data, err } = await read();
    last = err || null;
    if (data) {
      if (!expected) {
        console.log(`[check-live-version] 지금 서빙 중 — 커밋 ${short(data.commit)} · 구운 시각 ${data.builtAt}`);
        return settle();
      }
      if (data.commit === expected) {
        console.log(`[check-live-version] 닿았다 — ${short(expected)} 가 실제로 서빙된다 (${i}번째 확인)`);
        return settle();
      }
      last = `서빙 중인 판은 ${short(data.commit)} 인데 기대한 것은 ${short(expected)}`;
    }
    if (i < TRIES) {
      console.log(`  ${i}/${TRIES} 아직이다 (${last}) — ${WAIT_MS / 1000}초 뒤 다시 묻는다`);
      await new Promise((r) => setTimeout(r, WAIT_MS));
    }
  }
  console.error(`[check-live-version] 올렸는데 사람 화면에는 안 닿았다 — ${last}`);
  console.error(`  확인한 곳: ${URL_}`);
  return 1;
}

/* 윈도우에서 process.exit 를 부르면 아직 정리 안 된 통신 핸들 때문에 노드가 죽으며
   엉뚱한 종료 코드를 낸다 — 검사 결과가 그 코드에 실려 나가므로 코드만 정하고 곱게 끝낸다. */
process.exitCode = await main();
