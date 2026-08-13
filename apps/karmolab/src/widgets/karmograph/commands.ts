/**
 * commands.ts — **할 수 있는 일의 등록부** (TASK-KL-271 R4).
 *
 * 지금까지 ⋯서랍은 손으로 적은 HTML 한 덩이였고, 도움말 목록(`help.ts`)도 손으로 적은 또 한 덩이,
 * 단축키도 또 따로였다. README 에 「새 기능은 여기 한 줄이 늘어야 한다」고 적어 뒀는데 —
 * **사람 규율에 기댄 목록은 반드시 드리프트한다.** 실제로 판 이름 바꾸기가 두 자리에 살아 있었다.
 *
 * 그래서 「무엇을 할 수 있나」를 **한 곳**에 적는다. 서랍이 여기서 그려지고, 검사가 여기와
 * 실제 손잡이(`onclick`)를 맞대 본다 — 등록만 하고 안 이은 것, 잇고 등록 안 한 것이 빨강이 된다.
 * 다음 걸음(명령 팔레트 Ctrl+K)도 같은 목록에서 나온다.
 *
 * 말은 여기 안 박는다 — `label` 은 **읽는 순간** 말 묶음에서 꺼낸다(언어를 바꿔도 따라온다).
 */
import { t } from '../../lib/i18n';

export interface Command {
  /** 손잡이 이름 — 화면의 `data-km` 이자 `onclick` 을 다는 열쇠. */
  key: string;
  /** 사람에게 보일 이름. 말 묶음에서 그때그때 꺼낸다. */
  label: () => string;
  /** 되돌릴 수 없는 일(전부 지우기 등)은 빨간 단추로. */
  danger?: boolean;
  /**
   * ⋯서랍에 **바로 보일** 것인가 (TASK-KL-271 R3).
   * 스물 몇 개를 한 줄기로 늘어놓으면 찾는 데가 아니라 훑는 데가 된다 — 자주 쓰는 것만 펴 놓고,
   * 나머지는 이름을 쳐서 부른다(Ctrl+K). 목록은 그대로다 — 접힐 뿐 사라지지 않는다.
   */
  hot?: boolean;
}

export interface CommandGroup {
  /** 묶음 이름표 — 「보기」 「놓기」 「내보내기」처럼 하는 일끼리. */
  title: () => string;
  items: Command[];
}

/**
 * ⋯서랍의 차림표. **순서가 곧 화면 순서**다.
 *
 * 「보기」 묶음의 배경 무늬 고르개는 단추가 아니라 고르는 칸이라 화면 쪽에 남아 있다 —
 * 여기 목록은 **누르면 무슨 일이 일어나는 것**만 담는다.
 */
export const COMMAND_GROUPS: CommandGroup[] = [
  {
    title: () => t('karmograph.drawer.g.tidy'),
    items: [
      { hot: true, key: 'tidy', label: () => t('karmograph.tidy.label') },
      { key: 'lay-circle', label: () => t('karmograph.layCircle.label') },
      { key: 'lay-tree', label: () => t('karmograph.layTree.label') },
      { key: 'lay-time', label: () => t('karmograph.layTime.label') },
    ],
  },
  {
    title: () => t('karmograph.drawer.g.make'),
    items: [
      { hot: true, key: 'from-text', label: () => t('karmograph.fromText.label') },
      { key: 'stamps', label: () => t('karmograph.stamps.label') },
    ],
  },
  {
    title: () => t('karmograph.drawer.g.out'),
    items: [
      { hot: true, key: 'png', label: () => t('karmograph.png.label') },
      { key: 'svg', label: () => t('karmograph.svg.label') },
      { key: 'svg-story', label: () => t('karmograph.svgStory.label') },
      { hot: true, key: 'export', label: () => t('karmograph.export.label') },
      { key: 'import', label: () => t('karmograph.import.label') },
      { key: 'canvas-out', label: () => t('karmograph.canvasOut.label') },
      { key: 'mermaid', label: () => t('karmograph.mermaid.label') },
    ],
  },
  {
    title: () => t('karmograph.drawer.g.share'),
    items: [
      { key: 'share', label: () => t('karmograph.share.label') },
      { hot: true, key: 'share-view', label: () => t('karmograph.shareView.label') },
      { key: 'storage', label: () => t('karmograph.storage.label') },
    ],
  },
  {
    title: () => t('karmograph.drawer.g.map'),
    items: [
      { hot: true, key: 'map-copy', label: () => t('karmograph.mapCopy.label') },
      { key: 'map-del', label: () => t('karmograph.mapDel.label') },
      { key: 'clear', label: () => t('karmograph.clear.label'), danger: true },
    ],
  },
];

/** 등록된 손잡이 이름 전부 — 검사가 실제 `onclick` 과 맞대 보는 데 쓴다. */
export function commandKeys(): string[] {
  return COMMAND_GROUPS.flatMap((g) => g.items.map((c) => c.key));
}
