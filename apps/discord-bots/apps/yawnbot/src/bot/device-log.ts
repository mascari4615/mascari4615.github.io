/**
 * 기기(폰) 실행 로그 수신·조회 HTTP (TASK-WM-201).
 *
 * 폰의 WM 이 `POST /device-log` 로 배치를 밀어 넣으면
 *   ① NDJSON 파일로 쌓고 (services/device-log-store)
 *   ② 에러급이면 디스코드로 알리고 (같은 에러 반복은 접음)
 *   ③ 사람은 `GET /device-log` 웹 화면, AI 는 `GET /device-log/tail` 평문으로 읽는다.
 *
 * 인증: `DEVICE_LOG_TOKEN` (없으면 `LOCAL_WEBHOOK_SECRET` 재사용). 헤더
 * `X-Yawnbot-Secret` 또는 쿼리 `?t=` — 쿼리를 허용하는 이유는 *폰 브라우저 북마크*
 * 하나로 로그를 볼 수 있어야 하기 때문(사용자 작업량 최소화). 토큰 미설정 시엔
 * dev 모드로 열되 경고를 남긴다 (local-webhook 과 같은 신뢰 모델).
 *
 * 저장 위치: `data/device-logs/` (런타임 산출물 — gitignore 대상).
 */
import fs from 'fs';
import path from 'path';
import type { Application, Request, Response } from 'express';
import type { Client } from 'discord.js';

import { PKG_ROOT } from '../paths';
import { sendLocalEvent } from './local-webhook';
import {
  DEFAULT_LIMITS,
  appendBatch,
  errorFingerprint,
  isErrorLevel,
  listSessions,
  parseBatch,
  pruneSessions,
  resolveSession,
  tailSession,
  type DeviceLogLine,
} from '../services/device-log-store';

/** 알림·하트비트 주기 (전부 env 로 조절 가능 — 하드코딩 금지). */
const NOTIFY_KIND = 'wm-device-log';
const FINGERPRINT_COOLDOWN_MS = numEnv('DEVICE_LOG_NOTIFY_COOLDOWN_MS', 10 * 60 * 1000);
const NOTIFY_MAX_PER_WINDOW = numEnv('DEVICE_LOG_NOTIFY_MAX_PER_WINDOW', 6);
const NOTIFY_WINDOW_MS = numEnv('DEVICE_LOG_NOTIFY_WINDOW_MS', 60 * 1000);
const HEARTBEAT_MS = numEnv('DEVICE_LOG_HEARTBEAT_MS', 10 * 60 * 1000);
const PRUNE_MS = numEnv('DEVICE_LOG_PRUNE_MS', 6 * 60 * 60 * 1000);
const TAIL_DEFAULT = numEnv('DEVICE_LOG_TAIL_DEFAULT', 200);
const TAIL_MAX = numEnv('DEVICE_LOG_TAIL_MAX', 5000);

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function deviceLogDir(): string {
  return process.env.DEVICE_LOG_DIR?.trim() || path.join(PKG_ROOT, 'data', 'device-logs');
}

function expectedToken(): string {
  return (process.env.DEVICE_LOG_TOKEN?.trim() || process.env.LOCAL_WEBHOOK_SECRET?.trim() || '');
}

function authorized(req: Request): boolean {
  const token = expectedToken();
  if (!token) return true; // dev 모드 (부팅 시 경고 1회)
  const header = req.headers['x-yawnbot-secret'];
  if (typeof header === 'string' && header === token) return true;
  const query = req.query?.t;
  return typeof query === 'string' && query === token;
}

/** 알림 접기 상태 — 프로세스 수명 동안만 (재시작하면 다시 알린다 = 의도). */
interface NotifyState {
  lastByFingerprint: Map<string, number>;
  windowStart: number;
  sentInWindow: number;
}

/** 하트비트용 누적 (조용해도 살아있음을 로그로 증명 — no-news is bad-news 룰). */
interface Counters {
  batches: number;
  lines: number;
  errors: number;
  rejected: number;
  lastAt: number | null;
}

