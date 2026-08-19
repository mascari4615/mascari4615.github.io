/**
 * panels/read-panel.ts — **받은 사람이 읽는 화면** (TASK-KL-271 O3).
 *
 * 보기 전용 링크를 열면 지금까지는 **편집 화면이 회색으로 잠긴 채** 나왔다. 이름 칸·종류 고르개·
 * 칸 입력칸이 그대로 있고 전부 안 눌리는 화면 — 「고장 난 폼」으로 읽힌다. 게다가 정작 읽을 것
 * (그 인물의 **설명**)은 「더 보기」 뒤에 접혀 있어서, 받은 사람이 가장 하고 싶은 일이 가장 멀었다.
 *
 * Kumu 가 스토리텔링 맵으로 파는 자리가 정확히 이것이다: **누르면 그 사람 이야기가 뜬다.**
 * 그래서 보기 전용에서는 고칠 칸을 아예 안 그리고, 읽을 것만 글로 낸다.
 * (코멘트는 그대로 둔다 — 받은 사람이 「여기 이상해요」를 남길 유일한 칸이다.)
 */
import type { GraphNode } from '../../../lib/karmograph/spec';
import type { PanelCtx } from './context';
import { t } from '../../../lib/i18n';

/**
 * 읽기 카드.
 *
 * @param doc 이 카드의 긴 글 (제자리 글이든 공용 글이든 이미 풀어 놓은 것)
 * @param links 이 카드가 이어진 곳들 — 「관계 이름 → 상대 이름」
 */
export function readCardHtml(
  ctx: PanelCtx,
  node: GraphNode,
  doc: string,
  links: { label: string; other: string }[],
): string {
  const esc = ctx.esc;
  // 값이 빈 칸은 **안 그린다** — 읽는 사람에게 「안 적힌 칸」은 아무 말도 아니다(적는 사람에게만 뜻이 있다).
  const fields = Object.entries(node.fields ?? {}).filter(([, v]) => String(v ?? '').trim());
  const tags = (node.tags ?? []).filter(Boolean);
  return `
    <h4>${ctx.kindIcon(node.kind)} ${esc(node.label || t('karmograph.unnamed'))}</h4>
    ${!node.note ? '' : `<div class="km-read-note">${esc(node.note)}</div>`}
    ${tags.length === 0 ? '' : `<div class="km-read-tags">${tags.map((x) => `#${esc(x)}`).join(' ')}</div>`}
    ${fields.length === 0 ? '' : `<div class="km-read-fields">${fields.map(([k, v]) => `
      <div class="km-read-row"><span class="km-read-k">${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div>`}
    ${!doc.trim() ? '' : `<div class="km-read-doc">${esc(doc)}</div>`}
    ${links.length === 0 ? '' : `<div class="km-field">
      <label>${esc(t('karmograph.read.links'))}</label>
      ${links.map((l) => `<div class="km-read-row">
        <span class="km-read-k">${esc(l.label)}</span><span>${esc(l.other)}</span></div>`).join('')}
    </div>`}`;
}
