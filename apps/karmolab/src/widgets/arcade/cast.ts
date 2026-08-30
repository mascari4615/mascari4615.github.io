/**
 * 판에 앉는 사람들 (MDD, `memo/rules/mdd.md`)
 *
 * 이름 열여섯(`bots.ts`)은 자리를 채운 것이지 **같이 논 것이 아님**. 여기서는 WM 저택 사람들이 앉음
 * 카드 정본은 `memo/characters/<slug>/card.md`. 여기 있는 말투와 대사는 그 카드를 따른 **임시** 문구
 *
 * 임시인 것(사용자가 바꾼다): 얼굴은 기하 도형, 대사, 표정, 반응. 구조만 먼저
 * TODO 목소리, 인연, 스킨, 각성. TODO 단계와 사람의 대응은 사용자 그릴 뒤 확정
 */
export type CastSlug = 'yawn' | 'alisa' | 'ling' | 'me';
export type Mood = 'calm' | 'think' | 'glad' | 'sad' | 'tease';
export type LineKey = 'hello' | 'move' | 'good' | 'danger' | 'undo' | 'win' | 'lose' | 'hurry' | 'again';

export interface Cast {
  slug: CastSlug;
  name: string;
  /** 얼굴 도형. 그림이 올 때까지 */
  shape: 'circle' | 'square' | 'triangle' | 'diamond';
  hue: string;
  lines: Partial<Record<LineKey, string[]>>;
}

export const CAST: Record<CastSlug, Cast> = {
  yawn: {
    slug: 'yawn',
    name: '욘',
    shape: 'circle',
    hue: '#b9a6e8',
    lines: {
      hello: ['...아, 조수. 한 판?', '하암. 앉아.'],
      move: ['음.', '여기.', '...'],
      good: ['오, 제법.'],
      danger: ['...귀찮게 하네.'],
      undo: ['무르기? 뭐, 그러든가.'],
      win: ['끝. 자러 갈래.', '이겼다. 하암.'],
      lose: ['...졌네. 한 번 더는 내일.'],
      hurry: ['시간... 가.'],
      again: ['또? 하암.']
    }
  },
  alisa: {
    slug: 'alisa',
    name: '알리사',
    shape: 'square',
    hue: '#9fb3c8',
    lines: {
      hello: ['조수님. 시작하겠습니다.'],
      move: ['여기로.', '두겠습니다.'],
      good: ['좋은 수입니다.'],
      danger: ['막겠습니다.'],
      undo: ['무르기. 기록해 두겠습니다.'],
      win: ['제가 이겼습니다. 정리하겠습니다.'],
      lose: ['졌습니다. 복기하겠습니다.'],
      hurry: ['시간이 얼마 없습니다.'],
      again: ['다시 두시겠습니까.']
    }
  },
  ling: {
    slug: 'ling',
    name: '링',
    shape: 'triangle',
    hue: '#f2d16b',
    lines: {
      hello: ['조수! 나랑 놀자~', '헤헷, 내가 이길 거야'],
      move: ['여기다!', '에잇!'],
      good: ['에엣, 잘 두네...'],
      danger: ['안 돼 안 돼!'],
      undo: ['물러 줄게. 이번만이야?'],
      win: ['이겼다! 헤헷', '봤지? 봤지?'],
      lose: ['으으... 다음엔 안 봐줘'],
      hurry: ['빨리빨리!'],
      again: ['한 판 더! 한 판 더!']
    }
  },
  me: { slug: 'me', name: '조수', shape: 'diamond', hue: '#e8dcc4', lines: {} }
};

/** 플레이어가 보내는 반응. 임시 여섯 */
export const EMOTES = ['ㅎㅎ', '앗', '좋은 수', '흠...', '고마워', '한 판 더'];

/** 단계 -> 사람. 임시: 1~2 링, 3~4 알리사, 5 욘. 사용자 그릴 뒤 확정 */
export function castOfLevel(level: number): Cast {
  if (level >= 5) return CAST.yawn;
  if (level >= 3) return CAST.alisa;
  return CAST.ling;
}

export function castByName(name: string): Cast | null {
  for (const c of Object.values(CAST)) if (c.name === name) return c;
  return null;
}

/** 대사 한 줄. 없으면 빈 문자열 */
export function lineOf(cast: Cast, key: LineKey, rng: () => number = Math.random): string {
  const pool = cast.lines[key];
  if (!pool || !pool.length) return '';
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * 얼굴. 기하 도형 하나에 눈 둘. 표정은 눈과 기울기만 바뀐다(임시).
 * 그림이 오면 이 함수가 `<img>` 를 돌려주면 된다. 부르는 쪽은 모름
 */
export function faceSvg(cast: Cast, mood: Mood): string {
  const body =
    cast.shape === 'circle' ? '<circle cx="32" cy="32" r="26"/>' :
    cast.shape === 'square' ? '<rect x="8" y="8" width="48" height="48" rx="6"/>' :
    cast.shape === 'triangle' ? '<path d="M32 6 L58 56 L6 56 Z"/>' :
    '<path d="M32 4 L60 32 L32 60 L4 32 Z"/>';
  const eyes =
    mood === 'glad' ? '<path d="M22 34q4-5 8 0M34 34q4-5 8 0" stroke="#2a2118" stroke-width="2.5" fill="none" stroke-linecap="round"/>' :
    mood === 'sad' ? '<path d="M22 36q4 4 8 0M34 36q4 4 8 0" stroke="#2a2118" stroke-width="2.5" fill="none" stroke-linecap="round"/>' :
    mood === 'tease' ? '<circle cx="26" cy="34" r="2.6" fill="#2a2118"/><path d="M34 34h8" stroke="#2a2118" stroke-width="2.5" stroke-linecap="round"/>' :
    mood === 'think' ? '<circle cx="26" cy="35" r="2.4" fill="#2a2118"/><circle cx="38" cy="33" r="2.4" fill="#2a2118"/><circle cx="50" cy="16" r="2" fill="#2a2118" opacity=".7"/><circle cx="55" cy="10" r="1.4" fill="#2a2118" opacity=".5"/>' :
    '<circle cx="26" cy="34" r="2.6" fill="#2a2118"/><circle cx="38" cy="34" r="2.6" fill="#2a2118"/>';
  return `<svg viewBox="0 0 64 64" width="56" height="56" data-mood="${mood}"><g fill="${cast.hue}" stroke="rgba(0,0,0,.25)" stroke-width="1.5">${body}</g>${eyes}</svg>`;
}
