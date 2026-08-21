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
  /**
   * 이 요소를 가리키는 **번호**.
   *
   * 이름은 안 겹치지 않는다 — 창 하나에 이름 있는 것 19개인데 고유 이름은 12개고 그중
   * 「탭 닫기」가 넷이었다(120회차 실측). 「탭 닫기 눌러」로는 어느 것인지 못 집는다.
   * 밖에서는 그림에 번호를 얹어 푸는데(Set-of-Mark), 우리는 글 목록이라 목록이 번호를 든다.
   */
  i?: number;
  k: string;
  n: string;
  r: readonly number[];
  /**
   * 이 요소에 **할 수 있는 일** — Invoke(누르기) · Toggle · SelectionItem · … 없으면 빈 목록.
   *
   * 읽는 것이 절반이면 나머지 절반은 만지는 것이다. 윈도우에서 만지는 길은 좌표 클릭이
   * 아니라 **컨트롤이 이미 내놓은 동작을 부르는 것**이고(TASK-KAR-241), 그러려면 두뇌가
   * 「이건 누를 수 있다」를 볼 수 있어야 한다.
   */
  p?: readonly string[];
}

/**
 * 나무를 읽으면서 **세어 본 것** — 목록이 왜 이 모양인지 말하려면 이게 있어야 한다.
 *
 * 139회차 실측(돌아가던 창 전부): Discord 532/445/350 · msedge 777/510/**233** ·
 * Unity 9/9/9 (아홉 개뿐이다) · WindowsTerminal 28/19/18 · NVIDIA Overlay **0** · TextInputHost **0**.
 *
 * 0 의 까닭이 넷인데(창을 못 잡음 / 나무가 빔 / 다 이름 없음 / 다 화면 밖) 한 줄로 뭉개면
 * 두뇌는 전부 「화면이 비었다」로 읽는다. 그리고 상한은 120 인데 msedge 는 화면 안에만
 * 233개다 — **절반을 버리고도 목록은 그게 전부인 척한다.**
 */
export interface ScreenReading {
  /** 창을 잡았나. false 면 그 뒤 숫자는 뜻이 없다. */
  root: boolean;
  /** 나무 전체 마디 수. */
  raw?: number;
  /** 그중 이름이 있는 것. */
  named?: number;
  /** 그중 화면 안에 있는 것. */
  onscreen?: number;
}

