/**
 * 배포가 뒤처진 화면을 보고 빨개진 것을 빨강으로 적지 않는지. 실제 사고의 회귀 검사.
 *
 * 2026-08-17: 실주소 검사가 달리 부르는 이름이 없다. tts, printkit, nettool, protobuf로 빨갰다.
 * 넷 다 **이미 저장소에 적혀 있었고**, 화면만 그 커밋 이전 판이었다. 3분 뒤 다시 재도 같은 옛 판이라
 * 진짜 빨강으로 적혔다. 못 본 것을 봤다고 적은 것이다. 이제 그런 답은 2(못 돌림)로 내린다.
 *
 * ★ 판을 알려 주는 서버는 **딴 프로세스**로 띄운다. 껍데기를 spawnSync 로 부르는 동안
 *   이 프로세스의 일감줄이 멎어, 같은 프로세스 안 서버는 아이의 물음에 영영 답을 못 한다
 *   (그렇게 짜서 한 판을 통째로 매달아 봤다).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const shell = path.join(here, 'retry-if-redeployed.mjs');
const temp = mkdtempSync(path.join(os.tmpdir(), 'rir-'));

/* 시늉 명령은 파일로 둔다. `node -e "..."` 는 윈도우 shell 을 거치며 괄호에서 깨진다. */
const stub = path.join(temp, 'exit.js');
writeFileSync(stub, 'process.exit(Number(process.env.RIR_TEST_CODE || 0));');

const serverFile = path.join(temp, 'stamp-server.js');
writeFileSync(
  serverFile,
  `const {createServer}=require('http');
   const s=createServer((q,r)=>{r.writeHead(200,{'content-type':'application/json'});
     r.end(JSON.stringify({commit:process.env.STAMP_COMMIT}));});
   s.listen(0,'127.0.0.1',()=>console.log('port='+s.address().port));`
);

const servedBuild = 'aaaaaaaa1111111111111111111111111111aaaa';
let serverProc;
let url2;

before(async () => {
  serverProc = spawn(process.execPath, [serverFile], { env: { ...process.env, STAMP_COMMIT: servedBuild } });
  url2 = await new Promise((r) => serverProc.stdout.on('data', (b) => {
    const m = /port=(\d+)/.exec(String(b));
    if (m) r(`http://127.0.0.1:${m[1]}`);
  }));
});
after(() => serverProc.kill());

function run({ sha, verdict }) {
  const r = spawnSync(process.execPath, [shell, process.execPath, stub], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BASE: url2,
      GITHUB_SHA: sha,
      RIR_SETTLE_MAX_MS: '400',
      RIR_SETTLE_STABLE_MS: '50',
      RIR_TEST_CODE: String(verdict),
    },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

test('화면이 내 판보다 옛것이면 빨강이 아니라 못 돌림(2)', () => {
  const { code, out } = run({ sha: 'bbbbbbbb2222222222222222222222222222bbbb', verdict: 1 });
  assert.equal(code, 2, out);
  assert.match(out, /못 돌림/);
  assert.doesNotMatch(out, /진짜 빨강/);
});

test('화면이 바로 내 판이면 빨강은 빨강 그대로(1)', () => {
  const { code, out } = run({ sha: servedBuild, verdict: 1 });
  assert.equal(code, 1, out);
  assert.match(out, /진짜 빨강/);
});

test('못 돌림(2)은 옛 판이어도 그대로 2. 다시 재지 않는다', () => {
  const { code, out } = run({ sha: 'eeeeeeee5555555555555555555555555555eeee', verdict: 2 });
  assert.equal(code, 2, out);
  assert.doesNotMatch(out, /다시 잰다/);
});

test('초록은 옛 판이어도 초록. 실주소가 성하다는 건 그 자체로 사실이다', () => {
  const { code, out } = run({ sha: '999999997777777777777777777777777777aaaa', verdict: 0 });
  assert.equal(code, 0, out);
});
