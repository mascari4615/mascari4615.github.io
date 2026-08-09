/**
 * panels/storage-panel.ts — 저장 상태 (TASK-KL-202 개편 2, 세 번째 이사).
 *
 * 이 패널은 앞의 둘과 달리 **위젯의 손**이 여럿 필요하다(맵 목록·파일 내려받기·직전 판 되살리기).
 * 그래서 `PanelCtx` 에 그만큼을 더 담았다 — 패널이 위젯 안을 뒤지지 않고 **빌린 것만** 쓰게.
 */
import { measureStorage, humanBytes } from '../storage-health';
import type { PanelCtx } from './context';

export function renderStoragePanel(ctx: PanelCtx): void {
  const { side, esc } = ctx;
  side.classList.remove('hidden');
  ctx.canvas()?.setSelectedNode(null);

  const rep = measureStorage();
  side.innerHTML = `
    <h4>💾 저장 상태</h4>
    <div class="km-hint">그림은 이 브라우저 안에만 있습니다. 칸이 차면 저장이 실패합니다.</div>
    <div class="km-field">
      <label>${humanBytes(rep.used)} / 약 ${humanBytes(rep.budget)} (${Math.round(rep.ratio * 100)}%)</label>
      <div class="km-meter"><div class="km-meter-fill" style="width:${Math.min(100, Math.round(rep.ratio * 100))}%;
        background:${rep.warn ? '#f87171' : '#34d399'}"></div></div>
      ${rep.warn
        ? '<div class="km-hint" style="color:#fca5a5">칸이 거의 찼습니다. 안 쓰는 맵을 지우거나 <b>JSON 내보내기</b>로 옮겨 두세요. 사진 붙인 노드가 특히 큽니다.</div>'
        : ''}
    </div>
    <div class="km-field">
      <label>무거운 순</label>
      ${rep.items.slice(0, 8).map((it) => `<div class="km-link-row">
        <span class="km-link-name">${esc(ctx.mapNameOfKey(it.key))}</span>
        <span class="km-group-count">${humanBytes(it.bytes)}</span>
      </div>`).join('')}
    </div>
    <button class="btn btn-ghost" data-km="st-prev">방금 것 되살리기 (직전 판)</button>
    <div class="km-hint">새로고침 뒤에도 <b>바로 앞 판 하나</b>는 남겨 둡니다. 실수로 지웠을 때 쓰세요.</div>
    <button class="btn btn-primary" data-km="st-backup">모든 맵 한 파일로 내보내기</button>
    <button class="btn btn-ghost" data-km="st-restore">백업 파일 되돌리기</button>
    <div class="km-hint">되돌리면 지금 맵들을 <b>지우지 않고 옆에 더합니다</b>. 이름이 겹치면 「(복원)」이 붙습니다.</div>
    <button class="btn btn-ghost" data-km="st-close">닫기</button>`;

  (side.querySelector('[data-km="st-close"]') as HTMLButtonElement).onclick = ctx.goNode;
  (side.querySelector('[data-km="st-restore"]') as HTMLButtonElement).onclick = ctx.openRestore;
  (side.querySelector('[data-km="st-backup"]') as HTMLButtonElement).onclick = ctx.backupAllMaps;
  (side.querySelector('[data-km="st-prev"]') as HTMLButtonElement).onclick = ctx.restorePrevRevision;
}
