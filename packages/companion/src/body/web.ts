import { existsSync, readFileSync } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';

import { touchKindFromWire, touchSensation } from '../touch';
import { 깨졌나, 깨진줄들 } from '../garbled';
import { Backchannel } from '../backchannel';
import { Face, expressionFrom, stripExpression } from '../expression';
import { 평소 } from '../feeling';
import { withTone, type Tone } from '../voice/feeling-tone';
import type { Whisper } from '../sense/whisper';
import type { Speech } from '../voice/edge-tts';
import type { Body, MemoryEntry, Sensation, Sense, Utterance, Voice } from '../types';

export interface WebBodyOptions {
  channel?: string;
  port?: number;
  /** 켜질 때 브라우저를 자동으로 연다. */
  open?: boolean;
  log?: (message: string) => void;
  /**
   * 창을 새로 열었을 때 채워 넣을 지난 대화. 없으면 빈 채로 시작한다.
   * 기억 부품을 그대로 넘기면 된다 — 화면이 기억을 따로 들고 있지 않게.
   */
  history?: () => readonly MemoryEntry[] | Promise<readonly MemoryEntry[]>;
  /** 「이 사람에 대해 아는 것」 — 창에서 펼쳐 볼 수 있게. */
  longTerm?: () => string | null | Promise<string | null>;
  /**
   * 잘못 알았거나 남기고 싶지 않은 것을 지운다.
   *
   * 사람이 지울 수 없는 기억은 기억이 아니라 기록이다. 보여주기만 하고 못 고치면
   * 굳은 것을 평생 안고 간다.
   */
  forget?: (what: string, alsoConversation: boolean) => { known: boolean; conversation: number };
  /** 목소리를 만들어 주는 쪽. 없으면 브라우저 내장 목소리로 말한다. */
  speech?: Speech;
  /**
   * 지금 마음이 어느 결인가. 소리를 만들 때마다 물어본다.
   *
   * 몸이 마음을 들고 있지 않는 게 중요하다 — 물어보기만 한다. 안 주면 늘 하던 목소리다.
   */
  tone?: () => Tone | null;
  /** 지금 마음. 얼굴을 유도하는 데 쓴다. 안 주면 늘 평온이다. */
  feeling?: () => import('../feeling').Feeling;
  /** 맞장구 설정. 안 주면 기본값으로 친다. */
  backchannel?: import('../backchannel').BackchannelOptions;
  /** 발동 기록을 사람이 읽는 글로. */
  tally?: () => string;
  /** 잘못된 것들을 사람이 읽는 글로. */
  troubles?: () => string;
  /** 설정을 사람이 읽는 글로. */
  settings?: () => string;
  /** 설정을 바꾼다. 안 받아들인 것들을 돌려준다. */
  putSettings?: (next: unknown) => string[];
  /** 오프라인 받아쓰기. 없으면 브라우저 받아쓰기로 물러선다. */
  ears?: Whisper;
  /** 누가 될 수 있는지 + 지금 누구인지 + 바꾸기. 없으면 창에 고르는 자리가 안 뜬다. */
  characters?: {
    list: () => readonly { name: string }[];
    current: () => string | null;
    switchTo: (name: string) => boolean;
  };
  /**
   * 몸으로 쓸 3D 모델. `{ 이름: 파일경로 }` — 창이 `/model/<이름>` 으로 받아 간다.
   * 모델 파일이 게임 저장소 안에 있으므로, 복사해 두 벌로 만들지 않고 그 자리에서 읽는다.
   */
  models?: Readonly<Record<string, string>>;
  /** 어떤 머리를 쓸 수 있는지 + 지금 무엇인지 + 바꾸기. */
  /** 되돌리기 어려운 일을 하기 전에 화면에 물어보는 자리. */
  permission?: {
    pending: () => { id: string; what: string } | null;
    answer: (id: string, yes: boolean) => boolean;
  };
  brains?: {
    list: () => readonly string[];
    current: () => string;
    switchTo: (name: string) => boolean;
  };
}

