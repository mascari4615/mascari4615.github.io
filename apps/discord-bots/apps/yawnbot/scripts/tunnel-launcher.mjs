/**
 * Cloudflare Quick Tunnel + GitHub webhook 자동 갱신 (dev 한정).
 *
 * 동작:
 *   1. cloudflared tunnel --url http://localhost:<port> 자식 프로세스로 실행
 *   2. 출력에서 https://*.trycloudflare.com URL 추출
 *   3. upsertHooks(webhookUrl) 로 모든 githubRepos 에 webhook PATCH/POST
 *
 * production 은 named tunnel + scripts/webhook-upsert.mjs (TASK-YB-005).
 *
 * 환경변수:
 *   WEBHOOK_PORT (기본 4615)
 *
 * 실행:
 *   npm run tunnel        — 터널만 (봇은 별도 터미널)
 *   npm run dev           — --with-bot 옵션으로 npm run dev:bot 까지 spawn (통합)
 */
import { spawn } from 'node:child_process';
import process from 'node:process';
import { ensureGh, upsertHooks } from './webhook-upsert.mjs';

const PORT = process.env.WEBHOOK_PORT || '4615';
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

const withBot = process.argv.slice(2).includes('--with-bot');

ensureGh();

const children = [];

if (withBot) {
  console.log('[Tunnel] --with-bot — npm run dev:bot 동시 시작');
  const bot = spawn('npm', ['run', 'dev:bot'], { stdio: 'inherit', shell: true });
  children.push(bot);
  bot.on('exit', (code) => {
    console.log(`[Tunnel] 봇 프로세스 종료 (code=${code}) — cloudflared 정리`);
    for (const c of children) if (c !== bot && c.killed === false) c.kill('SIGINT');
    process.exit(code ?? 0);
  });
}

console.log(`[Tunnel] cloudflared quick tunnel 시작 (localhost:${PORT})`);

const cf = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
children.push(cf);

let updated = false;
function handleChunk(chunk) {
  const text = chunk.toString();
  process.stderr.write(text);
  if (updated) return;
  const m = text.match(URL_RE);
  if (m === null) return;

  updated = true;
  const tunnelBase = m[0];
  const webhookUrl = `${tunnelBase}/webhook/github`;
  console.log(`\n[Tunnel] 발급된 URL: ${tunnelBase}`);
  upsertHooks(webhookUrl);
  const tail = withBot
    ? '봇은 같은 창에서 떠 있습니다.'
    : '이 창은 켜둔 채로 봇을 별도 터미널에서 실행하세요.';
  console.log(`\n[Tunnel] webhook 동기화 완료. ${tail}\n`);
}

cf.stdout.on('data', handleChunk);
cf.stderr.on('data', handleChunk);

cf.on('exit', (code) => {
  console.log(`[Tunnel] cloudflared 종료 (code=${code})`);
  for (const c of children) if (c !== cf && c.killed === false) c.kill('SIGINT');
  process.exit(code ?? 0);
});

const forwardSignal = (sig) => () => {
  for (const c of children) if (c.killed === false) c.kill(sig);
};
process.on('SIGINT', forwardSignal('SIGINT'));
process.on('SIGTERM', forwardSignal('SIGTERM'));
