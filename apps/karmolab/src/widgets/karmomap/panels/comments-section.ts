/**
 * panels/comments-section.ts — 코멘트 (TASK-KL-202 방향③, Milanote 계보).
 *
 * 설명(`doc`)은 「그것이 무엇인가」, 코멘트는 「보다가 든 생각」이다. 한 칸에 몰면 설명이 잡담으로
 * 더러워지거나 잡담이 설명인 척한다. 그래서 **여러 개 · 시간순**으로 따로 쌓고, 카드에는 개수만 뱃지로.
 *
 * 남과 함께 볼 때를 위한 자리이기도 하다 — 보기 전용으로 받은 사람이 「여기 이상해요」를 남길
 * 유일한 칸이다(다음 조각에서 보기 전용에도 열어 줄 예정).
 */
import type { GraphComment } from '../../../lib/graph/spec';
import type { PanelCtx } from './context';
import { t, loadNamespace } from '../../../lib/i18n';

function listOf(ctx: PanelCtx): GraphComment[] {
  const spec = ctx.spec();
  if (!spec.comments) spec.comments = [];
  return spec.comments;
}

/** 시간을 사람 말로 — 몇 분 전인지가 날짜보다 훨씬 자주 필요하다. */
function ago(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return t('karmomap.t401');
  if (s < 3600) return t('karmomap.minsAgo', { n: Math.floor(s / 60) });
  if (s < 86400) return t('karmomap.hoursAgo', { n: Math.floor(s / 3600) });
  return new Date(at).toLocaleDateString('ko-KR');
}

export function commentsSectionHtml(ctx: PanelCtx, onId: string): string {
  const esc = ctx.esc;
  const rows = listOf(ctx).filter((c) => c.on === onId).sort((a, b) => a.at - b.at);
  return `
    <div class="km-field">
      <label>코멘트 ${rows.length === 0 ? '' : `<span class="km-group-count">${rows.length}</span>`}</label>
      <div class="km-hint">${t('karmomap.hint01', { em: `<b>${esc(t('karmomap.t398'))}</b>` })}</div>
      ${rows.map((c) => `<div class="km-link-row">
        <span class="km-link-name">${esc(c.text)}</span>
        <span class="km-group-count">${esc(ago(c.at))}</span>
        <button class="btn btn-ghost" data-km="cmt-del" data-key="${esc(c.id)}" title="${esc(t('karmomap.t395'))}">×</button>
      </div>`).join('')}
      <div class="km-link-row">
        <input type="text" data-km="cmt-new" placeholder="${esc(t('karmomap.t396'))}" />
        <button class="btn btn-ghost" data-km="cmt-add">${esc(t('karmomap.t400'))}</button>
      </div>
    </div>`;
}

export function bindCommentsSection(ctx: PanelCtx, onId: string, touch: (redrawSide: boolean) => void): void {
  const side = ctx.side;
  const add = (): void => {
    const box = side.querySelector('[data-km="cmt-new"]') as HTMLInputElement | null;
    const text = (box?.value ?? '').trim();
    if (!text) return;
    listOf(ctx).push({ id: `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`, on: onId, text, at: Date.now() });
    touch(true);
  };
  (side.querySelector('[data-km="cmt-add"]') as HTMLButtonElement).onclick = add;
  (side.querySelector('[data-km="cmt-new"]') as HTMLInputElement).onkeydown = (ev) => {
    if ((ev as KeyboardEvent).key === 'Enter') { ev.preventDefault(); add(); }
  };
  side.querySelectorAll('[data-km="cmt-del"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      const id = (el as HTMLElement).dataset.key ?? '';
      ctx.spec().comments = listOf(ctx).filter((c) => c.id !== id);
      touch(true);
    };
  });
}