export function mountDeviceLog(app: Application, client: Client | null): void {
  const dir = deviceLogDir();
  fs.mkdirSync(dir, { recursive: true });

  const notify: NotifyState = { lastByFingerprint: new Map(), windowStart: Date.now(), sentInWindow: 0 };
  const counters: Counters = { batches: 0, lines: 0, errors: 0, rejected: 0, lastAt: null };

  app.post('/device-log', async (req: Request, res: Response) => {
    if (!authorized(req)) {
      counters.rejected++;
      res.sendStatus(401);
      return;
    }
    const parsed = parseBatch(req.body);
    if (!parsed.batch) {
      counters.rejected++;
      res.status(400).json({ error: parsed.error });
      return;
    }
    try {
      const result = appendBatch(dir, parsed.batch);
      counters.batches++;
      counters.lines += result.written;
      counters.lastAt = Date.now();

      const errorLines = parsed.batch.lines.filter((l) => isErrorLevel(l.level));
      counters.errors += errorLines.length;
      if (client && errorLines.length > 0) {
        void notifyErrors(client, notify, parsed.batch.session, parsed.batch, errorLines).catch((e) =>
          console.error('[DeviceLog] 알림 실패:', e instanceof Error ? e.message : String(e)),
        );
      }

      res.json({
        ok: true,
        accepted: result.written,
        dropped: parsed.dropped,
        full: result.full,
        // 폰이 「그만 보내라」를 알 수 있게 (세션 파일 상한 도달 시).
        stop: result.full,
      });
    } catch (e: unknown) {
      console.error('[DeviceLog] 저장 실패:', e instanceof Error ? e.message : String(e));
      res.sendStatus(500);
    }
  });

  app.get('/device-log/sessions', (req: Request, res: Response) => {
    if (!authorized(req)) {
      res.sendStatus(401);
      return;
    }
    res.json({ sessions: listSessions(dir) });
  });

  app.get('/device-log/tail', (req: Request, res: Response) => {
    if (!authorized(req)) {
      res.sendStatus(401);
      return;
    }
    const session = resolveSession(dir, typeof req.query.session === 'string' ? req.query.session : 'latest');
    if (!session) {
      res.status(404).type('text/plain; charset=utf-8').send('세션 없음 — 아직 아무 기기도 로그를 보내지 않았다.\n');
      return;
    }
    const limit = Math.min(TAIL_MAX, Math.max(1, Number(req.query.n) || TAIL_DEFAULT));
    const levels =
      typeof req.query.level === 'string' && req.query.level !== 'all'
        ? req.query.level
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
        : undefined;
    const contains = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim() : undefined;
    const lines = tailSession(dir, session, { limit, levels, contains });

    if (req.query.format === 'json') {
      res.json({ session, count: lines.length, lines });
      return;
    }
    const body = lines.map(formatPlain).join('\n');
    res
      .type('text/plain; charset=utf-8')
      .send(`# session=${session} lines=${lines.length}${levels ? ` level=${levels.join(',')}` : ''}\n${body}\n`);
  });

  app.get('/device-log', (req: Request, res: Response) => {
    if (!authorized(req)) {
      res
        .status(401)
        .type('text/html; charset=utf-8')
        .send('<p>토큰이 필요하다. 주소 끝에 <code>?t=&lt;토큰&gt;</code> 을 붙여라.</p>');
      return;
    }
    const token = typeof req.query.t === 'string' ? req.query.t : '';
    res.type('text/html; charset=utf-8').send(viewerHtml(token));
  });

  const heartbeat = setInterval(() => {
    const quiet = counters.lastAt ? `${Math.round((Date.now() - counters.lastAt) / 1000)}s 전` : '수신 이력 없음';
    console.log(
      `[DeviceLog] 살아있음 — 배치 ${counters.batches} · 줄 ${counters.lines} · 에러 ${counters.errors} · ` +
        `거절 ${counters.rejected} · 마지막 수신 ${quiet} · 세션 ${listSessions(dir).length}개`,
    );
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  const prune = setInterval(() => {
    try {
      const result = pruneSessions(dir, DEFAULT_LIMITS);
      if (result.removed.length > 0) {
        console.log(`[DeviceLog] 정리 — 세션 ${result.removed.length}개 삭제 (${Math.round(result.bytesFreed / 1024)}KB)`);
      }
    } catch (e: unknown) {
      console.warn('[DeviceLog] 정리 실패:', e instanceof Error ? e.message : String(e));
    }
  }, PRUNE_MS);
  prune.unref?.();

  if (!expectedToken()) {
    console.warn(
      '[DeviceLog] DEVICE_LOG_TOKEN·LOCAL_WEBHOOK_SECRET 미설정 — 인증 없이 열림(dev). prod 는 NSSM AppEnvironmentExtra 로 박을 것.',
    );
  }
  console.log(`[DeviceLog] 기기 로그 수신 준비 — ${dir}`);
}

function formatPlain(line: DeviceLogLine): string {
  const time = new Date(line.t).toISOString().replace('T', ' ').slice(0, 23);
  const head = `${time} [${line.level.toUpperCase()}] ${line.msg}`;
  return line.stack ? `${head}\n${line.stack.replace(/^/gm, '    ')}` : head;
}

async function notifyErrors(
  client: Client,
  state: NotifyState,
  session: string,
  batch: { device?: string; platform?: string; build?: string },
  errorLines: DeviceLogLine[],
): Promise<void> {
  const now = Date.now();
  if (now - state.windowStart > NOTIFY_WINDOW_MS) {
    state.windowStart = now;
    state.sentInWindow = 0;
  }
  for (const line of errorLines) {
    if (state.sentInWindow >= NOTIFY_MAX_PER_WINDOW) return;
    const fingerprint = errorFingerprint(line);
    const last = state.lastByFingerprint.get(fingerprint) ?? 0;
    if (now - last < FINGERPRINT_COOLDOWN_MS) continue;
    state.lastByFingerprint.set(fingerprint, now);
    state.sentInWindow++;

    const firstLine = line.msg.split('\n', 1)[0].slice(0, 200);
    const summaryParts = [line.msg.slice(0, 1200)];
    if (line.stack) summaryParts.push('```\n' + line.stack.slice(0, 1200) + '\n```');
    await sendLocalEvent(client, {
      kind: NOTIFY_KIND,
      source: 'wm/device-log-relay',
      level: 'error',
      title: `📱 기기 에러 — ${firstLine}`,
      summary: summaryParts.join('\n'),
      fields: [
        { name: '세션', value: session, inline: true },
        { name: '기기', value: batch.device || '?', inline: true },
        { name: '빌드', value: batch.build || batch.platform || '?', inline: true },
      ],
    });
  }
}

/** 폰·PC 겸용 로그 뷰어. 외부 자원 0 (터널 뒤에서 CDN 못 씀). */
function viewerHtml(token: string): string {
  const tokenJson = JSON.stringify(token);
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WM 기기 로그</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#12131a; color:#e6e6ef; font:13px/1.5 ui-monospace, "Cascadia Mono", Consolas, monospace; }
  header { position:sticky; top:0; background:#191b25; border-bottom:1px solid #2c2f3d; padding:8px 10px; display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
  select, input, button { background:#22242f; color:#e6e6ef; border:1px solid #363a4a; border-radius:6px; padding:6px 8px; font:inherit; }
  button.on { background:#3d6fe0; border-color:#3d6fe0; }
  #meta { margin-left:auto; opacity:.7; font-size:12px; }
  #log { padding:8px 10px; white-space:pre-wrap; word-break:break-word; }
  .l { padding:2px 0; border-bottom:1px solid #1d1f2a; }
  .t { opacity:.45; }
  .lv { font-weight:700; margin:0 6px; }
  .error .lv, .exception .lv, .assert .lv { color:#ff6b6b; }
  .warning .lv { color:#ffb648; }
  .log .lv { color:#7ac0ff; }
  .stack { display:block; opacity:.6; font-size:12px; margin-left:14px; }
</style>
</head>
<body>
<header>
  <select id="session"></select>
  <button id="f-all" class="on">전부</button>
  <button id="f-err">에러만</button>
  <input id="q" placeholder="검색" size="10">
  <button id="auto" class="on">자동 갱신</button>
  <span id="meta">…</span>
</header>
<div id="log">불러오는 중…</div>
<script>
const TOKEN = ${tokenJson};
const qs = (p) => { const u = new URLSearchParams(p); if (TOKEN) u.set('t', TOKEN); return u.toString(); };
let onlyError = false, auto = true;
const el = { log: document.getElementById('log'), meta: document.getElementById('meta'), session: document.getElementById('session'), q: document.getElementById('q') };

document.getElementById('f-all').onclick = (e) => { onlyError = false; e.target.classList.add('on'); document.getElementById('f-err').classList.remove('on'); load(); };
document.getElementById('f-err').onclick = (e) => { onlyError = true; e.target.classList.add('on'); document.getElementById('f-all').classList.remove('on'); load(); };
document.getElementById('auto').onclick = (e) => { auto = !auto; e.target.classList.toggle('on', auto); };
el.q.oninput = () => load();
el.session.onchange = () => load();

async function loadSessions() {
  const res = await fetch('/device-log/sessions?' + qs({}));
  if (!res.ok) { el.meta.textContent = '세션 조회 실패 ' + res.status; return; }
  const data = await res.json();
  const current = el.session.value;
  el.session.innerHTML = data.sessions.map(s =>
    '<option value="' + s.session + '">' + s.session + (s.device ? ' · ' + s.device : '') + '</option>').join('');
  if (current) el.session.value = current;
}

async function load() {
  const session = el.session.value || 'latest';
  const params = { session, n: '400', format: 'json' };
  if (onlyError) params.level = 'error,exception,assert';
  if (el.q.value.trim()) params.q = el.q.value.trim();
  const res = await fetch('/device-log/tail?' + qs(params));
  if (!res.ok) { el.meta.textContent = '조회 실패 ' + res.status; return; }
  const data = await res.json();
  el.log.innerHTML = data.lines.map(line => {
    const time = new Date(line.t).toTimeString().slice(0, 8);
    const stack = line.stack ? '<span class="stack">' + esc(line.stack) + '</span>' : '';
    return '<div class="l ' + line.level + '"><span class="t">' + time + '</span><span class="lv">' +
      line.level.toUpperCase() + '</span>' + esc(line.msg) + stack + '</div>';
  }).join('') || '<em>줄 없음</em>';
  el.meta.textContent = data.session + ' · ' + data.count + '줄 · ' + new Date().toTimeString().slice(0, 8);
  window.scrollTo(0, document.body.scrollHeight);
}

function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

(async () => { await loadSessions(); await load(); setInterval(async () => { if (auto) { await loadSessions(); await load(); } }, 3000); })();
</script>
</body>
</html>`;
}
