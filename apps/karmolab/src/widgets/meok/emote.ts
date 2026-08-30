/**
 * 이모트 규격. 그리는 사람이 외울 것을 도구가 대신 지킴.
 *
 * 규격은 사람이 외우기엔 많고 기계가 지키기엔 쉽다. 지금 이모트를 만드는 사람은 그림 도구와
 * 크기 바꾸는 사이트와 용량 줄이는 사이트를 오간다. 그 왕복을 없애는 것이 이 파일의 목적.
 *
 * 값은 2026-08-29 확인 (`memo/projects/karmolab/reference/그림도구-시장-해체.md`).
 * 플랫폼이 규격을 바꾸면 여기와 그 문서를 같이.
 *
 * 이 파일은 브라우저를 모른다. 크기와 한도만 셈하고 그림은 안 만짐.
 */

export type EmoteFormat = 'png' | 'gif' | 'apng';

export interface EmotePreset {
  id: string;
  /** 사람에게 보일 이름. 화면 글은 i18n 이 맡고 이건 마지막 대비책. */
  label: string;
  /** 뽑을 크기. 큰 것부터. */
  sizes: number[];
  /** 파일 하나당 한도(바이트). 움직이는 것과 멈춘 것이 다르면 둘로 나눈다. */
  limitStill: number;
  limitAnimated: number;
  /** 움직일 때 쓸 형식. */
  animated: EmoteFormat;
  /** 알아 둘 함정. 화면에 그대로 띄운다. */
  note: string;
}

const KB = 1024;

export const EMOTE_PRESETS: EmotePreset[] = [
  {
    id: 'twitch',
    label: 'Twitch',
    sizes: [112, 56, 28],
    limitStill: 1000 * KB,
    limitAnimated: 1000 * KB,
    animated: 'gif',
    note: '28 에서 디테일이 죽는다. 올리기 전에 그 크기를 봐라'
  },
  {
    id: 'discord-emoji',
    label: 'Discord 이모지',
    sizes: [128],
    limitStill: 256 * KB,
    limitAnimated: 256 * KB,
    animated: 'gif',
    note: '2초 애니가 256KB 를 쉽게 넘는다. 넘으면 프레임을 줄여라'
  },
  {
    id: 'discord-sticker',
    label: 'Discord 스티커',
    sizes: [320],
    limitStill: 512 * KB,
    limitAnimated: 512 * KB,
    animated: 'apng',
    note: '움직이는 것은 APNG 만 받는다'
  },
  {
    id: 'seventv',
    label: '7TV',
    sizes: [256, 128],
    limitStill: 2500 * KB,
    limitAnimated: 2500 * KB,
    animated: 'gif',
    note: '32 이하로 올리면 최근접 확대가 걸린다'
  }
];

export const findPreset = (id: string): EmotePreset =>
  EMOTE_PRESETS.find(preset => preset.id === id) || EMOTE_PRESETS[0];

/**
 * 원본 넓이와 높이를 규격 한 변에 맞춘다. 이모트 자리는 정사각이라 **긴 변**을 맞추고
 * 짧은 쪽은 비율대로. 잘라 내지 않는다. 자르면 그린 것이 사라짐.
 */
export function fitBox(w: number, h: number, box: number): { w: number; h: number } {
  const long = Math.max(w, h);
  if (long <= 0) return { w: 1, h: 1 };
  const scale = box / long;
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** 이 크기와 장수로 뽑을 파일 이름. 크기가 하나뿐이면 크기를 안 붙인다. */
export function emoteName(base: string, size: number, format: EmoteFormat, sizeCount: number): string {
  const ext = format === 'apng' ? 'png' : format;
  return sizeCount > 1 ? base + '-' + size + '.' + ext : base + '.' + ext;
}

/** 한도 대비 얼마나 찼나. 1 을 넘으면 못 올린다. */
export const limitRatio = (bytes: number, preset: EmotePreset, animated: boolean): number =>
  bytes / (animated ? preset.limitAnimated : preset.limitStill);

/**
 * 한도를 넘었을 때 무엇을 줄이면 되나. 장수를 줄이는 쪽이 크기보다 먼저.
 * 크기는 플랫폼이 정한 값이라 손댈 수 없고, 장수는 만드는 사람의 몫.
 */
export function overBudgetHint(bytes: number, frames: number, preset: EmotePreset, animated: boolean): string {
  const ratio = limitRatio(bytes, preset, animated);
  if (ratio <= 1) return '';
  if (!animated) return '한도를 ' + Math.round((ratio - 1) * 100) + '% 넘었다. 색을 줄여 봐라';
  const keep = Math.max(2, Math.floor(frames / ratio));
  return '한도를 ' + Math.round((ratio - 1) * 100) + '% 넘었다. 장을 ' + frames + '에서 ' + keep + ' 로 줄여 봐라';
}