/**
 * 웹 몸 — 브라우저 창에 실제로 **보이는** 몸.
 *
 * 왜 웹이냐: 같은 화면을 나중에 투명 데스크톱 창으로 감싸면 그대로 데스크톱 펫이 된다.
 * 표면을 두 번 만들지 않으려고 웹을 먼저 세운다.
 *
 * 밖으로 나가는 신호(SSE)로 몸의 상태를 알린다 — 듣는 중 / 생각 중 / 말하는 중 / 가만히.
 * 의존성 0: 기본 http + SSE 만 쓴다.
 */
export function webBody(options: WebBodyOptions = {}): Body {
  const channel = options.channel ?? 'web';
  const port = options.port ?? 4615;
  const log = options.log ?? (() => {});

  const clients = new Set<ServerResponse>();
  let server: Server | null = null;
  /** 감각을 코어로 밀어 넣는 통로 — 받아쓴 말도 여기로 들어간다. */
  let senseEmit: ((sensation: Sensation) => void) | null = null;

  /**
   * 말을 건 시각과 첫 소리가 나간 시각.
   *
   * 실시간 대화의 핵심 지표는 「첫 소리까지 걸린 시간」이고, 0.3초가 대화와 기계를
   * 가르는 선이라고 한다. 우리는 그걸 재지도 않고 있었다 — 못 재는 것은 못 고친다.
   */
  let askedAt: number | null = null;
  const firstSound: number[] = [];

  function broadcast(event: Record<string, unknown>): void {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of clients) {
      try {
        client.write(payload);
      } catch {
        clients.delete(client);
      }
    }
  }

  const sense: Sense = {
    name: `${channel}:sense`,
    start(emit: (sensation: Sensation) => void) {
      senseEmit = emit;
      server = createServer((req, res) => {
        const url = req.url ?? '/';

        if (url === '/' || url.startsWith('/?')) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(loadPage());
          return;
        }

        // 새로 연 창이 지난 대화를 되찾는 자리 — 새로고침해도 채팅이 비지 않게.
        if (url === '/history') {
          void Promise.resolve(options.history?.() ?? [])
            .then((entries) => {
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify(entries));
            })
            .catch(() => {
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
              res.end('[]');
            });
          return;
        }

        // 얘가 나를 뭘 안다고 생각하는지 — 감추면 기분 나쁜 종류의 정보다.
        if (url === '/known') {
          void Promise.resolve(options.longTerm?.() ?? null)
            .then((known) => {
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ known }));
            })
            .catch(() => {
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
              res.end('{"known":null}');
            });
          return;
        }

        // 잘못 알게 된 것을 지운다.
        if (url.startsWith('/known/forget?') && req.method === 'POST') {
          const q = new URLSearchParams(url.slice(url.indexOf('?') + 1));
          const what = q.get('what') ?? '';
          const deep = q.get('deep') === '1';
          const result = options.forget?.(what, deep) ?? { known: false, conversation: 0 };
          log(`잊었다: ${what.slice(0, 40)} (아는 것 ${result.known ? 'O' : 'X'} · 대화 ${result.conversation}줄)`);
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(result));
          return;
        }

        // 가져온 동작 파일 (CC0 — 출처는 assets/anim/출처.md).
        if (url.startsWith('/anim/')) {
          const base = join(packageRoot, 'assets', 'anim');
          const wanted = join(base, decodeURIComponent(url.slice('/anim/'.length).split('?')[0] ?? ''));
          if (wanted.startsWith(base) === false) {
            res.writeHead(403).end();
            return;
          }
          serveFile(res, wanted, 'model/gltf-binary', log);
          return;
        }

        // 3D 몸을 이루는 조각들. **여기 안 적으면 그 파일만 조용히 404 가 되고,
        // 몸 전체가 안 뜬다** — 새 조각을 만들 때마다 이 줄을 같이 늘려야 한다.
        // 배치·모양은 따로 둔 파일에서 온다 — 화면 뼈대와 섞어 두면 어느 쪽을 고치는지
        // 매번 헤맨다.
        if (url === '/ui.css') {
          serveFile(res, join(packageRoot, 'assets', 'ui.css'), 'text/css; charset=utf-8', log);
          return;
        }
        if (url === '/model.js' || url === '/toon.js' || url === '/face-paint.js' || url === '/say-chunks.js') {
          serveFile(res, join(packageRoot, 'assets', url.slice(1)), 'text/javascript; charset=utf-8', log);
          return;
        }

        // 3D 를 그리는 데 필요한 라이브러리. 바깥에서 받아오지 않는다 — 인터넷이
        // 끊겨도, 저쪽 주소가 사라져도 얘는 계속 보여야 한다.
        // 파일 하나만 내주면 그 안의 「옆 파일 불러오기」가 전부 깨진다. 폴더째 낸다.
        if (url.startsWith('/lib/three/')) {
          const base = join(packageRoot, 'node_modules', 'three');
          const wanted = join(base, decodeURIComponent(url.slice('/lib/three/'.length).split('?')[0] ?? ''));
          // 폴더 밖으로 빠져나가는 주소는 거절한다.
          if (wanted.startsWith(base) === false) {
            res.writeHead(403).end();
            return;
          }
          serveFile(res, wanted, 'text/javascript; charset=utf-8', log);
          return;
        }

        // 모델과 그 옆에 있는 그림들 (게임 저장소 안의 것을 그 자리에서 읽는다).
        //
        // 모델 파일 하나만 내주면 살이 없는 회색 덩어리가 뜬다 — 색·무늬는 옆에 따로
        // 놓인 그림 파일이고, 모델은 그걸 이름으로만 가리키기 때문이다. 그래서 모델이
        // 있는 폴더를 통째로 열어 준다.
        if (url.startsWith('/model/')) {
          const rest = decodeURIComponent(url.slice('/model/'.length).split('?')[0] ?? '');
          const slash = rest.indexOf('/');
          const name = slash < 0 ? rest : rest.slice(0, slash);
          const modelPath = options.models?.[name];
          if (modelPath === undefined) {
            res.writeHead(404).end();
            return;
          }
          if (slash < 0) {
            serveFile(res, modelPath, 'application/octet-stream', log);
            return;
          }
          const folder = dirname(modelPath);
          const sibling = join(folder, rest.slice(slash + 1));
          if (sibling.startsWith(folder) === false) {
            res.writeHead(403).end();
            return;
          }
          serveFile(res, sibling, sibling.toLowerCase().endsWith('.png') ? 'image/png' : 'application/octet-stream', log);
          return;
        }

        // 누가 될 수 있나 / 지금 누구인가.
        if (url === '/characters') {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            list: options.characters?.list().map((c) => c.name) ?? [],
            current: options.characters?.current() ?? null,
          }));
          return;
        }

        // 다른 사람으로 바꾼다. 기억은 그대로다.
        if (url.startsWith('/characters/switch?') && req.method === 'POST') {
          const want = new URLSearchParams(url.slice(url.indexOf('?') + 1)).get('name') ?? '';
          const ok = options.characters?.switchTo(want) === true;
          res.writeHead(ok ? 200 : 404, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok, current: options.characters?.current() ?? null }));
          if (ok) broadcast({ type: 'character', name: want });
          return;
        }

        // 창에서 벌어진 일을 밖에서 볼 수 있게. 화면 속 실패는 조용히 사라지기 때문에
        // 「눌렀는데 아무 일도 안 난다」의 원인을 찾을 방법이 없었다.
        if (url === '/log' && req.method === 'POST') {
          let raw = '';
          req.on('data', (chunk) => { raw += chunk; if (raw.length > 8000) req.destroy(); });
          req.on('end', () => {
            try {
              log(`[창] ${String(JSON.parse(raw).message ?? '').slice(0, 500)}`);
            } catch {
              // 못 읽는 기록은 버린다
            }
            res.writeHead(204).end();
          });
          return;
        }

        // 지금 물어볼 게 있나 / 대답.
        if (url === '/permission') {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(options.permission?.pending() ?? null));
          return;
        }
        if (url.startsWith('/permission/answer?') && req.method === 'POST') {
          const q = new URLSearchParams(url.slice(url.indexOf('?') + 1));
          const ok = options.permission?.answer(q.get('id') ?? '', q.get('yes') === '1') === true;
          res.writeHead(ok ? 200 : 404).end();
          return;
        }

        // 얼마나 빨리 대답하나 — 재지 않으면 못 고친다.
        if (url === '/stats') {
          const sorted = [...firstSound].sort((a, b) => a - b);
          const middle = sorted.length === 0 ? null : sorted[Math.floor(sorted.length / 2)];
          const worst = sorted.length === 0 ? null : sorted[sorted.length - 1];
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ 샘플수: sorted.length, 첫소리중앙값ms: middle, 최악ms: worst }));
          return;
        }

        // 어떤 머리를 쓸 수 있나 / 지금 무엇인가.
        if (url === '/brains') {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            list: options.brains?.list() ?? [],
            current: options.brains?.current() ?? null,
          }));
          return;
        }

        if (url.startsWith('/brains/switch?') && req.method === 'POST') {
          const want = new URLSearchParams(url.slice(url.indexOf('?') + 1)).get('name') ?? '';
          const ok = options.brains?.switchTo(want) === true;
          res.writeHead(ok ? 200 : 404, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok, current: options.brains?.current() ?? null }));
          return;
        }

        // 오프라인 받아쓰기가 쓸 수 있는 상태인가.
        if (url === '/ears') {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ offline: options.ears?.available() === true }));
          return;
        }

        // 듣기 시작 / 끝. 끝내면 받아쓴 글이 그대로 감각으로 들어간다.
        if ((url === '/ears/start' || url === '/ears/stop') && req.method === 'POST') {
          const ears = options.ears;
          if (ears === undefined || ears.available() === false) {
            res.writeHead(404).end();
            return;
          }
          const listening = url.endsWith('/start');
          const work = listening
            ? ears.startRecording().then(() => null)
            : ears.stopRecording();
          void work
            .then((heard) => {
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ ok: true, text: heard }));
              if (listening) {
                broadcast({ type: 'listening' });
              } else if (heard !== null && heard.trim() !== '') {
                broadcast({ type: 'heard', text: heard });
                senseEmit?.({ channel, kind: 'text', text: heard.trim(), at: Date.now() });
              }
            })
            .catch((e: unknown) => {
              log(`듣지 못했다: ${e instanceof Error ? e.message : String(e)}`);
              res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ ok: false }));
            });
          return;
        }

        // 고를 수 있는 목소리 목록.
        if (url === '/voices') {
          void Promise.resolve(options.speech?.voices() ?? [])
            .then((voices) => {
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify(voices));
            })
            .catch(() => {
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
              res.end('[]');
            });
          return;
        }

        // 소리 한 토막. 실패하면 브라우저가 내장 목소리로 물러선다(404 로 알린다).
        if (url.startsWith('/voice?')) {
          const query = new URLSearchParams(url.slice(url.indexOf('?') + 1));
          const say = (query.get('text') ?? '').trim();
          if (options.speech === undefined || say === '') {
            res.writeHead(404).end();
            return;
          }
          // **여기서 「첫 소리까지」를 세지 않는다.**
          //
          // 예전엔 이 자리에서 셌는데, 그건 소리를 **만들기 시작한** 때다. 목소리를 흉내
          // 내는 쪽으로 바꾸자 만드는 데만 2~3초가 걸렸는데 기록은 그대로 0.7초였다 —
          // 지표가 거짓말을 하면 느려진 걸 아무도 모른다. 진짜 첫 소리는 창이 소리를
          // 내기 시작한 때고, 그건 창만 안다(아래 `/played`).
          const 만들기시작 = Date.now();
          // 지금 마음을 목소리 결로 얹는다. 브라우저는 결을 모른다 — 알 필요도 없다.
          const 목소리 = withTone(query.get('v') ?? undefined, options.tone?.() ?? null);
          void options.speech
            .synthesize(say, 목소리)
            .then((audio) => {
              log(`소리 만드는 데 ${((Date.now() - 만들기시작) / 1000).toFixed(1)}초`);
              const speech = options.speech;
              const perVoice = (speech as { contentTypeFor?: (v?: string) => string } | undefined)?.contentTypeFor;
              res.writeHead(200, {
                'content-type': perVoice ? perVoice(목소리) : (speech?.contentType ?? 'audio/mpeg'),
                'content-length': audio.length,
              });
              res.end(audio);
            })
            .catch((e) => {
              log(`목소리를 못 만들었다: ${e instanceof Error ? e.message : String(e)}`);
              res.writeHead(404).end();
            });
          return;
        }

        // 서버 → 브라우저: 몸의 상태를 계속 흘려보낸다.
        /* 창이 **실제로 소리를 내기 시작한** 때를 알려 주는 자리.
           서버는 소리를 만들어 보낸 것까지만 안다. 창이 그걸 언제 트는지는 창만 안다 —
           재생이 막히거나(소리 정책) 앞 소리가 아직 나가는 중이면 한참 뒤일 수 있다. */
        if (url === '/played' && req.method === 'POST') {
          res.writeHead(204).end();
          if (askedAt === null) return; // 사람이 말 건 turn 이 아니면 잴 것도 없다
          const took = Date.now() - askedAt;
          askedAt = null;
          firstSound.push(took);
          if (firstSound.length > 50) firstSound.shift();
          log(`첫 소리까지 ${(took / 1000).toFixed(1)}초`);
          return;
        }

        /* 이미 쌓인 **깨진 줄**을 보고, 원하면 걷어내는 자리.
           보기(GET)와 지우기(POST)를 나눠 뒀다 — 지우기는 되돌릴 수 없어서 무엇이
           지워질지 먼저 볼 수 있어야 한다. */
        if (url.startsWith('/garbled')) {
          void Promise.resolve(options.history?.() ?? [])
            .then((entries) => {
              const 깨진것 = 깨진줄들([...entries]);
              if (req.method !== 'POST') {
                res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ 깨진줄: 깨진것.length, 보기: 깨진것.slice(0, 5).map((e) => e.text.slice(0, 30)) }));
                return;
              }
              let 지운수 = 0;
              for (const e of 깨진것) 지운수 += options.forget?.(e.text, true)?.conversation ?? 0;
              log(`깨진 줄 ${깨진것.length}개를 걷어냈다 (대화 ${지운수}줄)`);
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ 걷어냄: 깨진것.length, 대화: 지운수 }));
            })
            .catch(() => res.writeHead(500).end());
          return;
        }

        if (url === '/events') {
          res.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          });
          res.write(': 연결됨\n\n');
          clients.add(res);
          req.on('close', () => clients.delete(res));
          return;
        }

        // 브라우저 → 서버: 사람이 친 말.
        if (url === '/say' && req.method === 'POST') {
          let raw = '';
          req.on('data', (chunk) => {
            raw += chunk;
            if (raw.length > 100_000) req.destroy();
          });
          req.on('end', () => {
            let text = '';
            try {
              text = String(JSON.parse(raw).text ?? '').trim();
            } catch {
              text = '';
            }
            /* **깨진 글은 안 받는다.**
               한 번 들어오면 대화 기록에 남고, 졸여서 「아는 것」이 되고, 사건으로도
               담긴다 — 사람이 안 한 말이 사람의 기억이 된다. 막을 땐 왜 막았는지
               남긴다. 조용히 버리면 「보냈는데 아무 반응이 없다」가 되고 고장과
               구분이 안 된다. */
            const 깨짐 = text === '' ? null : 깨졌나(text);
            if (깨짐 !== null) {
              log(`받지 않았다 — ${깨짐}: ${text.slice(0, 30)}`);
              res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ 안받은이유: 깨짐 }));
              return;
            }
            res.writeHead(text === '' ? 400 : 204).end();
            if (text === '') return;
            broadcast({ type: 'heard', text });
            askedAt = Date.now();
            // 아직 말하는 중이면 짧게 받아 준다 — 벽에 대고 말하는 기분이 안 들게.
            // 맞장구는 말이 아니라서 뜸과 같은 길로 나간다(대화에 안 쌓인다).
            const 받는소리 = backchannel.heard(askedAt);
            if (받는소리 !== null) broadcast({ type: 'filler', text: 받는소리, channel });
            emit({ channel, kind: 'text', text, at: askedAt });
          });
          return;
        }

        // 만든 게 실제로 도는지 보는 창구. 사람이 열어 봐도 읽히는 글로 준다.
        // 손댈 수 있는 설정 — 읽고(GET) 바꾸고(POST). 재시작 없이 먹는다.
        if (url === '/settings') {
          if (req.method === 'POST') {
            let raw = '';
            req.on('data', (chunk) => { raw += chunk; if (raw.length > 20_000) req.destroy(); });
            req.on('end', () => {
              let 안된것: string[] = ['설정을 못 읽었다'];
              try {
                안된것 = options.putSettings?.(JSON.parse(raw)) ?? ['설정을 받을 자리가 없다'];
              } catch { /* 위 기본값 그대로 */ }
              const body = Buffer.from(JSON.stringify({ 안된것 }), 'utf8');
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': body.length });
              res.end(body);
            });
            return;
          }
          const 글 = options.settings?.() ?? '설정이 없다.';
          const body = Buffer.from(글, 'utf8');
          res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'content-length': body.length });
          res.end(body);
          return;
        }

        // 무엇이 잘못됐나 — 발동 기록의 짝이다.
        if (url === '/troubles') {
          const 글 = options.troubles?.() ?? '아직 걸린 게 없다.';
          const body = Buffer.from(글, 'utf8');
          res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'content-length': body.length });
          res.end(body);
          return;
        }

        if (url === '/tally') {
          const 글 = options.tally?.() ?? '아직 세는 게 없다.';
          const body = Buffer.from(글, 'utf8');
          res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'content-length': body.length });
          res.end(body);
          return;
        }

        // 브라우저 → 서버: 얘 몸에 닿은 것. 말이 아니라서 통로를 따로 둔다.
        if (url.startsWith('/touch') && req.method === 'POST') {
          const wire = new URL(url, 'http://x').searchParams.get('kind') ?? 'poke';
          const kind = touchKindFromWire(wire);
          res.writeHead(kind === null ? 400 : 204).end();
          if (kind === null) return;
          emit(touchSensation(kind));
          return;
        }

        res.writeHead(404).end();
      });

      server.listen(port, () => {
        const url = `http://localhost:${port}`;
        log(`웹 몸 = ${url}`);
        if (options.open) openBrowser(url);
      });
    },
    stop() {
      for (const client of clients) client.end();
      clients.clear();
      server?.close();
      server = null;
    },
  };

  // 얼굴 신호. 생김새는 다른 세션 몫이라 여기서는 **신호만** 만들어 흘린다.
  const face = new Face();
  const backchannel = new Backchannel(options.backchannel);

  const voice: Voice = {
    name: `${channel}:voice`,
    partial(chunk: string, soFar: string, from: string) {
      broadcast({ type: 'partial', chunk, soFar, channel: from });
    },
    filler(text: string, from: string) {
      // 한 뭉치에 소리는 하나다. 맞장구가 이미 나갔으면 뜸은 삼킨다 —
      // 안 그러면 「음. 응? 그게… 어…」가 연달아 나간다(실측).
      if (backchannel.mayFiller() === false) return;
      // 뜸은 대화가 아니다 — 소리만 내고 대화 내역에는 안 쌓는다.
      broadcast({ type: 'filler', text, channel: from });
    },
    hush() {
      // 이미 나가고 있던 소리와 말풍선을 즉시 멈춘다.
      broadcast({ type: 'hush' });
    },
    speak(utterance: Utterance) {
      // 말 앞에 붙은 얼굴 표를 뽑아 따로 흘리고, 말에서는 지운다.
      // 안 지우면 얘가 「대괄호 놀람 대괄호」를 소리 내어 읽는다.
      // 답이 나갔으니 이어 말하기 뭉치는 끝났다.
      backchannel.answered();
      const { text, tagged } = stripExpression(utterance.text);
      const 얼굴 = face.changeTo(expressionFrom({
        feeling: options.feeling?.() ?? 평소,
        text,
        tagged,
      }));
      if (얼굴 !== null) broadcast({ type: 'face', expression: 얼굴 });
      // channel 을 같이 보낸다 — 화면이 「나한테 한 말」과 「혼잣말」을 구분해 그린다.
      broadcast({ type: 'speak', text, at: utterance.at, channel: utterance.channel });
    },
  };

  return { name: channel, sense, voice };
}

