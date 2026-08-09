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
  check(cores >= 20, `설치본 알맹이가 ${cores}개뿐 — 빌드가 덜 담겼다`);

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
