/**
 * **남이 설치해서 쓸 수 있는가** — 실제로 담아 보고, 풀어서, 불러 본다 (TASK-KL-205)
 *
 * `smoke-mcp.mjs` 는 저장소 안에서 서버를 띄운다. 그건 「우리 컴퓨터에서 된다」까지다.
 * 남이 쓰는 길은 다르다 — `npm install` 로 받은 **꾸러미 안의 파일만** 가지고 돌아야 한다.
 * 꾸러미에 빠진 파일이 하나라도 있으면 우리 쪽은 멀쩡하고 남의 쪽만 죽는다. 그건 안 보인다.
 *
 * 그래서 여기서는:
 *   ① `npm pack` 으로 진짜 꾸러미를 만들고
 *   ② **빈 폴더**에 설치하고 (저장소 밖 — 우리 파일에 기댈 수 없다)
 *   ③ 설치된 것만으로 서버를 띄워 값을 받아 본다
 *
 * 사용: node scripts/smoke-mcp-install.mjs
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkgDir = path.resolve(root, '../../packages/karmolab-mcp');

const failures = [];
const check = (ok, why) => {
  process.stdout.write(ok ? '.' : 'x');
  if (ok === false) failures.push(why);
};

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'karmolab-mcp-install-'));
const isWin = process.platform === 'win32';
/* 윈도우에서 `npm.cmd` 는 `shell: true` 없이는 못 부른다 (Node 20 보안 변경, EINVAL).
   `shell: true` 를 켜면 인자가 셸을 거치므로 경로에 공백이 있으면 따옴표로 감싼다. */
const npm = isWin ? 'npm.cmd' : 'npm';
const q = (v) => (isWin ? `"${v}"` : v);
const runNpm = (args, cwd) => execFileSync(npm, args, { cwd, encoding: 'utf8', stdio: 'pipe', windowsHide: true, shell: isWin });
let child;

