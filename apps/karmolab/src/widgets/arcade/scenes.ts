/**
 * 방 스킨 (change.arcade-redesign). 판을 놓는 방이 여럿
 *
 * 룰이 아니라 **취향**. 씨앗과 함께 실리지 않고 이 브라우저에만 남음. 판 도중에도 갈아 끼움
 * (판은 커널이 들고 있으므로 화면만 새로 세우면 된다).
 *
 * 레퍼런스(스팀 오목 게임, `memo/projects/karmolab/reference/omok-gaja.md`)는 다다미방, 서재, 거실,
 * 밤 책상 넷. 넷 다 있다. 그림과 소리는 전부 코드로 굽는다(파일 0)
 */
export type SceneId = 'tatami' | 'desk' | 'study' | 'living' | 'bar';

export interface SceneSpec {
  id: SceneId;
  /** i18n 키 */
  label: string;
  /** 소리 목소리 (`ambience.ts`). 바는 `bar-ambience.ts` 가 따로(밤 목소리는 안 쓴다) */
  voice: 'day' | 'night' | 'study' | 'living';
  /** 이 놀이에서만. 없으면 어느 놀이든 */
  only?: string;
}

export const SCENES: readonly SceneSpec[] = [
  { id: 'tatami', label: 'arcade.scene.tatami', voice: 'day' },
  { id: 'desk', label: 'arcade.scene.desk', voice: 'night' },
  { id: 'study', label: 'arcade.scene.study', voice: 'study' },
  { id: 'living', label: 'arcade.scene.living', voice: 'living' },
  /* 밤의 바 카운터. 주사위 방으로 지은 것이라 야추에서만(사용자 결정: 야추도 넷에 합류, 바는 다섯째) */
  { id: 'bar', label: 'arcade.scene.bar', voice: 'night', only: 'yacht' }
];

/** 이 놀이에서 고를 수 있는 방 */
export const scenesFor = (game?: string): SceneSpec[] => SCENES.filter((s) => !s.only || s.only === game);

const KEY = 'karmolab.arcade.scene';

export function sceneOf(game?: string): SceneId {
  try {
    const v = localStorage.getItem(KEY);
    return scenesFor(game).some((s) => s.id === v) ? (v as SceneId) : 'tatami';
  } catch {
    return 'tatami';
  }
}

export function setScene(id: SceneId): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* 못 적어도 이 판에서는 바뀐다 */
  }
}

/** 다음 방. 버튼 하나로 돌려 가며 고른다 */
export function nextScene(id: SceneId, game?: string): SceneId {
  const list = scenesFor(game);
  const i = list.findIndex((s) => s.id === id);
  return list[(i + 1) % list.length].id;
}

export function specOf(id: SceneId): SceneSpec {
  return SCENES.find((s) => s.id === id) ?? SCENES[0];
}
