/**
 * panels/look-section.ts — 모양과 기울기 (TASK-KL-202 개편 2, 노드 패널 다섯 번째 조각).
 *
 * 모양 목록은 위젯이 쥐고 있는 것을 그대로 받는다(카드·동그라미·말풍선·메모·사진 카드).
 * 기울기는 슬라이더 — 숫자를 치게 하면 「몇 도가 삐딱한가」를 사람이 계산해야 한다.
 */
import type { GraphNode, NodeShape } from '../../../lib/graph/spec';
import type { PanelCtx } from './context';
import { t, loadNamespace } from '../../../lib/i18n';

const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface ShapeOption { id: NodeShape; label: string; icon: string }

export function shapeFieldHtml(ctx: PanelCtx, node: GraphNode, shapes: ShapeOption[]): string {
  const esc = ctx.esc;
  return `
    <div class="km-field">
      <label>${esc(t('karmograph.t437'))}</label>
      <select data-km="edit-shape">
        ${shapes.map((s) => `<option value="${s.id}"${(node.shape ?? 'rect') === s.id ? ' selected' : ''}>${s.icon} ${esc(s.label)}</option>`).join('')}
      </select>
    </div>`;
}

export function tiltFieldHtml(ctx: PanelCtx, node: GraphNode): string {
  void ctx;
  const deg = Math.round(node.rotate ?? 0);
  return `
    <div class="km-field">
      <label>${esc(t('karmograph.t438'))} <span class="km-tilt-val">${deg}°</span></label>
      <input type="range" data-km="edit-rotate" min="-20" max="20" step="1" value="${deg}" />
    </div>`;
}

/** `touch` = 위젯의 「고치면 다시 그리고 저장」 뒷정리. */
export function bindLookFields(ctx: PanelCtx, node: GraphNode, touch: (redrawSide: boolean) => void): void {
  const side = ctx.side;
  (side.querySelector('[data-km="edit-shape"]') as HTMLSelectElement).onchange = (ev) => {
    node.shape = (ev.target as HTMLSelectElement).value as NodeShape;
    touch(false);
  };
  const rotateEl = side.querySelector('[data-km="edit-rotate"]') as HTMLInputElement;
  rotateEl.oninput = () => {
    const deg = Number(rotateEl.value);
    node.rotate = deg === 0 ? undefined : deg;
    const out = side.querySelector('.km-tilt-val');
    if (out) out.textContent = `${deg}°`;
    touch(false);
  };
}
