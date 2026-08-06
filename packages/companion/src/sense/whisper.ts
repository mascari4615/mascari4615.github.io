import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * 오프라인 받아쓰기 — KarmoLab 이 이미 갖고 있던 Whisper 를 그대로 빌려 쓴다.
 *
 * 왜 흡수하나: 브라우저 받아쓰기는 창이 앞에 있어야 하고 인터넷이 필요하다. 저쪽은
 * 별도 실행 파일이 한 줄짜리 JSON 을 주고받는 구조라, 우리 쪽에서 그대로 부를 수 있다.
 * 같은 기능을 두 번 만들지 않는다 — 여기가 정본이 되더라도 *구현*까지 새로 짜야 할
 * 이유는 없다.
 *
 * 프로토콜 정본: `apps/karmolab-tauri/src-tauri-ml/PROTOCOL.md`.
 */
export interface WhisperOptions {
  /** 받아쓰기를 맡는 실행 파일. */
  exePath: string;
  /** Whisper 모델이 있는 폴더. */
  modelDir: string;
  log?: (message: string) => void;
}

export interface Whisper {
  /** 준비됐나 (실행 파일·모델이 자리에 있나). */
  available(): boolean;
  /** 모델을 메모리에 올린다. 처음 한 번만 오래 걸린다. */
  warmUp(): Promise<void>;
  startRecording(): Promise<void>;
  /** 녹음을 끝내고 받아쓴 글을 돌려준다. 아무 말도 없었으면 null. */
  stopRecording(): Promise<string | null>;
  shutdown(): void;
}

interface Pending {
  wants: readonly string[];
  resolve: (event: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export function whisperEars(options: WhisperOptions): Whisper {
  const log = options.log ?? (() => {});
  let child: ChildProcessWithoutNullStreams | null = null;
  let buffer = '';
  let loaded = false;
  const queue: Pending[] = [];

  function ready(): boolean {
    return existsSync(options.exePath) && existsSync(options.modelDir);
  }

  function ensureStarted(): ChildProcessWithoutNullStreams {
    if (child !== null && child.exitCode === null) return child;
    const started = spawn(options.exePath, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    started.stdout.setEncoding('utf8');
    started.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let cut = buffer.indexOf('\n');
      while (cut >= 0) {
        const line = buffer.slice(0, cut).trim();
        buffer = buffer.slice(cut + 1);
        cut = buffer.indexOf('\n');
        if (line === '') continue;
        try {
          deliver(JSON.parse(line) as Record<string, unknown>);
        } catch {
          // 사람이 읽는 로그 줄일 수 있다 — 넘긴다.
        }
      }
    });
    started.stderr.setEncoding('utf8');
    started.on('exit', (code) => {
      loaded = false;
      log(`받아쓰기가 멈췄다 (코드 ${code})`);
      // 기다리던 쪽을 영원히 세워두지 않는다.
      while (queue.length > 0) queue.shift()?.reject(new Error('받아쓰기가 멈췄다'));
    });
    child = started;
    return started;
  }

  function deliver(event: Record<string, unknown>): void {
    const name = String(event.event ?? '');
    const waiting = queue[0];
    if (waiting === undefined) return;
    if (waiting.wants.includes(name)) {
      queue.shift();
      clearTimeout(waiting.timer);
      waiting.resolve(event);
      return;
    }
    if (name === 'error') {
      queue.shift();
      clearTimeout(waiting.timer);
      waiting.reject(new Error(String(event.msg ?? '받아쓰기가 실패했다')));
    }
  }

  function send(command: Record<string, unknown>, wants: readonly string[], timeoutMs: number): Promise<Record<string, unknown>> {
    const process = ensureStarted();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = queue.findIndex((p) => p.timer === timer);
        if (index >= 0) queue.splice(index, 1);
        reject(new Error(`받아쓰기가 ${timeoutMs}ms 안에 답하지 않았다`));
      }, timeoutMs);
      queue.push({ wants, resolve, reject, timer });
      process.stdin.write(`${JSON.stringify(command)}\n`, 'utf8');
    });
  }

  return {
    available: ready,

    async warmUp(): Promise<void> {
      if (ready() === false) throw new Error('받아쓰기 실행 파일이나 모델이 없다');
      if (loaded) return;
      // 「올리기 시작했다」와 「다 올랐다」는 다르다. 저쪽은 모델을 뒤에서 올리므로
      // 응답만 믿고 녹음을 시작하면, 멈출 때 「아직 없다」는 말을 듣는다.
      await send({ cmd: 'voice_load', model_dir: options.modelDir }, ['loaded'], 60_000);
      const until = Date.now() + 300_000;
      for (;;) {
        const status = await send({ cmd: 'voice_status' }, ['status'], 20_000);
        if (status.loaded === true) break;
        if (status.loading !== true) throw new Error('받아쓰기 모델을 못 올렸다');
        if (Date.now() > until) throw new Error('받아쓰기 모델이 너무 오래 안 올라온다');
        log('모델 올리는 중…');
        await new Promise((done) => setTimeout(done, 2000));
      }
      loaded = true;
      log('받아쓸 준비가 됐다');
    },

    async startRecording(): Promise<void> {
      await this.warmUp();
      await send({ cmd: 'voice_record_start' }, ['record_started'], 20_000);
    },

    async stopRecording(): Promise<string | null> {
      const event = await send({ cmd: 'voice_record_stop' }, ['transcribed'], 180_000);
      const text = String(event.text ?? '').trim();
      // 조용한 녹음은 「-」 나 「...」 같은 부스러기로 돌아온다. 그걸 말로 세면
      // 동반자가 아무도 안 한 말에 대답한다.
      const hasWords = /[\p{L}\p{N}]/u.test(text);
      return hasWords ? text : null;
    },

    shutdown(): void {
      if (child === null) return;
      try {
        child.stdin.write(`${JSON.stringify({ cmd: 'shutdown' })}\n`, 'utf8');
      } catch {
        // 이미 죽었으면 그만이다.
      }
      child.kill();
      child = null;
      loaded = false;
    },
  };
}
