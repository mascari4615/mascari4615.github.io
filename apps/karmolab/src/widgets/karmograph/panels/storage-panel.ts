/**
 * panels/storage-panel.ts — 저장 상태 (TASK-KL-202 개편 2, 세 번째 이사).
 *
 * 이 패널은 앞의 둘과 달리 **위젯의 손**이 여럿 필요하다(맵 목록·파일 내려받기·직전 판 되살리기).
 * 그래서 `PanelCtx` 에 그만큼을 더 담았다 — 패널이 위젯 안을 뒤지지 않고 **빌린 것만** 쓰게.
 */
import { measureStorage, humanBytes } from '../storage-health';
import type { PanelCtx } from './context';
import { t, loadNamespace } from '../../../lib/i18n';

export function renderStoragePanel(ctx: PanelCtx): void {
  const { side, esc } = ctx;
  side.classList.remove('hidden');
  ctx.canvas()?.setSelectedNode(null);

  const rep = measureStorage();
  side.innerHTML = `
    <h4>${esc(t('karmograph.t261'))}</h4>
    <div class="km-hint">${esc(t('karmograph.t262'))}</div>
    <div class="km-field">
      <label>${humanBytes(rep.used)} / 약 ${humanBytes(rep.budget)} (${Math.round(rep.ratio * 100)}%)</label>
      <div class="km-meter"><div class="km-meter-fill" style="width:${Math.min(100, Math.round(rep.ratio * 100))}%;
        background:${rep.warn ? '#f87171' : '#34d399'}"></div></div>
      ${rep.warn
        ? t('karmograph.t274')
        : ''}
    </div>
    <div class="km-field">
      <label>${esc(t('karmograph.t263'))}</label>
      ${rep.items.slice(0, 8).map((it) => `<div class="km-link-row">
        <span class="km-link-name">${esc(ctx.mapNameOfKey(it.key))}</span>
        <span class="km-group-count">${humanBytes(it.bytes)}</span>
      </div>`).join('')}
    </div>
    <button class="btn btn-ghost" data-km="st-prev">${esc(t('karmograph.t264'))}</button>
    <div class="km-hint">${t('karmograph.hint11', { em: `<b>${esc(t('karmograph.t266'))}</b>` })}</div>
    <button class="btn btn-primary" data-km="st-backup">${esc(t('karmograph.t268'))}</button>
    <button class="btn btn-ghost" data-km="st-restore">${esc(t('karmograph.t269'))}</button>
    <div class="km-hint">${t('karmograph.hint12', { em: `<b>${esc(t('karmograph.t271'))}</b>` })}</div>
    <button class="btn btn-ghost" data-km="st-close">${esc(t('karmograph.t273'))}</button>`;

  (side.querySelector('[data-km="st-close"]') as HTMLButtonElement).onclick = ctx.goNode;
  (side.querySelector('[data-km="st-restore"]') as HTMLButtonElement).onclick = ctx.openRestore;
  (side.querySelector('[data-km="st-backup"]') as HTMLButtonElement).onclick = ctx.backupAllMaps;
  (side.querySelector('[data-km="st-prev"]') as HTMLButtonElement).onclick = ctx.restorePrevRevision;
}
