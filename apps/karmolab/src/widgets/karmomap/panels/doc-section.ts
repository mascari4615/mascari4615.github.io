/**
 * panels/doc-section.ts — 설명 (TASK-KL-202 개편 2 일곱째 조각 + 노트 1급 객체).
 *
 * 칸은 그대로 하나지만 **글의 집이 둘**이다: 이 노드 안(제자리) 또는 공용 글(`spec.notes`).
 * 참조 중이면 「타자 = 공용 글 수정」이라 다른 자리도 함께 바뀐다 — 그 사실을 칸 위에
 * 눈에 띄게 적어 둔다. 모르고 고치면 남의 카드가 바뀌는 것이 가장 나쁜 놀람이다.
 */
import { notesOf, resolveDoc, setDocText, shareDoc, useNote, unlinkNote, noteUsers } from '../../../lib/graph/notes';
import type { DocHolder } from '../../../lib/graph/notes';
import type { PanelCtx } from './context';

/**
 * 칸 하나의 겉모습만 다르다 — 노드는 「설명」, 선은 「이 관계의 이야기」.
 * 속(공용 글 승격·불러쓰기·떼기)은 **완전히 같다**: 글에게 노드인지 선인지는 상관없다.
 */
export interface DocFieldSkin {
  /** 칸 이름. */
  label: string;
  /** 빈 칸에 뜨는 안내. */
  placeholder: string;
  /** `data-km` 열쇠 앞머리 — 노드 패널과 선 패널의 칸이 한 화면에 같이 뜨진 않지만 열쇠는 갈라 둔다. */
  key: string;
  /** 칸 밑 설명 한 줄(HTML 허용). */
  hint?: string;
}

export const NODE_DOC_SKIN: DocFieldSkin = {
  label: '설명',
  placeholder: '이 인물·개념에 대해 길게 적어 두는 자리',
  key: 'edit-doc',
  hint: '적어 두면 카드 모서리에 📄 가 붙습니다. 그림에는 안 나옵니다. <b>[[이름]]</b> 으로 다른 노드를 가리킬 수 있어요.',
};

export const EDGE_DOC_SKIN: DocFieldSkin = {
  label: '이 관계의 이야기',
  placeholder: '언제부터, 왜 이런 사이가 됐는지',
  key: 'ed-doc',
};

export function docFieldHtml(ctx: PanelCtx, node: DocHolder, skin: DocFieldSkin = NODE_DOC_SKIN): string {
  const esc = ctx.esc;
  const spec = ctx.spec();
  const shared = node.docRef ? notesOf(spec).find((n) => n.id === node.docRef) : undefined;
  const others = notesOf(spec).filter((n) => n.id !== node.docRef);
  const users = shared ? noteUsers(spec, shared.id) : 0;

  return `
    <div class="km-field">
      <label>${esc(skin.label)}</label>
      ${shared
        ? `<div class="km-hint" style="color:#fcd34d">🔗 <b>${esc(shared.title || '메모')}</b> — ${users}곳이 함께 씁니다. 여기서 고치면 그 ${users}곳이 전부 바뀝니다.</div>`
        : ''}
      <textarea data-km="${skin.key}" class="km-textarea" rows="5" placeholder="${esc(skin.placeholder)}">${esc(resolveDoc(spec, node))}</textarea>
      ${skin.hint ? `<div class="km-hint">${skin.hint}</div>` : ''}
      ${shared
        ? `<button class="btn btn-ghost" data-km="${skin.key}-unlink">이 자리만 따로 쓰기 (사본으로 떼기)</button>`
        : `<button class="btn btn-ghost" data-km="${skin.key}-share">여러 곳에서 같이 쓰기 (공용 글로)</button>`}
      ${others.length === 0 ? '' : `<select data-km="${skin.key}-use">
        <option value="">— 있는 공용 글 불러 쓰기 —</option>
        ${others.map((n) => `<option value="${esc(n.id)}">${esc(n.title || '메모')} (${noteUsers(spec, n.id)}곳)</option>`).join('')}
      </select>`}
    </div>`;
}

/**
 * @param touch 구조가 바뀐 뒤 저장·다시 그리기. `true` 를 주면 패널도 다시 그린다
 *   — 타자 중에는 절대 `true` 를 주면 안 된다(커서가 날아간다).
 * @param redrawLinks 설명 안 `[[이름]]` 목록만 다시 그리는 손.
 */
export function bindDocField(
  ctx: PanelCtx,
  node: DocHolder,
  touch: (redrawSide: boolean) => void,
  redrawLinks: () => void = () => {},
  skin: DocFieldSkin = NODE_DOC_SKIN,
): void {
  const side = ctx.side;
  const spec = ctx.spec();
  const area = side.querySelector(`[data-km="${skin.key}"]`) as HTMLTextAreaElement;
  area.oninput = () => {
    setDocText(spec, node, area.value);
    touch(false);
    redrawLinks();
  };
  const shareBtn = side.querySelector(`[data-km="${skin.key}-share"]`) as HTMLButtonElement | null;
  if (shareBtn) {
    shareBtn.onclick = () => {
      if (!resolveDoc(spec, node).trim()) return; // 빈 글을 공용으로 올려 봐야 목록만 더럽다
      shareDoc(spec, node);
      touch(true);
    };
  }
  const unlinkBtn = side.querySelector(`[data-km="${skin.key}-unlink"]`) as HTMLButtonElement | null;
  if (unlinkBtn) {
    unlinkBtn.onclick = () => {
      unlinkNote(spec, node);
      touch(true);
    };
  }
  const useSel = side.querySelector(`[data-km="${skin.key}-use"]`) as HTMLSelectElement | null;
  if (useSel) {
    useSel.onchange = () => {
      if (!useSel.value) return;
      useNote(spec, node, useSel.value);
      touch(true);
    };
  }
}
