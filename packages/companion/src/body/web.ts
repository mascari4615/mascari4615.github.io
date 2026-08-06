import { readFileSync } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';

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
  /** 목소리를 만들어 주는 쪽. 없으면 브라우저 내장 목소리로 말한다. */
  speech?: Speech;
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
        if (url === '/model.js' || url === '/toon.js' || url === '/face-paint.js') {
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
          void options.speech
            .synthesize(say, query.get('v') ?? undefined)
            .then((audio) => {
              const speech = options.speech;
              const perVoice = (speech as { contentTypeFor?: (v?: string) => string } | undefined)?.contentTypeFor;
              res.writeHead(200, {
                'content-type': perVoice ? perVoice(query.get('v') ?? undefined) : (speech?.contentType ?? 'audio/mpeg'),
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
            res.writeHead(text === '' ? 400 : 204).end();
            if (text === '') return;
            broadcast({ type: 'heard', text });
            emit({ channel, kind: 'text', text, at: Date.now() });
          });
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

  const voice: Voice = {
    name: `${channel}:voice`,
    partial(chunk: string, soFar: string, from: string) {
      broadcast({ type: 'partial', chunk, soFar, channel: from });
    },
    speak(utterance: Utterance) {
      // channel 을 같이 보낸다 — 화면이 「나한테 한 말」과 「혼잣말」을 구분해 그린다.
      broadcast({ type: 'speak', text: utterance.text, at: utterance.at, channel: utterance.channel });
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
  return import('node:child_process').then(
    ({ execFile }) =>
      new Promise<string>((resolve) => {
        if (process.platform !== 'win32') {
          openBrowser(url);
          resolve('이 운영체제에선 평범한 브라우저로 열었다');
          return;
        }
        const transparent = size?.transparent === true;
        const target = transparent ? `${url}${url.includes('?') ? '&' : '?'}t=1` : url;
        execFile(
          'powershell',
          [
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
            '-Url', target,
            '-Width', String(size?.width ?? 420),
            '-Height', String(size?.height ?? 640),
            ...(transparent ? ['-Transparent'] : []),
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
