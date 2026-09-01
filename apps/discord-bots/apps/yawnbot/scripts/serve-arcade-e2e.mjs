/**
 * 검사용 오락실 서버. 진짜 라우트, 가짜 신원 (사용자 2026-09-01: 사람 손 없이)
 *
 * 등급전을 끝까지 재려면 창 둘과 서버가 있어야 한다. 여태 그 실측은 계정 둘이 든다는
 * 이유로 사람 몫이었고, 그래서 **한 번도 안 돌았음**. 안 도는 검사는 없는 검사
 *
 * 여기서 띄우는 것은 **진짜 라우트 그대로**다. 대기열, 결과 보고, 패보, 점수.
 * 가짜인 것은 신원 하나뿐. `x-e2e-user` 머리에 적힌 글자가 곧 그 사람
 * 진짜 로그인을 흉내 내면 그 흉내가 틀렸을 때 검사만 초록, 서비스는 죽음
 *
 * 장부는 임시 자리. 진짜 점수 장부를 검사가 건드리면 안 됨
 *
 * `node scripts/serve-arcade-e2e.mjs [--port 4699]`
 */
import { build } from 'esbuild';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, '..');
const args = process.argv.slice(2);
const at = args.indexOf('--port');
const PORT = at >= 0 ? Number(args[at + 1]) : 4699;

/* 검사 장부. 진짜 것과 같은 자리를 쓰면 이 검사가 사람들 점수를 흔든다 */
const box = fs.mkdtempSync(path.join(os.tmpdir(), 'arcade-e2e-'));
process.env.ARCADE_RATING_FILE = path.join(box, 'ratings.json');
process.env.ARCADE_PAIR_FILE = path.join(box, 'pairs.json');

/* 묶음은 이 꾸러미 안에 둔다. 임시 자리에 두면 express 를 못 찾는다(실측) */
const out = path.join(PKG, 'data', 'arcade-e2e-routes.cjs');
await build({
  entryPoints: [path.join(PKG, 'src/bot/arcade-e2e-entry.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  outfile: out,
  logLevel: 'silent',
  external: ['express', 'discord.js']
});
const { registerForE2E } = createRequire(import.meta.url)(out);

const app = express();
/* 창 둘이 서로 다른 사람이어야 한다. 그 구분은 머리 한 줄로 */
const who = (req) => {
  const id = String(req.headers['x-e2e-user'] ?? '').trim();
  return id ? { id, handle: id } : null;
};
registerForE2E(app, who);

app.get('/kl/e2e/ping', (_req, res) => res.json({ ok: true, box }));

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`[e2e-server] 떴다 http://127.0.0.1:${PORT} (장부 ${box})`);
});

const bye = () => {
  server.close(() => {
    fs.rmSync(box, { recursive: true, force: true });
    process.exit(0);
  });
};
process.on('SIGINT', bye);
process.on('SIGTERM', bye);
process.on('message', (m) => { if (m === 'stop') bye(); });