/**
 * 화면은 별도 .html 파일이다 — 코드 문자열 안에 UI 를 섞어 넣으면 나중에 손볼 때
 * 문법 강조도 못 받고 캐스팅 사고도 조용히 통과한다.
 */
/** dist/body → 패키지 뿌리. */
const packageRoot = join(dirname(__filename), '..', '..');

function loadPage(): string {
  return readFileSync(join(packageRoot, 'assets', 'face.html'), 'utf8');
}

/** 파일 하나를 그대로 내려보낸다. 없으면 404 — 못 찾았다고 창이 죽지는 않게. */
function serveFile(res: ServerResponse, path: string, contentType: string, log: (m: string) => void): void {
  try {
    const body = readFileSync(path);
    res.writeHead(200, { 'content-type': contentType, 'content-length': body.length });
    res.end(body);
  } catch (e) {
    log(`못 읽었다 (${path}): ${e instanceof Error ? e.message : String(e)}`);
    res.writeHead(404).end();
  }
}

function openBrowser(url: string): void {
  void import('node:child_process').then(({ spawn }) => {
    const command =
      process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin' ? ['open', [url]]
      : ['xdg-open', [url]];
    try {
      spawn(command[0] as string, command[1] as string[], { detached: true, stdio: 'ignore' }).unref();
    } catch {
      // 브라우저를 못 열어도 몸은 살아있다 — 주소를 직접 열면 된다.
    }
  });
}

