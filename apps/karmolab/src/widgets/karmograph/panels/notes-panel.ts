/**
 * panels/notes-panel.ts — 공용 글 목록 (TASK-KL-202 노트 1급 객체 3회차).
 *
 * 글을 승격시킬 수만 있고 **어디에도 목록이 없으면** 금세 「누가 뭘 쓰는지 모르는 글 더미」가 된다.
 * 여기서 보이는 것 셋: ① 제목(목록에서 고를 때 쓰는 유일한 단서) ② 몇 곳이 쓰는지 ③ 첫 줄 미리보기.
 *
 * 「가기」는 **그 글을 쓰는 첫 자리**로 데려간다 — 글만 봐서는 어느 인물 이야기인지 알 수 없다.
 * 안 쓰는 글은 자동으로 안 지운다(방금 떼어 낸 것일 수 있다). 사람이 버튼을 눌러야 치운다.
 */
import { notesOf, noteUsers, pruneNotes, deleteNote } from '../../../lib/graph/notes';
import type { PanelCtx } from './context';
import { t, loadNamespace } from '../../../lib/i18n';

export function renderNotesPanel(ctx: PanelCtx): void {
  const { side, esc } = ctx;
  side.classList.remove('hidden');
  ctx.canvas()?.setSelectedNode(null);

  const spec = ctx.spec();
  const notes = notesOf(spec);
  const orphans = notes.filter((n) => noteUsers(spec, n.id) === 0).length;
  // 이 맵에 아직 없는 창고 글 — 여기서 데려오면 쪽지로 놓거나 카드에 붙일 수 있다.
  const foreign = ctx.foreignNotes();

  side.innerHTML = `
    <h4>${esc(t('karmograph.t337'))}</h4>
    <div class="km-hint">${t('karmograph.hint07', { em: `<b>${esc(t('karmograph.t339'))}</b>` })}
      ${t('karmograph.scatterHint', {
        scatter: `<b>${esc(t('karmograph.t341'))}</b>`,
        copy: `<b>${esc(t('karmograph.t343'))}</b>`,
      })}</div>
    ${notes.length === 0
      ? `<div class="km-field"><div class="km-hint">${t('karmograph.notesEmpty', {
            desc: `<b>${esc(t('karmograph.t346'))}</b>`,
            many: `<b>${esc(t('karmograph.t348'))}</b>`,
          })}</div></div>`
      : notes.map((n) => {
          const users = noteUsers(spec, n.id);
          const head = (n.text.split('\n')[0] ?? '').slice(0, 60);
          return `<div class="km-field">
            <input type="text" data-km="note-title" data-key="${esc(n.id)}" value="${esc(n.title ?? '')}" placeholder="${esc(t('karmograph.t336'))}" />
            <div class="km-link-row">
              <span class="km-link-name">${esc(head || t('karmograph.emptyDoc'))}</span>
              <span class="km-group-count">${users}곳</span>
              <button class="btn btn-ghost" data-km="note-go" data-key="${esc(n.id)}"${users === 0 ? ' disabled' : ''}>${esc(t('karmograph.t350'))}</button>
              <button class="btn btn-ghost" data-km="note-show" data-key="${esc(n.id)}"${users < 2 ? ' disabled' : ''}>${esc(t('karmograph.t351'))}</button>
              <button class="btn btn-ghost" data-km="note-card" data-key="${esc(n.id)}">${esc(t('karmograph.t352'))}</button>
              <button class="btn btn-ghost" data-km="note-split" data-key="${esc(n.id)}">${esc(t('karmograph.t341'))}</button>
            </div>
          </div>`;
        }).join('')}
    ${foreign.length === 0 ? '' : `<div class="km-field">
      <label>${esc(t('karmograph.t353'))}</label>
      <div class="km-hint">${t('karmograph.notesForeign', {
        outlive: `<b>${esc(t('karmograph.t355'))}</b>`,
        same: `<b>${esc(t('karmograph.t357'))}</b>`,
      })}</div>
      ${foreign.slice(0, 12).map((n) => `<div class="km-link-row">
        <span class="km-link-name">${esc(n.title || (n.text.split(/\r?\n/)[0] ?? '').slice(0, 40) || t('karmograph.emptyDoc'))}</span>
        <span class="km-group-count">${esc(n.from ?? t('karmograph.t361'))}</span>
        <button class="btn btn-ghost" data-km="note-adopt" data-key="${esc(n.id)}">${esc(t('karmograph.t359'))}</button>
      </div>`).join('')}
    </div>`}
    ${orphans === 0 ? '' : `<button class="btn btn-danger" data-km="note-prune">${esc(t('karmograph.pruneOrphans', { n: orphans }))}</button>`}
    <button class="btn btn-ghost" data-km="note-close">${esc(t('karmograph.t360'))}</button>`;

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
  // 「가기」는 한 곳만 보여 준다. 같은 글을 **여럿이 나눠 쓴다**는 사실 자체가 이 기능의 값이라,
  // 쓰는 자리를 한 화면에 모아 또렷하게 만드는 손이 따로 있어야 한다.
  side.querySelectorAll('[data-km="note-show"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      const id = (el as HTMLElement).dataset.key ?? '';
      const ids = ctx.spec().nodes.filter((n) => n.docRef === id).map((n) => n.id);
      if (ids.length === 0) return;
      ctx.canvas()?.setFocus(new Set(ids));
      ctx.canvas()?.fitToNodes(ids, 160);
    };
  });
  // 「흩기」 = 공용을 그만두고 **쓰던 자리마다 사본으로 남긴다**. 빈칸으로 만들면 글이 증발한 것처럼
  // 보인다 — 이 도구에서 가장 무서운 사고다. 되돌리려면 아무 자리에서 다시 승격하면 된다.
  side.querySelectorAll('[data-km="note-split"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      const id = (el as HTMLElement).dataset.key ?? '';
      deleteNote(ctx.spec(), id, true);
      ctx.persist();
      ctx.refresh();
    };
  });
  // 「쪽지로 놓기」 = 글을 캔버스에 펼쳐 둔다. 사본이 아니라 **창**이라 쪽지에서 고치면 다 바뀐다.
  side.querySelectorAll('[data-km="note-card"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      const id = (el as HTMLElement).dataset.key ?? '';
      if (id) ctx.spawnNoteCard(id);
    };
  });
  side.querySelectorAll('[data-km="note-adopt"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      const id = (el as HTMLElement).dataset.key ?? '';
      if (!id) return;
      ctx.adoptNote(id);
      // 데려오기만 하면 아무도 안 쓰는 글이라 「치우기」 대상이 된다 — 바로 쪽지로 놓아 자리를 준다.
      ctx.spawnNoteCard(id);
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
