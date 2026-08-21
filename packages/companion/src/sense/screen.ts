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
  /** 실제로 찍는 일. 검사에서 갈아끼운다. 돌려주는 값은 창 이름 + 창 안에서 읽은 것들. */
  capture?: (outPath: string) => Promise<Screenshot>;
}

/** 창 안에서 글자로 읽어 낸 것 하나 — 갈래(k) · 적힌 말(n) · 자리(r = x,y,w,h). */
export interface ScreenElement {
  k: string;
  n: string;
  r: readonly number[];
}

/** 한 번 볼 때 들어오는 것 — 그림은 파일로, 글자는 여기로. */
export interface Screenshot {
  title: string;
  elements: readonly ScreenElement[];
}

/**
 * 지금 눈에 보이는 것 — **그림 한 장이 아니다.**
 *
 * 그림만 보는 건 같은 자리에서 늘 무너진다(작은 글자). 그래서 창을 글자로도 읽어
 * 나란히 준다 — 밖에서도 이게 2026 의 합의다(접근성 트리 + 그림).
 */
export interface Seeing {
  imagePath: string;
  text: string;
}

/**
 * 눈 — 감각이면서, 물으면 「지금 보이는 것」을 내준다.
 *
 * 감각으로만 두면 그림은 화면 감각이 만든 turn 에만 붙는다. 사람이 말을 건 turn 에는
 * 눈이 감겨 있었다(99회차 라이브에서 창 제목으로 답했다). 그래서 눈을 **물어볼 수 있게**
 * 만든다 — 코어가 매 turn 여기에 묻는다.
 */
export interface ScreenEye extends Sense {
  /** 지금 보이는 것(그림 + 읽은 글자). 묵었으면 새로 찍고 준다. 못 찍었으면 null. */
  seeing(): Promise<Seeing | null>;
  /** 지금 당장 한 번 찍는다. */
  lookNow(): Promise<Screenshot | null>;
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
  let shooting: Promise<Screenshot | null> | null = null;
  /** 마지막으로 읽어 낸 것 — 「지금 보이는 것」을 물으면 이걸 글로 편다. */
  let last: Screenshot | null = null;

  async function shot(): Promise<Screenshot | null> {
    if (shooting !== null) return shooting;
    shooting = (async () => {
      try {
        const taken = await shoot(shotPath);
        shotAt = now();
        last = taken;
        return taken;
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
      const taken = await shot();
      if (taken === null) return;
      emit({
        channel,
        kind: 'screen',
        text: taken.title === '' ? '화면을 봤다.' : `화면을 봤다. 지금 앞에 있는 창은 「${taken.title}」.`,
        at: Date.now(),
        meta: { imagePath: shotPath, windowTitle: taken.title, screenText: describe(taken) },
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
      if (fresh === false) await shot();
      if (shotAt === 0 || last === null) return null;
      return { imagePath: shotPath, text: describe(last) };
    },
  };
}

/**
 * 읽어 낸 것을 두뇌가 읽을 글로 편다.
 *
 * 표를 그대로 넘기지 않는다 — 두뇌가 보는 건 결국 글이고, 자리(좌표)까지 같이 적어 둬야
 * 나중에 **누를 것**을 고를 수 있다.
 */
function describe(taken: Screenshot): string {
  const head = taken.title === '' ? '지금 앞에 있는 창' : `지금 앞에 있는 창 「${taken.title}」`;
  if (taken.elements.length === 0) return `${head} — 창 안에서 글자로 읽어 낸 것은 없다.`;
  const rows = taken.elements
    .map((e) => `- ${e.k} 「${e.n}」 (${e.r.join(',')})`)
    .join('\n');
  return `${head} 안에서 읽은 것 ${taken.elements.length}개:
${rows}`;
}

/** 찍고 나서 창 이름과 창 안에서 읽은 것들을 돌려준다. */
function capture(outPath: string): Promise<Screenshot> {
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
        const title = /TITLE=(.*)/.exec(stdout)?.[1]?.trim() ?? '';
        let elements: ScreenElement[] = [];
        try {
          const raw = /^TREE=(.*)$/m.exec(stdout)?.[1] ?? '[]';
          const parsed: unknown = JSON.parse(raw);
          /* 글자를 못 읽어도 그림은 나간다 — 한쪽이 없다고 눈이 감기면 안 된다. */
          if (Array.isArray(parsed)) elements = parsed as ScreenElement[];
        } catch {
          elements = [];
        }
        resolve({ title, elements });
      },
    );
  });
}
