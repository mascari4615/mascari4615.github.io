/**
 * panels/context.ts — 패널이 위젯에게 빌리는 것들 (TASK-KL-202 개편 2).
 *
 * `karmomap.ts` 가 2500 줄을 넘었고 그 절반이 **패널 아홉 개**였다. 그냥 파일만 쪼개면
 * 인자가 스무 개씩 붙어 더 나빠진다 — 그래서 **빌려 쓰는 것을 한 덩이(`PanelCtx`)로 묶어**
 * 넘긴다. 패널은 이 덩이 하나만 알면 되고, 위젯은 한 군데서 채워 준다.
 *
 * 한 번에 다 옮기지 않는다. **의존이 가장 적은 패널부터** 하나씩 — 큰 이사를 한 번에 하면
 * 무엇이 깨졌는지 알 수 없고, 화면 검사(35항목)가 있어도 되돌릴 지점이 없어진다.
 */
import type { GraphCanvas } from '../../../lib/graph/canvas';
import type { GraphSpec } from '../../../lib/graph/spec';

export interface PanelCtx {
  /** 패널이 그려질 자리. 패널은 여기 `innerHTML` 을 통째로 쓴다. */
  side: HTMLElement;
  /** 지금 맵. 읽기만 — 고치는 것은 위젯이 준 함수로. */
  spec: () => GraphSpec;
  canvas: () => GraphCanvas | null;
  /** 화면 상태를 바꾸고 다시 그린다. */
  goNode: () => void;
  /** 그 노드를 골라 보여 준다. */
  focusNode: (nodeId: string) => void;
  /** 구조를 고쳤을 때 — 저장 + 되돌리기 한 걸음. */
  persist: () => void;
  /** 다시 그리기 (패널 자신 포함). */
  refresh: () => void;
  esc: (s: string) => string;
}