/**
 * 탭이 아니라 화면 위에 상주하는 창으로 띄운다.
 *
 * 탭 하나로 있으면 「열어보는 것」이지 「거기 있는 것」이 아니다. 주소창도 탭도 없는
 * 작은 창을 화면 오른쪽 아래에 띄우고 다른 창 위에 고정한다. 실패해도 그냥 평범한
 * 브라우저로 열린다 — 상주에 실패했다고 말을 못 하게 되진 않는다.
 */
export function openPinnedWindow(
  url: string,
  size?: { width?: number; height?: number; transparent?: boolean },
): Promise<string> {
  const script = join(dirname(__filename), '..', '..', 'assets', 'pin-window.ps1');
  // **제 창이 있으면 그걸로 뜬다.** 브라우저 창으로는 창틀·최소화·닫기 단추를 없앨 수
  // 없고, 배경을 진짜로 뚫을 수도 없다(색 하나를 뚫는 옛 수법은 그림을 GPU 가 그리는
  // 창에서는 먹지 않는다). 곁에 있는 존재가 제목 표시줄을 달고 있으면 창이지 존재가
  // 아니다. 이 배선이 한때 있다가 사라져 브라우저 창으로만 뜨고 있었다.
  const own = ownWindowExe();
  if (own !== null && size?.transparent !== false) return openOwnWindow(own, url, size);
  return import('node:child_process').then(
    ({ execFile }) =>
      new Promise<string>((resolve) => {
        if (process.platform !== 'win32') {
          openBrowser(url);
          resolve('이 운영체제에선 평범한 브라우저로 열었다');
          return;
        }
        const transparent = size?.transparent === true;
        // 뚫어낼 색은 **여기 한 곳**에서만 정한다.
        //
        // 예전엔 창 띄우는 스크립트가 「페이지가 칠하는 색」이라며 값을 박아 뒀는데,
        // 페이지는 그 색을 한 번도 칠한 적이 없었다 — 바탕이 투명이라 브라우저가 흰색으로
        // 칠했고, 뚫을 픽셀이 없으니 창이 통째로 하얬다(실측: 「흰 화면만 보여」).
        // 계약이 한쪽에만 있으면 이렇게 조용히 깨진다. 색을 한 곳에서 정해 양쪽에 넘긴다.
        const KEY = 'FF00FE';
        const target = transparent ? `${url}${url.includes('?') ? '&' : '?'}t=${KEY}` : url;
        execFile(
          'powershell',
          [
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
            '-Url', target,
            '-Width', String(size?.width ?? 420),
            '-Height', String(size?.height ?? 640),
            ...(transparent ? ['-Transparent', '-KeyColor', KEY] : []),
          ],
          { timeout: 40_000, windowsHide: true, encoding: 'utf8' },
          (error, stdout) => {
            if (error) {
              openBrowser(url);
              resolve('창으로 못 띄워서 평범한 브라우저로 열었다');
              return;
            }
            resolve(stdout.trim().split('\n').pop()?.trim() ?? '열었다');
          },
        );
      }),
  );
}

