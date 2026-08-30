/**
 * 지금 뜬 사이트가 최신 판인가 (2026-08-29)
 *
 * 왜 있나. 2026-08-29 pages-deploy 세 판 연속 빨강, 그동안 `audit-live-essentials` 는 16/16 초록
 *   - 그 검사가 재는 것은 있어야 할 것이 있는가. 사이트가 며칠 묵어도 요소는 다 있음
 *   - 그래서 라이브가 낡은 줄 아무도 모름. 사이트맵 고쳐 밀어 놓고 왜 안 나오나로 헤맴
 *
 * 무엇을 재나. 라이브 `/build.json` 의 커밋 sha 와 지금 체크아웃 끝의 거리
 *   - 산출은 몇 커밋 뒤, 몇 시간 묵음. 배포가 죽어 있으면 자람
 *
 * 판정
 *   - 뒤처짐 0 이면 통과
 *   - 뒤처졌어도 `MAX_AGE_HOURS`(기본 3) 안이면 통과. 배포 진행 중일 수 있음
 *   - 그보다 오래면 실패. 그 시간이면 배포가 끝났어야 함
 *   - `/build.json` 없으면 못 돌림(2). 이 판이 아직 안 나간 것이지 실패 아님
 *
 * 사용: `BASE=https://blog.mascari4615.com node scripts/audit-live-fresh.mjs`
 */
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const MAX_AGE_HOURS = Number(process.env.MAX_AGE_HOURS || 3);

/* ★ fetch 뒤 `process.exit()` 금지. 윈도우 node 에서 libuv `UV_HANDLE_CLOSING`, 종료 코드 127
   (2026-08-29 실측). 게이트가 읽는 못 돌림은 2 이고 127 은 뜻 없음. 코드만 정하고 자연 종료 */
const done = (code, line) => {
  if (code === 0) console.log(line);
  else console.error(line);
  process.exitCode = code;
};

if (!BASE.startsWith('https://')) {
  console.log(`[audit-live-fresh] CANNOT-RUN. 실제 사이트가 아니다 (BASE=${BASE}).`);
  process.exit(2);
}

const res = await fetch(`${BASE}/build.json`, { headers: { 'cache-control': 'no-cache' } });

if (res.status === 404) {
  /* 이 검사를 넣은 판이 아직 안 나감. 없는 것을 실패로 부르면 첫 배포가 막힘 */
  done(2, '[audit-live-fresh] CANNOT-RUN. 라이브에 /build.json 이 없다. 이 검사를 넣은 판이 아직 안 나갔다.');
} else if (!res.ok) {
  done(1, `[audit-live-fresh] X /build.json 을 못 읽었다 (http ${res.status})`);
} else {
  judge(await res.json());
}

function judge(live) {
  if (!live.sha) {
    done(1, '[audit-live-fresh] X /build.json 에 sha 가 비어 있다. 조립기가 sha 를 못 넣었다.');
    return;
  }

  /* 얕은 체크아웃 — 라이브 sha 자체를 모를 수 있음. 모름은 실패 아니라 못 돌림 */
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  let behind;
  try {
    git('cat-file', '-e', `${live.sha}^{commit}`);
    behind = Number(git('rev-list', '--count', `${live.sha}..HEAD`));
  } catch {
    done(2, `[audit-live-fresh] CANNOT-RUN. 라이브 sha ${live.sha.slice(0, 8)} 를 이 체크아웃에서 못 찾는다 (얕은 클론).`);
    return;
  }

  const ageHours = (Date.now() - Date.parse(live.builtAt)) / 3600000;
  const age = ageHours.toFixed(1);
  const short = live.sha.slice(0, 8);

  if (behind === 0) {
    done(0, `[audit-live-fresh] 라이브가 최신이다. ${short}, 구운 지 ${age}시간`);
  } else if (ageHours <= MAX_AGE_HOURS) {
    done(0, `[audit-live-fresh] 라이브가 ${behind}커밋 뒤지만 구운 지 ${age}시간이라 배포 중일 수 있다. 통과 (${short})`);
  } else {
    done(
      1,
      `[audit-live-fresh] X 라이브가 낡았다. ${behind}커밋 뒤, 구운 지 ${age}시간 (${short}).` +
        '\n  배포가 죽어 있을 가능성이 크다. `gh run list --workflow pages-deploy.yml` 로 확인해라.'
    );
  }
}
