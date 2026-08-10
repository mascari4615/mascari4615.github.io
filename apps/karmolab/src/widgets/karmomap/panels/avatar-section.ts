/**
 * panels/avatar-section.ts — 노드 얼굴 (TASK-KL-202 개편 2, 노드 패널 두 번째 조각).
 *
 * 얼굴은 세 갈래 중 **마지막에 고른 것 하나**만 남는다(이모지 / 색 / 사진). 셋을 겹쳐 두면
 * 「지금 뭐가 보이는지」를 사람이 추측해야 한다.
 */
import type { GraphNode } from '../../../lib/graph/spec';
import type { PanelCtx } from './context';
import { t, loadNamespace } from '../../../lib/i18n';

export function avatarFieldHtml(ctx: PanelCtx, node: GraphNode): string {
  const esc = ctx.esc;
  return `
    <div class="km-field">
      <label>${esc(t('karmomap.t393'))}</label>
      <div class="km-avatar-row">
        <input type="text" data-km="edit-emoji" maxlength="4" placeholder="😀"
          value="${esc(node.avatar?.kind === 'emoji' ? node.avatar.value : '')}" />
        <input type="color" data-km="edit-color"
          value="${esc(node.avatar?.kind === 'color' ? node.avatar.value : '#a78bfa')}" title="${esc(t('karmomap.t390'))}" />
        <button class="btn btn-ghost" data-km="edit-img" title="${esc(t('karmomap.t391'))}">🖼</button>
        <button class="btn btn-ghost" data-km="edit-noface" title="${esc(t('karmomap.t392'))}">✕</button>
      </div>
      <div class="km-hint">${esc(t('karmomap.t394'))}</div>
    </div>`;
}

/** `touch` = 위젯이 쥔 「고치면 다시 그리고 저장」 뒷정리. 패널마다 다시 짜지 않는다. */
export function bindAvatarField(
  ctx: PanelCtx,
  node: GraphNode,
  touch: (redrawSide: boolean) => void
): void {
  const side = ctx.side;
  const emojiInput = side.querySelector('[data-km="edit-emoji"]') as HTMLInputElement;
  emojiInput.oninput = () => {
    const v = emojiInput.value.trim();
    node.avatar = v ? { kind: 'emoji', value: v } : undefined;
    touch(false);
  };
  (side.querySelector('[data-km="edit-color"]') as HTMLInputElement).oninput = (ev) => {
    node.avatar = { kind: 'color', value: (ev.target as HTMLInputElement).value };
    touch(true);
  };
  (side.querySelector('[data-km="edit-img"]') as HTMLButtonElement).onclick = () => {
    ctx.openAvatarPicker(node.id);
  };
  (side.querySelector('[data-km="edit-noface"]') as HTMLButtonElement).onclick = () => {
    node.avatar = undefined;
    touch(true);
  };
}