try {
  // ① 담기 — prepublishOnly 를 태우지 않는다(그건 발행 때 도는 것이고, 여기선 지금 상태를 본다).
  runNpm(['run', 'build'], pkgDir);
  const out = runNpm(['pack', '--pack-destination', q(work)], pkgDir);
  const tgz = out.trim().split('\n').pop().trim();
  check(fs.existsSync(path.join(work, tgz)), `꾸러미가 안 만들어졌다: ${tgz}`);

  // ② 빈 폴더에 설치 — 저장소 밖이라 우리 파일에 기댈 수 없다.
  fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ name: 'install-test', private: true }) + '\n');
  runNpm(['install', q('./' + tgz)], work);
  const installed = path.join(work, 'node_modules', 'karmolab-mcp', 'src', 'server.mjs');
  check(fs.existsSync(installed), '설치본에 server.mjs 가 없다');
  const distDir = path.join(work, 'node_modules', 'karmolab-mcp', 'dist');
  check(fs.existsSync(distDir), '설치본에 dist 가 없다 — files 목록에서 빠졌을 수 있다');
  const cores = fs.existsSync(distDir) ? fs.readdirSync(distDir).filter((f) => f.endsWith('.mjs')).length : 0;
  const sourceCores = fs
    .readdirSync(path.join(root, 'src/core'))
    .filter((f) => f.endsWith('.ts') && /export const spec/.test(fs.readFileSync(path.join(root, 'src/core', f), 'utf8')));
  check(
    cores === sourceCores.length,
    `설치본 알맹이 ${cores}개 ≠ 원본 ${sourceCores.length}개 — 빌드가 덜 담겼다`
  );

  /*
   * 발행 뒤에나 드러나는 것들을 **여기서** 잡는다 (14-mcp-launch-kit § 7 을 손 확인에서 게이트로).
   * 셋 다 우리 저장소에서는 멀쩡히 보이고, tarball 에서만 빠진다 — 그래서 눈으로는 절대 안 걸린다.
   */
  const inPkg = (...seg) => path.join(work, 'node_modules', 'karmolab-mcp', ...seg);

  // ⓐ 라이선스 — 없으면 발행물이 「저작권 불명」이 된다. `files` 에서 빠지면 조용히 사라진다.
  check(fs.existsSync(inPkg('LICENSE')), '설치본에 LICENSE 가 없다 — package.json 의 files 에서 빠졌다');
  const license = fs.existsSync(inPkg('LICENSE')) ? fs.readFileSync(inPkg('LICENSE'), 'utf8') : '';
  check(/MIT/.test(license), 'LICENSE 가 MIT 가 아니다');
  check(
    /Cotes Chung/.test(license) === false,
    'LICENSE 가 Chirpy 테마 것이다 — 루트 LICENSE 를 잘못 담았다'
  );

  // ⓑ README — npm 페이지에 뜨는 그 글이다. 없으면 빈 페이지로 발행된다.
  check(fs.existsSync(inPkg('README.md')), '설치본에 README.md 가 없다 — npm 페이지가 비어서 나간다');

  // ⓒ manifest — 서버가 도구를 여기서 읽는다. 이게 빠지면 서버는 뜨는데 도구가 0개다.
  const manifestPath = inPkg('dist', 'manifest.json');
  check(fs.existsSync(manifestPath), '설치본에 dist/manifest.json 이 없다 — 서버가 도구를 못 찾는다');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { tools: [] };
  check(
    manifest.tools.length === cores,
    `manifest 는 ${manifest.tools.length}개인데 담긴 알맹이는 ${cores}개 — 갈렸다`
  );

  // ⓓ 발행 때 빌드가 도는가. 이게 없으면 낡은 dist 가 그대로 발행된다(가장 조용한 사고).
  const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  check(
    /build/.test(pkgJson.scripts?.prepublishOnly ?? ''),
    'prepublishOnly 가 빌드를 안 한다 — 낡은 dist 가 발행될 수 있다'
  );

  // ③ 설치된 것만으로 띄워서 실제로 물어본다.
  child = spawn(process.execPath, [installed], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let buf = '';
  const seen = new Map();
  child.stdout.on('data', (c) => {
    buf += c.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line !== '') {
        const m = JSON.parse(line);
        seen.set(m.id, m);
      }
    }
  });
  const send = (o) => child.stdin.write(JSON.stringify(o) + '\n');
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'install-test', version: '0' } } });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'hashgen_text', arguments: { text: 'KarmoLab', algo: 'SHA256' } } });

  const deadline = Date.now() + 15000;
  while (seen.size < 3 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));

  check(seen.get(1)?.result?.serverInfo?.name === 'karmolab', '설치본이 initialize 에 답하지 않았다');
  const tools = seen.get(2)?.result?.tools ?? [];
  check(tools.length >= 40, `설치본 도구가 ${tools.length}개뿐`);
  // 설명문은 목록에서 도구를 **고르게** 하는 자리다. 한국어만이면 영어권에서 안 걸린다.
  const koOnly = tools.filter((t) => /^[가-힣]/.test((t.description ?? '').trim()));
  check(koOnly.length === 0, `설명문이 한국어로만 시작하는 도구 ${koOnly.length}개: ${koOnly.map((t) => t.name).join(' ')}`);
  const crypto = await import('node:crypto');
  const want = crypto.createHash('sha256').update('KarmoLab').digest('hex');
  check(seen.get(3)?.result?.content?.[0]?.text === want, '설치본이 낸 해시가 OpenSSL 과 다르다');
} finally {
  if (child !== undefined) child.stdin.end();
  fs.rmSync(work, { recursive: true, force: true });
}

process.stdout.write('\n');
if (failures.length > 0) {
  console.error(`\n[smoke-mcp-install] ${failures.length}건 실패:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('[smoke-mcp-install] 빈 폴더에 설치 → 그것만으로 서버가 뜨고 값이 맞다');
