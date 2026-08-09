/**
 * panels/text-panel.ts — 글로 만들기 (TASK-KL-202 개편 2, 여덟 번째 이사).
 *
 * 파싱과 배치는 `from-text.ts` 가, 실제로 노드를 놓는 일은 위젯의 `buildFromOutline` 이 한다 —
 * 여기는 **글을 받아 넘기는 창**일 뿐이다(견본 넣기도 같은 길을 쓴다).
 */
import type { PanelCtx } from './context';

/**
 * 글로 만들기 — 들여쓴 목록을 그대로 관계도로 (격차 O).
 * 이미 그린 것은 건드리지 않고 **더한다**: 사람은 보통 「이만큼 더 있어」로 오지, 처음부터 다시 오지 않는다.
 */
export function renderTextPanel(ctx: PanelCtx): void {
  const { side } = ctx;
  side.classList.remove('hidden');
  ctx.canvas()?.setSelectedNode(null);
  side.innerHTML = `
    <h4>📝 글로 만들기</h4>
    <div class="km-hint">들여쓰면 위 줄에 이어집니다. 콜론(:) 뒤는 그 선에 붙는 말입니다.
      <b>욘 -&gt; 마을 : 지킨다</b> 처럼 적으면 <b>옆으로 난 관계</b>도 그려집니다(이미 그린 인물도 이름으로 잇습니다).</div>
    <textarea data-km="text-src" class="km-textarea" rows="12" placeholder="욘&#10;  링 : 부하&#10;  알리사 : 부하&#10;마을&#10;  대장간"></textarea>
    <div class="km-field">
      <label>새로 만들 노드 종류</label>
      <select data-km="text-kind">${ctx.nodeKindOptionsHtml()}</select>
    </div>
    <button class="btn btn-primary" data-km="text-go">이 글로 만들기</button>
    <button class="btn btn-ghost" data-km="text-close">닫기</button>`;

  (side.querySelector('[data-km="text-close"]') as HTMLButtonElement).onclick = () => {
    ctx.goNode();
  };

  (side.querySelector('[data-km="text-go"]') as HTMLButtonElement).onclick = () => {
    const src = (side.querySelector('[data-km="text-src"]') as HTMLTextAreaElement).value;
    const kind = (side.querySelector('[data-km="text-kind"]') as HTMLSelectElement).value || ctx.nodeKinds()[0].id;
    const made = ctx.buildFromOutline(src, kind);
    if (made === 0) {
      Toolbox.showToast?.('읽을 줄이 없습니다', undefined, undefined);
      return;
    }
    ctx.goNode();
    Toolbox.showToast?.(`${made}개를 만들었습니다`, undefined, undefined);
  };
}

