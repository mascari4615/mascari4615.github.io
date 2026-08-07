/**
 * 앱 셸로 도구 페이지를 **지금 찍을 수 있는지** 본다 (TASK-KL-097)
 *
 * 도구 상세 127장 + 목록 한 장은 `index.html`(앱 셸)에서 배포 때 만들어진다. 결과물은
 * 저장소에 안 들어간다(gitignore) — 그래서 셸을 고쳐도 로컬에서는 아무 일도 안 일어나고,
 * **배포에 가서야** 터진다. 실제로 오늘 두 번 터졌다:
 *   ① 인트로를 고치며 큰제목 태그에 id 를 붙였더니 생성기가 「큰제목을 못 찾음」으로 죽었다.
 *      그 뒤 세 시간 동안 밀어넣은 것이 하나도 안 나갔다.
 *   ② 셸이 암호 라이브러리를 지연 로드로 바꾸자 「태그를 못 찾음」으로 또 죽었다.
 * 둘 다 셸을 고친 사람은 몰랐다. 생성기를 돌려 볼 이유가 없었기 때문이다.
 *
 * 그래서 이 검사는 **임시 자리에 실제로 찍어 본다**. 저장소에 있는 결과물과 대조하지 않는다 —
 * 그건 gitignore 라 CI 에는 아예 없고, 있어도 「낡았다」는 사실은 배포가 알아서 지운다.
 * 여기서 볼 것은 하나다: 지금 셸로 찍는 일이 성립하는가.
 *
 * 사용: node scripts/audit-tool-pages-fresh.mjs  (npm run audit:pages)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'karmolab-pages-'));
const out = path.join(tmp, 't');

let stdout = '';
try {
  stdout = execFileSync(process.execPath, [path.join(root, 'scripts/gen-tool-pages.mjs'), '--out', out], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    // 검사가 기록 파일을 건드리면 그건 검사가 아니다 — 다음 검사가 그 기록으로 통과해 버린다.
    env: { ...process.env, KARMOLAB_GEN_NO_STATE: '1' },
  });
} catch (e) {
  console.error('[audit-tool-pages] 지금 셸로는 도구 페이지를 못 찍는다 — 이대로 밀어넣으면 배포가 멈춘다.\n');
  console.error(String(e.stderr || e.stdout || e.message).trim().split('\n').slice(0, 12).join('\n'));
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

/** 조용히 반쪽만 찍히는 경우를 막는다 — 「돌긴 돌았다」는 통과 조건이 아니다. */
const pages = fs.existsSync(out)
  ? fs.readdirSync(out).filter((n) => fs.existsSync(path.join(out, n, 'index.html'))).length
  : 0;
const hub = fs.existsSync(path.join(out, 'index.html'));
fs.rmSync(tmp, { recursive: true, force: true });

if (!hub || pages < 50) {
  console.error(`[audit-tool-pages] 찍히긴 했는데 결과가 이상하다 — 도구 ${pages}장 · 목록 ${hub ? '있음' : '없음'}`);
  console.error(stdout.trim().split('\n').slice(-5).join('\n'));
  process.exit(1);
}
console.log(`[audit-tool-pages] 지금 셸로 도구 ${pages}장 + 목록을 찍을 수 있다`);
