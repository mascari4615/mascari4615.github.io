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
export function optsFor(id: string): GameOpts {
  const choices = SETUPS[id];
  if (!choices) return {};
  const mine = all()[id] || {};
  const out: Record<string, number | boolean> = {};
  for (const c of choices) {
    const v = mine[c.key];
    const known = c.options.some((o) => o.value === v);
    out[c.key] = known ? v : c.fallback;
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
