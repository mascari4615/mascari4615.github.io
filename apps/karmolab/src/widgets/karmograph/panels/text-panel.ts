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
    <div class="km-hint">들여쓰면 위 줄에 이어집니다. 콜론(:) 뒤는 설명입니다.
      <b>카드 {shape=note group=Guide tags=ai|web} : 짧은 메모</b>처럼 쓰면 카드형 노드도 그립니다.
      <b>욘 -&gt; 마을 : 지킨다</b> 는 옆으로 난 관계입니다.</div>
    <textarea data-km="text-src" class="km-textarea" rows="13" placeholder="프로젝트 입구 {shape=rect group=Guide tags=ai|web}&#10;  시작 카드 {shape=note} : 무엇부터 볼지&#10;  파일 카드 {shape=bubble note=widgets-lazy-meta.ts} : 실제 파일&#10;시작 카드 -&gt; 파일 카드 : 따라가기"></textarea>
    <div class="km-field">
      <label>새로 만들 노드 종류</label>
      <select data-km="text-kind">${ctx.nodeKindOptionsHtml()}</select>
    </div>
    <button class="btn btn-primary" data-km="text-go">이 글로 만들기</button>
    <button class="btn btn-ghost" data-km="text-sample">카드 예시 넣기</button>
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

  (side.querySelector('[data-km="text-sample"]') as HTMLButtonElement).onclick = () => {
    const src = side.querySelector('[data-km="text-src"]') as HTMLTextAreaElement;
    src.value = [
      '프로젝트 입구 {shape=rect group=Guide tags=ai|web}',
      '  시작 카드 {shape=note} : 무엇부터 볼지',
      '  파일 카드 {shape=bubble note=widgets-lazy-meta.ts} : 실제 파일',
      '  관계 카드 {shape=rect} : 어디가 이어지는지',
      '시작 카드 -> 파일 카드 : 따라가기',
      '파일 카드 -> 관계 카드 : 연결 보기',
    ].join('\n');
    src.focus();
  };
}

