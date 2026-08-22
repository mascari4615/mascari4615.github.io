/**
 * 커뮤니티 글의 서식 — 공용 렌더러의 **user 신뢰 어댑터** (TASK-KL-098 → KL-354).
 *
 * 원래 여기 자작 escape 파서가 있었다 (표·이미지 없음). 렌더러가 세 벌로 갈라지는 것을 막으려
 * `lib/markdown/render` 한 벌로 모았다 — 커뮤니티는 그 덕에 표·이미지·callout 도 그려진다.
 * 안전은 그대로다: user 신뢰는 원문 HTML 을 전부 글자로 escape 하고 `javascript:`·`data:`
 * 주소를 만들지 않는다 (지키는 시험 = `npm run test:markdown`).
 *
 * marked(vendor)는 커뮤니티 위젯의 lazyScriptPaths 가 먼저 싣는다. 혹시 못 실렸으면
 * escape 한 글자만 보여 준다 — 서식이 없는 것이 스크립트가 사는 것보다 낫다.
 */
import { renderMarkdown as renderShared, escapeHtml as escapeShared } from '../lib/markdown/render';

export const escapeHtml = escapeShared;

/** 글 한 편을 화면에 넣을 수 있는 HTML 로. */
export function renderMarkdown(source: string): string {
    if (typeof marked === 'undefined' || typeof marked.Marked !== 'function') {
        // marked 가 안 실린 화면 — 서식 없이, 그러나 안전하게.
        return `<p>${escapeHtml(source).replace(/\n/g, '<br>')}</p>`;
    }
    const html = renderShared(source, { trust: 'user', marked, breaks: true });
    // 화면의 큰제목과 안 부딪히게 글 안 제목은 h3~h5 로 내린다 (자작 파서 시절 규칙 유지).
    return html
        .replace(/<(\/?)h3>/g, '<$1h5>')
        .replace(/<(\/?)h2>/g, '<$1h4>')
        .replace(/<(\/?)h1>/g, '<$1h3>');
}

/** 목록에 쓸 한 줄 미리보기 — 서식 기호는 걷어내고 글만 남긴다. */
export function plainPreview(source: string, max = 90): string {
    const text = String(source ?? '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[*_~>#-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
}
