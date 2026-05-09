/**
 * GitHub webhook upsert — data/webhook-routes.json 의 githubRepos 각각에
 * yawnbot webhook (config.url 끝이 /webhook/github) 을 PATCH (URL 갱신) 또는 POST (신규).
 *
 * standalone:
 *   node scripts/webhook-upsert.mjs
 *
 * 라이브러리:
 *   import { upsertHooks } from './webhook-upsert.mjs'
 *   upsertHooks('https://example.com/webhook/github')
 *
 * 환경변수:
 *   YAWNBOT_WEBHOOK_URL (default: https://yawnbot.mascari4615.com/webhook/github)
 *
 * 사전 요구:
 *   gh CLI 로그인 (gh auth status)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTES_PATH = path.resolve(__dirname, '..', 'data', 'webhook-routes.json');
const HOOK_PATH = '/webhook/github';
const DEFAULT_URL = 'https://yawnbot.mascari4615.com/webhook/github';
const EVENTS = ['push', 'pull_request', 'release', 'issues'];

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf-8' });
}

export function ensureGh() {
  try {
    gh(['auth', 'status']);
  } catch {
    console.error('[webhook-upsert] gh CLI 미설치 또는 미로그인 — npm run setup:env 를 실행해주세요.');
    process.exit(1);
  }
}

export function loadRepos() {
  const parsed = JSON.parse(readFileSync(ROUTES_PATH, 'utf-8'));
  const repos = Array.isArray(parsed.githubRepos) ? parsed.githubRepos : [];
  if (repos.length === 0) {
    console.error('[webhook-upsert] data/webhook-routes.json 의 githubRepos 가 비어 있습니다.');
    process.exit(1);
  }
  return repos;
}

function listHooks(repo) {
  return JSON.parse(gh(['api', `repos/${repo}/hooks`, '--paginate']));
}

export function upsertHook(repo, webhookUrl) {
  let hooks;
  try {
    hooks = listHooks(repo);
  } catch (e) {
    console.error(`[webhook-upsert] ${repo}: hook 목록 조회 실패 — ${e.message}`);
    return;
  }
  const existing = hooks.find(
    (h) => typeof h?.config?.url === 'string' && h.config.url.endsWith(HOOK_PATH),
  );

  if (existing) {
    if (existing.config.url === webhookUrl) {
      console.log(`[webhook-upsert] ${repo}: hook URL 동일 — 갱신 생략`);
      return;
    }
    try {
      gh([
        'api',
        `repos/${repo}/hooks/${existing.id}`,
        '-X',
        'PATCH',
        '-f',
        `config[url]=${webhookUrl}`,
        '-f',
        'config[content_type]=json',
      ]);
      console.log(`[webhook-upsert] ${repo}: hook ${existing.id} 갱신 → ${webhookUrl}`);
    } catch (e) {
      console.error(`[webhook-upsert] ${repo}: hook 갱신 실패 — ${e.message}`);
    }
    return;
  }

  const args = [
    'api',
    `repos/${repo}/hooks`,
    '-X',
    'POST',
    '-f',
    'name=web',
    '-F',
    'active=true',
    '-f',
    `config[url]=${webhookUrl}`,
    '-f',
    'config[content_type]=json',
  ];
  for (const ev of EVENTS) {
    args.push('-f', `events[]=${ev}`);
  }
  try {
    gh(args);
    console.log(`[webhook-upsert] ${repo}: hook 신규 생성 → ${webhookUrl}`);
  } catch (e) {
    console.error(`[webhook-upsert] ${repo}: hook 생성 실패 — ${e.message}`);
  }
}

export function upsertHooks(webhookUrl) {
  ensureGh();
  const repos = loadRepos();
  console.log(`[webhook-upsert] ${repos.length} repo 에 webhook upsert → ${webhookUrl}`);
  for (const repo of repos) upsertHook(repo, webhookUrl);
}

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('webhook-upsert.mjs');
if (isMain) {
  const webhookUrl = process.env.YAWNBOT_WEBHOOK_URL || DEFAULT_URL;
  upsertHooks(webhookUrl);
}
