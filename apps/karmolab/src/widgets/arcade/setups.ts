/**
 * 시작 전에 고르는 것. 판 크기, 규칙 갈래처럼 **한 판이 도는 내내 안 바뀌는 값**.
 *
 * 판 안에 두지 않는다. 판이 도는 중에 판 크기를 바꾸면 그건 같은 판이 아니다. 그래서 자리는
 * 물건을 집은 화면이고, 고른 값은 `GameOpts` 가 되어 커널로 들어간다(`types.ts`).
 *
 * 놀이마다 여기 한 줄이면 된다. 껍데기는 무엇을 고르는지 모르고 **줄 수만큼 버튼을 그린다**.
 * 그래서 새 놀이가 고를 것을 얻어도 `arcade.ts` 는 한 줄도 안 바뀜
 *
 * 고른 값은 사람별로 남는다. 열아홉 줄을 좋아하는 사람이 매번 다시 고르게 하지 않음
 */
import type { GameOpts } from './types';

/** 고르는 것 하나. 값은 숫자거나 참거짓이다(주소와 편지에 실어야 해서). */
export interface Choice {
  /** `GameOpts` 의 열쇠 */
  key: string;
  /** 이름표 말 묶음 열쇠 */
  label: string;
  /** 고를 수 있는 값과 그 이름표 */
  options: Array<{ value: number | boolean; label: string }>;
  /** 안 고르면 이 값 */
  fallback: number | boolean;
}

/** 놀이마다 고를 것. 없으면 고를 게 없다는 뜻이다 */
export const SETUPS: Record<string, Choice[]> = {
  /* 볼링 프레임. 클럽하우스 51 은 5 와 10. 우리 기본 3 은 짧은 판용 (레퍼런스 2026-09-03) */
  bowling: [
    {
      key: 'frames',
      label: 'arcade.setup.frames',
      options: [
        { value: 3, label: 'arcade.setup.frames.3' },
        { value: 5, label: 'arcade.setup.frames.5' },
        { value: 10, label: 'arcade.setup.frames.10' }
      ],
      fallback: 3
    }
  ],
  /* 지뢰 초급과 중급. 9x9 10 과 16x16 40 (Windows, minesweeper.online) */
  minesweeper: [
    {
      key: 'size',
      label: 'arcade.setup.size',
      options: [
        { value: 9, label: 'arcade.setup.mines.9' },
        { value: 16, label: 'arcade.setup.mines.16' }
      ],
      fallback: 9
    }
  ],
  /* 함대 찾기. 8x8 넷과 표준 10x10 다섯 척 */
  fleet: [
    {
      key: 'size',
      label: 'arcade.setup.size',
      options: [
        { value: 8, label: 'arcade.setup.fleet.8' },
        { value: 10, label: 'arcade.setup.fleet.10' }
      ],
      fallback: 8
    }
  ],
  /* 솔리테어 한 장 뽑기와 세 장 뽑기. 레퍼런스 넷 다 첫 화면에 Turn 1 / Turn 3
     한 장이 쉽고(이김 40~55%) 세 장이 정석 */
  solitaire: [
    {
      key: 'draw',
      label: 'arcade.setup.draw',
      options: [
        { value: 1, label: 'arcade.setup.draw.1' },
        { value: 3, label: 'arcade.setup.draw.3' }
      ],
      fallback: 1
    }
  ],
  yacht: [
    {
      key: 'ai',
      label: 'arcade.setup.ai',
      options: [
        { value: 1, label: 'arcade.setup.ai.1' },
        { value: 2, label: 'arcade.setup.ai.2' },
        { value: 3, label: 'arcade.setup.ai.3' },
        { value: 4, label: 'arcade.setup.ai.4' },
        { value: 5, label: 'arcade.setup.ai.5' }
      ],
      fallback: 3
    }
  ],
  gomoku: [
    {
      key: 'size',
      label: 'arcade.setup.size',
      options: [
        { value: 9, label: 'arcade.setup.size.9' },
        { value: 15, label: 'arcade.setup.size.15' },
        { value: 19, label: 'arcade.setup.size.19' }
      ],
      fallback: 15
    },
    {
      key: 'renju',
      label: 'arcade.setup.renju',
      options: [
        { value: true, label: 'arcade.setup.renju.on' },
        { value: false, label: 'arcade.setup.renju.off' }
      ],
      fallback: true
    },
    {
      key: 'ai',
      label: 'arcade.setup.ai',
      options: [
        { value: 1, label: 'arcade.setup.ai.1' },
        { value: 2, label: 'arcade.setup.ai.2' },
        { value: 3, label: 'arcade.setup.ai.3' },
        { value: 4, label: 'arcade.setup.ai.4' },
        { value: 5, label: 'arcade.setup.ai.5' }
      ],
      fallback: 3
    },
    {
      key: 'limit',
      label: 'arcade.setup.limit',
      options: [
        { value: 0, label: 'arcade.setup.limit.0' },
        { value: 30, label: 'arcade.setup.limit.30' },
        { value: 60, label: 'arcade.setup.limit.60' },
        { value: 120, label: 'arcade.setup.limit.120' }
      ],
      fallback: 0
    }
  ]
};

const KEY = 'karmolab.arcade.setup';

function all(): Record<string, Record<string, number | boolean>> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as unknown;
    return raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, Record<string, number | boolean>>)
      : {};
  } catch {
    return {};
  }
}

/** 이 놀이에서 지금 고른 값. 안 골랐으면 기본값 */
/**
 * 안 고른 값의 기본. 좁은 화면에서는 판을 줄임
 *
 * 15줄 판은 폰 세로(360px)에서 한 칸이 21px 이라 옆 칸이 눌린다(`smoke:arcade-stage` 실측).
 * 9줄이면 36px. 화면의 짧은 쪽이 560px 미만이면 9줄. 고른 적이 있으면 그 값이 먼저다(폰에서도 15줄을 고를 수 있음)
 */
function fallbackOf(id: string, key: string, given: number | boolean): number | boolean {
  if (id !== 'gomoku' || key !== 'size') return given;
  try {
    /* 눕힌 폰은 폭이 넉넉해도 높이가 모자란다. 짧은 쪽으로 잰다(실측: 가로 18px, 작은 가로 16px) */
    return Math.min(window.innerWidth, window.innerHeight) < 560 ? 9 : given;
  } catch {
    return given;
  }
}

export function optsFor(id: string): GameOpts {
  const choices = SETUPS[id];
  if (!choices) return {};
  const mine = all()[id] || {};
  const out: Record<string, number | boolean> = {};
  for (const c of choices) {
    const v = mine[c.key];
    const known = c.options.some((o) => o.value === v);
    out[c.key] = known ? v : fallbackOf(id, c.key, c.fallback);
  }
  return out;
}

/** 하나를 고른다. 브라우저에 남는다 */
export function chooseOpt(id: string, key: string, value: number | boolean): void {
  try {
    const next = all();
    next[id] = { ...(next[id] || {}), [key]: value };
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 저장 못 해도 이번 판은 돈다 */
  }
}
