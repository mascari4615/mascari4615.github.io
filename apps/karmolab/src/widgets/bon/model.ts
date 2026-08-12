/**
 * 「본」 — 도형 문서 (TASK-KL-254 · 1단계)
 *
 * 이름은 거푸집의 「본」이다. 손으로 한 장씩 그리는 도구가 아니라 **숫자를 돌려 찍어내는** 틀이다.
 *
 * 「먹」과 무엇이 다른가: 먹은 픽셀 판(`Surface`)을 들고, 확대하면 깨진다. 여기는 **도형 노드**를
 * 들고, 확대해도 안 깨지며 숫자 하나를 바꾸면 전체가 다시 그려진다. 그래서 한 설정에서 변형
 * 수십 장을 뽑을 수 있다 — 게임 UI 에셋 2,000 장이 그렇게 나온다.
 *
 * 먹의 문서 모델을 억지로 같이 쓰지 않는다(측정하고 내린 결론이다). 합성·저장·붓은 픽셀을
 * 알아야 하는 일이라 뜻이 갈린다. 진짜로 같은 것 — **되돌리기** — 만 `lib/history` 로 함께 쓴다.
 *
 * 브라우저를 모른다. `document` 도 `canvas` 도 안 쓴다 — 화면 없이 검사하고, 나중에 서버에서
 * 뽑아낼 때도 이 파일이 그대로 쓰인다.
 */

/** 색 하나. 단색이거나, 두 색 사이를 잇는 결이거나. */
export type Paint =
  | { kind: 'solid'; color: string; opacity?: number }
  | { kind: 'linear'; from: string; to: string; angle: number; opacity?: number };

/** 테두리. 없으면 안 그린다. */
export interface Stroke {
  paint: Paint;
  width: number;
  /** 안쪽·가운데·바깥 — SVG 는 가운데만 알아서, 안/바깥은 그릴 때 크기를 옮겨 흉내낸다. */
  align?: 'inside' | 'center' | 'outside';
}

/** 도형 하나. 좌표는 모두 문서 좌표(px)다. */
export type Node =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; radius: number; fill?: Paint; stroke?: Stroke; opacity?: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill?: Paint; stroke?: Stroke; opacity?: number }
  | { kind: 'path'; d: string; fill?: Paint; stroke?: Stroke; opacity?: number }
  | { kind: 'group'; children: Node[]; opacity?: number };


/**
 * 칠할 수 있는 도형 — 무리(group)는 자기 색이 없다(자식이 각자 든다).
 * 화면이 「채우기·테두리」를 만질 때 이걸로 먼저 걸러야 무리에 없는 자리를 안 건드린다.
 */
export type PaintableNode = Exclude<Node, { kind: 'group' }>;
export const isPaintable = (node: Node): node is PaintableNode => node.kind !== 'group';

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  /** 0..1 */
  opacity: number;
  nodes: Node[];
}

export interface Doc {
  /** 판 크기(px). 벡터라 화면에서는 얼마든지 키워 볼 수 있다 — 이건 내보낼 때의 기준이다. */
  w: number;
  h: number;
  /** 뒤에서 앞 순서. 배열 끝이 위에 그려진다. */
  layers: Layer[];
}

let seq = 0;
/** 이름표. 시각이 아니라 세는 수로 만든다 — 같은 밀리초에 둘을 만들어도 안 겹친다. */
export const nextId = (prefix = 'l'): string => `${prefix}${++seq}`;

export function createDoc(w = 256, h = 256): Doc {
  return { w, h, layers: [{ id: nextId(), name: '레이어 1', visible: true, opacity: 1, nodes: [] }] };
}

export function addLayer(doc: Doc, name?: string): Layer {
  const layer: Layer = { id: nextId(), name: name ?? `레이어 ${doc.layers.length + 1}`, visible: true, opacity: 1, nodes: [] };
  doc.layers.push(layer);
  return layer;
}

/** 도형 개수 — 무리 안까지 센다(검사에서 「정말 들어갔나」를 볼 때 쓴다). */
export function countNodes(nodes: Node[]): number {
  return nodes.reduce((sum, n) => sum + (n.kind === 'group' ? countNodes(n.children) : 1), 0);
}

/** 깊은 사본. 되돌리기가 옛 모습을 들고 있어야 하는데, 같은 객체를 들면 같이 바뀐다. */
export const cloneDoc = (doc: Doc): Doc => JSON.parse(JSON.stringify(doc)) as Doc;
