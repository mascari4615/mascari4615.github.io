/**
 * panels/notes-panel.ts — 공용 글 목록 (TASK-KL-202 노트 1급 객체 3회차).
 *
 * 글을 승격시킬 수만 있고 **어디에도 목록이 없으면** 금세 「누가 뭘 쓰는지 모르는 글 더미」가 된다.
 * 여기서 보이는 것 셋: ① 제목(목록에서 고를 때 쓰는 유일한 단서) ② 몇 곳이 쓰는지 ③ 첫 줄 미리보기.
 *
 * 「가기」는 **그 글을 쓰는 첫 자리**로 데려간다 — 글만 봐서는 어느 인물 이야기인지 알 수 없다.
 * 안 쓰는 글은 자동으로 안 지운다(방금 떼어 낸 것일 수 있다). 사람이 버튼을 눌러야 치운다.
 */
import { notesOf, noteUsers, pruneNotes } from '../../../lib/graph/notes';
import type { PanelCtx } from './context';

export function renderNotesPanel(ctx: PanelCtx): void {
  const { side, esc } = ctx;
  side.classList.remove('hidden');
  ctx.canvas()?.setSelectedNode(null);

  const spec = ctx.spec();
  const notes = notesOf(spec);
  const orphans = notes.filter((n) => noteUsers(spec, n.id) === 0).length;

  side.innerHTML = `
    <h4>🔗 공용 글</h4>
    <div class="km-hint">여러 자리가 <b>나눠 쓰는 글</b>입니다. 하나를 고치면 쓰는 곳이 전부 바뀝니다.</div>
    ${notes.length === 0
      ? `<div class="km-field"><div class="km-hint">아직 없습니다. 인물이나 관계의 <b>설명</b> 칸에서
          「여러 곳에서 같이 쓰기」를 누르면 여기로 올라옵니다 — 세계관 설정처럼 <b>같은 글이 여러 인물에게
          붙는 것</b>이 이 자리의 쓸모입니다.</div></div>`
      : notes.map((n) => {
          const users = noteUsers(spec, n.id);
          const head = (n.text.split('\n')[0] ?? '').slice(0, 60);
          return `<div class="km-field">
            <input type="text" data-km="note-title" data-key="${esc(n.id)}" value="${esc(n.title ?? '')}" placeholder="제목 (목록에서 고를 때 쓰입니다)" />
            <div class="km-link-row">
              <span class="km-link-name">${esc(head || '(빈 글)')}</span>
              <span class="km-group-count">${users}곳</span>
              <button class="btn btn-ghost" data-km="note-go" data-key="${esc(n.id)}"${users === 0 ? ' disabled' : ''}>가기</button>
            </div>
          </div>`;
        }).join('')}
    ${orphans === 0 ? '' : `<button class="btn btn-danger" data-km="note-prune">아무도 안 쓰는 글 ${orphans}개 치우기</button>`}
    <button class="btn btn-ghost" data-km="note-close">닫기</button>`;

  side.querySelectorAll('[data-km="note-title"]').forEach((el) => {
    const input = el as HTMLInputElement;
    input.onchange = () => {
      const note = notesOf(ctx.spec()).find((n) => n.id === input.dataset.key);
      if (!note) return;
      note.title = input.value.trim() || undefined;
      ctx.persist();
    };
  });
  side.querySelectorAll('[data-km="note-go"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      const id = (el as HTMLElement).dataset.key ?? '';
      const owner = ctx.spec().nodes.find((n) => n.docRef === id);
      if (owner) ctx.focusNode(owner.id);
    };
  });
  const prune = side.querySelector('[data-km="note-prune"]') as HTMLButtonElement | null;
  if (prune) {
    prune.onclick = () => {
      pruneNotes(ctx.spec());
      ctx.persist();
      ctx.refresh();
    };
  }
  (side.querySelector('[data-km="note-close"]') as HTMLButtonElement).onclick = ctx.goNode;
}