/**
 * 얘 전용 창 프로그램. 없으면 null — 그럼 브라우저 창으로 물러선다.
 *
 * 아직 배포용으로 굽지 않아서 개발 산출물 자리에 있다. 릴리스 자리를 먼저 보고,
 * 없으면 개발 자리를 본다 — 나중에 구우면 손 안 대고 그쪽을 쓴다.
 */
function ownWindowExe(): string | null {
  if (process.platform !== 'win32') return null;
  const 뿌리 = join(dirname(__filename), '..', '..', '..', '..', 'apps', 'karmolab-tauri', 'target');
  for (const 자리 of ['release', 'debug']) {
    const exe = join(뿌리, 자리, 'companion-window.exe');
    if (existsSync(exe)) return exe;
  }
  return null;
}

/** 제 창으로 띄운다. 창틀도 없고 배경도 진짜로 뚫린다. */
function openOwnWindow(
  exe: string,
  url: string,
  size?: { width?: number; height?: number },
): Promise<string> {
  // **창을 화면 전체로 편다.**
  //
  // 작은 창에 얹으니 말풍선·메뉴가 끝없이 잘렸다. 자리를 조금씩 넓히는 건 증상 추격이다 —
  // 애초에 자를 테두리를 없앤다. 창은 화면을 다 덮되 **몸과 눌러야 하는 자리 밖은 클릭이
  // 그대로 지나가므로**(창이 스스로 알려 준다) 평소엔 없는 것과 같다. 얘를 끌면 창이 아니라
  // **몸이 화면 안에서** 옮겨 다닌다.
  const 화면 = 작업영역();
  return import('node:child_process').then(({ spawn }) => {
    try {
      const child = spawn(exe, [], {
        detached: true,
        stdio: 'ignore',
        // 주소·크기는 환경으로 넘긴다 — 저쪽이 그렇게 읽는다.
        env: {
          ...process.env,
          // **소리가 나려면 이게 있어야 한다.**
          //
          // 창 안의 브라우저는 사람이 먼저 누르기 전에는 소리를 안 낸다. 브라우저로 띄우던
          // 시절엔 이 정책을 끄는 깃발을 붙여 줬는데, 제 창으로 옮기면서 그게 빠졌다 —
          // 말은 하는데 소리가 없었다. 창 프로그램은 이 이름의 환경값을 그대로 제 안의
          // 브라우저에 넘긴다. 다시 굽지 않아도 되는 자리라 여기서 준다.
          WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--autoplay-policy=no-user-gesture-required',
          // 화면 크기를 못 재면 옛날처럼 작은 창으로 뜬다 — 잘리긴 해도 말은 한다.
          COMPANION_URL: 화면 === null ? url : `${url}${url.includes('?') ? '&' : '?'}full=1`,
          COMPANION_WIDTH: String(화면?.width ?? size?.width ?? 420),
          COMPANION_HEIGHT: String(화면?.height ?? size?.height ?? 640),
          COMPANION_MARGIN: '0',
        },
      });
      child.unref();
      return 화면 === null
        ? '제 창으로 떴다 (창틀 없음·배경 뚫림 · 화면 크기를 못 재서 작은 창)'
        : `제 창으로 떴다 (화면 전체 ${화면.width}×${화면.height} · 창틀 없음·배경 뚫림)`;
    } catch (e) {
      openBrowser(url);
      return `제 창을 못 띄워서 평범한 브라우저로 열었다: ${e instanceof Error ? e.message : String(e)}`;
    }
  });
}

/**
 * 작업 영역 크기 (작업표시줄 뺀 자리). 못 재면 null.
 *
 * 한 번만 묻는다 — 창을 띄울 때뿐이라 값이 비싸지 않다. 화면이 바뀌면 다시 띄우면 된다.
 */
function 작업영역(): { width: number; height: number } | null {
  if (process.platform !== 'win32') return null;
  try {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        "Add-Type -AssemblyName System.Windows.Forms; $w = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea; \"$($w.Width)x$($w.Height)\"",
      ],
      { timeout: 15_000, windowsHide: true, encoding: 'utf8' },
    ).trim();
    const m = /^(\d+)x(\d+)$/.exec(out);
    if (m === null) return null;
    return { width: Number(m[1]), height: Number(m[2]) };
  } catch {
    return null;
  }
}