/** 한 번 볼 때 들어오는 것 — 그림은 파일로, 글자는 여기로. */
export interface Screenshot {
  title: string;
  elements: readonly ScreenElement[];
  /** 나무를 읽으면서 세어 본 것. 옛 판·검사에서는 없을 수 있다. */
  reading?: ScreenReading;
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
/**
 * 글의 좌표를 **찍은 자리 기준**으로 옮긴다.
 *
 * 모니터가 여럿이면 창 좌표가 음수로 난다 — 138회차 실측은 `y=-1080` 이었다.
 * 그 수를 그대로 주면 두뇌는 그림 어디인지 못 얻는다. 찍은 자리의 왼윗위를 0,0 으로 둔다.
 */
function onTheShot(elements: readonly ScreenElement[], originX: number, originY: number): ScreenElement[] {
  if (originX === 0 && originY === 0) return elements as ScreenElement[];
  return elements.map((one) => {
    if (one.r.length < 2) return one;
    /* 자리를 아예 못 잰 것은 0,0,0,0 으로 접혀 있다(104회차). 그걸 옮기면 없던 자리가 생긴다. */
    if (one.r.every((n) => n === 0)) return one;
    return { ...one, r: [one.r[0] - originX, one.r[1] - originY, ...one.r.slice(2)] };
  });
}

/**
 * **더 큰 것이 이미 말한 것은 두 번 안 적는다** (TASK-KAR-248).
 *
 * A11y-Compressor(ACL 2026)는 접근성 나무를 압축해 토큰을 원래의 22% 로 줄이면서 OSWorld
 * 성공률을 +5.1%p 올렸다. 그 세 단계 중 하나가 「중복 지우기」다. 그래서 **먼저 쟀다**
 * (141회차): 판박이 중복(갈래+자리+이름이 같은 것)은 msedge 0% · Discord 3% 였다 —
 * **그 가설은 기각됐다.** 22% 는 남의 숫자다.
 *
 * 다시 재서 나온 것이 **감싸인 잉여**다. 더 큰 것이 같은 이름을 이미 말하고 있는 작은 것
 * (버튼 안의 글자 같은 것):
 *
 *   msedge   화면 안 184 · 지울 수 있는 것   7 (4%)  · 글자수 98%
 *   Discord  화면 안 599 · 지울 수 있는 것 123 (21%) · 글자수 84%
 *
 * **만질 수 있는 것은 안 지운다.** 감싸여 있어도 누를 수 있으면 그건 새 정보다. 실측에서
 * 만질 수 있는 것 292개는 지우기 전후로 그대로 292개였다.
 */
export function dropSwallowed(elements: readonly ScreenElement[]): readonly ScreenElement[] {
  const swallowed = new Set<ScreenElement>();
  for (const small of elements) {
    /* 만질 수 있으면 남긴다 — 누를 수 있다는 것 자체가 정보다. */
    if (small.p !== undefined && small.p.length > 0) continue;
    if (small.n === '') continue;
    if (small.r.length < 4 || small.r[2] <= 0 || small.r[3] <= 0) continue;
    for (const wide of elements) {
      if (wide === small) continue;
      if (!holds(wide.r, small.r)) continue;
      if (wide.n === small.n || wide.n.includes(small.n)) {
        swallowed.add(small);
        break;
      }
    }
  }
  if (swallowed.size === 0) return elements;
  return elements.filter((one) => !swallowed.has(one));
}

/** 바깥 네모가 안쪽 네모를 온전히 품는가. */
function holds(outer: readonly number[], inner: readonly number[]): boolean {
  if (outer.length < 4 || inner.length < 4) return false;
  if (outer[2] <= 0 || outer[3] <= 0) return false;
  return inner[0] >= outer[0]
    && inner[1] >= outer[1]
    && inner[0] + inner[2] <= outer[0] + outer[2]
    && inner[1] + inner[3] <= outer[1] + outer[3];
}

/**
 * 목록에 몇 줄까지 낼까. 창에서 **가져오는** 상한(600)과 다르다 — 가져온 뒤 값어치로 고른다.
 */
const SHOW_AT_MOST = 120;

/**
 * 목록에 **무엇을 넣을까** — 자르는 기준이 「나무 순서」였다 (TASK-KAR-246).
 *
 * 140회차 실측(화면 안에 있는 것만): Discord 599개 중 만질 수 있는 것 292개인데 목록에
 * 든 것은 **59개**였다 — **80%가 밀려났다.** msedge 는 135 중 100. 까닭은 나무 순서로
 * 앞에서 잘랐기 때문이다. 나무 순서는 창틀·툴바가 먼저고 내용이 뒤다. 게다가 만질 수 없는
 * Text 가 자리를 잡아먹는다(Discord 에서 버려진 479개 중 Text 가 203개).
 *
 * 뉴로 대조표에서 우리 갭은 전부 **행동** 쪽이다. 누를 수 있는 것이 목록에 없으면 두뇌는
 * 그것이 **있는 줄도 모른다.**
 *
 * **번호는 안 바꾼다.** 번호는 창을 걷는 순서가 매기고, 누르는 쪽이 같은 순서로 다시 걸어
 * 찾는다. 목록에서 빠졌다고 다시 매기면 엉뚱한 것을 누른다.
 */
export function pickWorthShowing(
  elements: readonly ScreenElement[],
  max: number,
): readonly ScreenElement[] {
  if (elements.length <= max) return elements;
  const canTouch = new Set<ScreenElement>();
  for (const one of elements) {
    if (canTouch.size >= max) break;
    if (one.p !== undefined && one.p.length > 0) canTouch.add(one);
  }
  /* 남는 자리에 읽을 거리. 만질 것만 있으면 무슨 창인지 모른다. */
  let room = max - canTouch.size;
  const keep = new Set(canTouch);
  for (const one of elements) {
    if (room <= 0) break;
    if (keep.has(one)) continue;
    keep.add(one);
    room -= 1;
  }
  /* 걷던 순서로 되돌린다 — 목록은 화면 위에서 아래로 읽혀야 한다. */
  return elements.filter((one) => keep.has(one));
}

/**
 * 목록이 **무엇인지** 말한다 — 없는 것과 못 읽은 것과 잘린 것은 다른 말이다 (TASK-KAR-246).
 */
export function describeScreen(taken: Screenshot): string {
  const head = taken.title === '' ? '지금 앞에 있는 창' : `지금 앞에 있는 창 「${taken.title}」`;
  const read = taken.reading;

  if (taken.elements.length === 0) {
    if (read !== undefined && read.root === false) {
      return `${head} — 이 창은 글로 못 읽는다 (창을 잡지 못했다). 화면이 빈 것이 아니다 — 그림을 봐라.`;
    }
    if (read !== undefined && typeof read.raw === 'number' && read.raw > 0) {
      return `${head} — 이 창은 글로 못 읽는다. 안에 ${read.raw}개가 있는데 이름이 붙어 있으면서 화면 안에 있는 것이 하나도 없다. 화면이 빈 것이 아니다 — 그림을 봐라.`;
    }
    return `${head} — 창 안에서 글자로 읽어 낸 것은 없다.`;
  }

  const rows = taken.elements
    .map((e) => {
      const acts = e.p && e.p.length > 0 ? ` — 할 수 있는 것: ${e.p.join(', ')}` : '';
      const no = typeof e.i === 'number' ? `[${e.i}] ` : '';
      return `- ${no}${e.k} 「${e.n}」 (${e.r.join(',')})${acts}`;
    })
    .join('\n');

  /* 상한에 잘렸으면 잘렸다고 말한다. 안 말하면 두뇌는 이 목록이 전부인 줄 안다. */
  const onscreen = read?.onscreen;
  const cut = typeof onscreen === 'number' && onscreen > taken.elements.length
    ? ` (화면 안에 ${onscreen}개가 있는데 그중 ${taken.elements.length}개를 골라 적었다 — 만질 수 있는 것 먼저다. 더 있다)`
    : '';

  return `${head} 안에서 읽은 것 ${taken.elements.length}개${cut}:
${rows}`;
}

const describe = describeScreen;

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
        const shot = /^ORIGIN=(-?\d+),(-?\d+)$/m.exec(stdout);
        const counted = /^READ=(\w+),(\d+),(\d+),(\d+)$/m.exec(stdout);
        const reading: ScreenReading | undefined = counted === null
          ? undefined
          : {
            root: counted[1] === 'yes',
            raw: Number(counted[2]),
            named: Number(counted[3]),
            onscreen: Number(counted[4]),
          };
        const placed = shot === undefined || shot === null
          ? elements
          : onTheShot(elements, Number(shot[1]), Number(shot[2]));
        resolve({
          title,
          elements: pickWorthShowing(dropSwallowed(placed), SHOW_AT_MOST),
          reading,
        });
      },
    );
  });
}
