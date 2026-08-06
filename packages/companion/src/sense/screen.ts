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
  log?: (message: string) => void;
}

/**
 * 화면 감각 — 동반자가 내 화면을 실제로 본다.
 *
 * 그림 자체는 두뇌가 읽는다. 여기서는 「화면을 찍어서 파일로 두고, 그 위치를 알려주는」
 * 일까지만 한다 — 감각 기관은 보는 것이지 해석하는 게 아니다.
 *
 * 찍은 그림은 임시 폴더 한 곳을 계속 덮어쓴다. 화면 기록이 디스크에 쌓이지 않게.
 */
export function screenSense(options: ScreenSenseOptions = { everyMs: 90_000 }): Sense {
  const channel = options.channel ?? 'screen';
  const log = options.log ?? (() => {});
  const folder = mkdtempSync(join(tmpdir(), 'companion-screen-'));
  const shotPath = join(folder, 'screen.png');

  let timer: NodeJS.Timeout | null = null;
  let busy = false;

  async function look(emit: (sensation: Sensation) => void): Promise<void> {
    // 앞의 촬영이 안 끝났으면 건너뛴다 — 밀린 화면이 쌓이면 「지금」이 아니게 된다.
    if (busy) return;
    if (options.okToLook?.() === false) return;
    busy = true;
    try {
      const title = await capture(shotPath);
      emit({
        channel,
        kind: 'screen',
        text: title === '' ? '화면을 봤다.' : `화면을 봤다. 지금 앞에 있는 창은 「${title}」.`,
        at: Date.now(),
        meta: { imagePath: shotPath, windowTitle: title },
      });
    } catch (e) {
      log(`화면을 못 봤다: ${e instanceof Error ? e.message : String(e)}`);
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
