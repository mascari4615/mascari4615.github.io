import { readFileSync } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';

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
function loadPage(): string {
  const here = dirname(__filename); // dist/body
  return readFileSync(join(here, '..', '..', 'assets', 'face.html'), 'utf8');
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
