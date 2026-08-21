import { execFile } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { Sensation, Sense } from '../types';

export interface ScreenSenseOptions {
  channel?: string;
  /** 몇 ms 마다 화면을 볼까. */
  everyMs: number;
  /** 켜자마자 한 번 볼까. */
  immediate?: boolean;
  /**
   * 지금 화면을 봐도 되나 — false 면 이번 차례를 건너뛴다.
   *
   * 화면 보기는 무겁다(찍고, 옮기고, 그림을 읽는다). 사람이 방금 말을 걸었는데 그게
   * 끼어들면 대답이 그만큼 늦는다. 사람이 먼저다.
   */
  okToLook?: () => boolean;
  /**
   * 「지금 화면」이라고 부를 수 있는 나이. 이보다 묵었으면 물어볼 때 다시 찍는다.
   *
   * 화면 보기 간격(`everyMs`)과 다른 값이다 — 저건 스스로 볼 주기고, 이건 **누가 물었을 때**
   * 내주는 그림의 신선도다. 90초 전 화면을 두고 「지금 뭐 보여」에 답하면 그건 거짓말이다.
   */
  freshMs?: number;
  log?: (message: string) => void;
  /** 시간을 어디서 읽나 — 검사에서 시계를 손에 쥐려고 연다. */
  now?: () => number;
  /** 실제로 찍는 일. 검사에서 갈아끼운다. 돌려주는 값은 지금 앞에 있는 창 제목. */
  capture?: (outPath: string) => Promise<string>;
}

/**
 * 눈 — 감각이면서, 물으면 「지금 보이는 것」을 내준다.
 *
 * 감각으로만 두면 그림은 화면 감각이 만든 turn 에만 붙는다. 사람이 말을 건 turn 에는
 * 눈이 감겨 있었다(99회차 라이브에서 창 제목으로 답했다). 그래서 눈을 **물어볼 수 있게**
 * 만든다 — 코어가 매 turn 여기에 묻는다.
 */
export interface ScreenEye extends Sense {
  /** 지금 보이는 그림의 자리. 묵었으면 새로 찍고 준다. 한 번도 못 찍었으면 null. */
  seeing(): Promise<string | null>;
  /** 지금 당장 한 번 찍는다. */
  lookNow(): Promise<string | null>;
}

/**
 * 화면 감각 — 동반자가 내 화면을 실제로 본다.
 *
 * 그림 자체는 두뇌가 읽는다. 여기서는 「화면을 찍어서 파일로 두고, 그 위치를 알려주는」
 * 일까지만 한다 — 감각 기관은 보는 것이지 해석하는 게 아니다.
 *
 * 찍은 그림은 임시 폴더 한 곳을 계속 덮어쓴다. 화면 기록이 디스크에 쌓이지 않게.
 */
export function screenSense(options: ScreenSenseOptions = { everyMs: 90_000 }): ScreenEye {
  const channel = options.channel ?? 'screen';
  const log = options.log ?? (() => {});
  const now = options.now ?? (() => Date.now());
  const shoot = options.capture ?? capture;
  const freshMs = options.freshMs ?? 20_000;
  const folder = mkdtempSync(join(tmpdir(), 'companion-screen-'));
  const shotPath = join(folder, 'screen.png');

  let timer: NodeJS.Timeout | null = null;
  let busy = false;
  /** 마지막으로 실제로 찍힌 시각. 0 = 한 번도 못 찍었다. */
  let shotAt = 0;
  /** 찍는 중이면 그 일을 같이 기다린다 — 두 번 찍지 않는다. */
  let shooting: Promise<string | null> | null = null;

  async function shot(): Promise<string | null> {
    if (shooting !== null) return shooting;
    shooting = (async () => {
      try {
        const title = await shoot(shotPath);
        shotAt = now();
        return title;
      } catch (e) {
        log(`화면을 못 봤다: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      } finally {
        shooting = null;
      }
    })();
    return shooting;
  }

  async function look(emit: (sensation: Sensation) => void): Promise<void> {
    // 앞의 촬영이 안 끝났으면 건너뛴다 — 밀린 화면이 쌓이면 「지금」이 아니게 된다.
    if (busy) return;
    if (options.okToLook?.() === false) return;
    busy = true;
    try {
      const title = await shot();
      if (title === null) return;
      emit({
        channel,
        kind: 'screen',
        text: title === '' ? '화면을 봤다.' : `화면을 봤다. 지금 앞에 있는 창은 「${title}」.`,
        at: Date.now(),
        meta: { imagePath: shotPath, windowTitle: title },
      });
    } finally {
      busy = false;
    }
  }

  return {
    name: `${channel}:sense`,
    start(emit) {
      if (options.immediate) void look(emit);
      timer = setInterval(() => void look(emit), options.everyMs);
      timer.unref?.();
    },
    stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
    async lookNow() {
      return shot();
    },
    async seeing() {
      const fresh = shotAt !== 0 && now() - shotAt <= freshMs;
      if (fresh) return shotPath;
      const title = await shot();
      return title === null && shotAt === 0 ? null : shotPath;
    },
  };
}

/** 찍고 나서 지금 앞에 있는 창 제목을 돌려준다. */
function capture(outPath: string): Promise<string> {
  const script = join(dirname(__filename), '..', '..', 'assets', 'capture-screen.ps1');
  return new Promise((resolve, reject) => {
    execFile(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-OutPath', outPath],
      { timeout: 30_000, windowsHide: true, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error((stderr || error.message).slice(0, 300)));
          return;
        }
        const match = /TITLE=(.*)/.exec(stdout);
        resolve((match?.[1] ?? '').trim());
      },
    );
  });
}
