/**
 * lib/markdown. **한 벌짜리 마크다운 렌더러** (TASK-KL-354).
 *
 * 왜 있나: 마크다운 그리는 자리가 셋으로 갈라져 있었다. 커뮤니티(자작 escape 파서, 표, 이미지
 * 없음), 문서 위젯(marked 직접), 블로그 글(새로 필요). 갈라진 렌더러는 같은 글을 다르게
 * 그리고, 고치면 한쪽만 고쳐진다. 여기 하나로 모은다: 블로그 글, 문서, 커뮤니티, 정적 생성기
 * (`scripts/gen-post-pages.mjs`) 전부 이 파일을 지난다.
 *
 * ## 신뢰 스위치. 새니타이저가 아니라 **만들 때부터 안전**
 *
 * `trust: 'user'`(남이 쓴 글)는 HTML 을 걸러내는 후처리가 아니라 **제한 렌더러**로 그린다:
 *  - 원문 HTML 토큰 → 전부 escape 해서 글자로 보여 준다 (태그로 살지 않는다)
 *  - 링크, 이미지 주소 → `safeHref` 통과 못 하면 글자로 남긴다 (`javascript:`, `data:` 차단)
 *  - 바깥 링크 → `target="_blank" rel="noopener noreferrer"`
 * 나머지 출력은 marked 가 스스로 escape 한다. 즉 위험한 것이 **아예 만들어지지 않는다** . 
 * DOM 파서 없는 Node 에서도 같은 코드가 돌고, 같은 시험이 지킨다 (`npm run test:markdown`).
 *
 * `trust: 'self'`(내 글. 블로그, 문서)는 전 기능: 원문 HTML, 모든 주소 허용.
 *
 * ## 우리 확장 (이관하며 정한 우리 문법. TASK-KL-351)
 *  - 유튜브 주소 한 줄 → 눌러야 재생되는 카드 (iframe 은 누르기 전엔 안 싣는다. KL-349 크롤 예산)
 *  - ```mermaid → `<div class="mermaid">` (그리는 건 KarmoGraph. `from-mermaid`, KL-326)
 *  - `> [!NOTE|TIP|WARNING|CAUTION|IMPORTANT]` → callout 인용
 *
 * marked 는 **부르는 쪽이 넘긴다**. 브라우저는 `ensureScript('vendor/marked.min')` 뒤 전역을,
 * Node 는 vendor 파일을 평가해서. 이 파일은 환경을 모른다(그래서 어디서나 돈다).
 */

/** marked v14 에서 쓰는 만큼만 적은 모양. vendor 전역이라 공식 타입이 없다. */
export interface MarkedNamespace {
    Marked: new () => MarkedInstance;
}
export interface MarkedInstance {
    parse(markdown: string): string;
    use(options: unknown): void;
}

export interface RenderOptions {
    /** self = 내 글 (블로그, 문서, 전 기능), user = 남의 글 (커뮤니티, 제한 렌더러) */
    trust: 'self' | 'user';
    marked: MarkedNamespace;
    /** 줄바꿈 한 번 = <br> 로 볼 것인가. 커뮤니티 글(채팅투) = true, 블로그 글 = false. */
    breaks?: boolean;
}

export const CALLOUT_KINDS = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'] as const;

/** 커뮤니티 파서에서 승계한 주소 규율. http(s) 와 사이트 안쪽 절대경로만. */
export function safeHref(raw: string): string | null {
    const url = raw.trim();
    if (/^https?:\/\//i.test(url)) return url;
    if (/^\/[^/]/.test(url)) return url;
    if (/^#/.test(url)) return url; // 같은 글 안 이동
    return null;
}

export function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** 유튜브 카드. 누르기 전엔 썸네일 한 장 (제3자 iframe 0). 누르면 `activateYoutubeCards` 가 바꾼다. */
function youtubeCard(id: string): string {
    const safe = escapeHtml(id);
    return (
        `<a class="md-yt" href="https://youtu.be/${safe}" data-yt="${safe}" target="_blank" rel="noopener noreferrer">` +
        `<img src="https://i.ytimg.com/vi/${safe}/hqdefault.jpg" alt="YouTube 영상" loading="lazy">` +
        `<span class="md-yt-play" aria-hidden="true">▶</span></a>`
    );
}

/** 문단이 유튜브 주소 하나뿐인 줄. 우리 문법의 embed. */
const YOUTUBE_LINE =
    /^https:\/\/(?:youtu\.be\/|www\.youtube\.com\/watch\?v=)([A-Za-z0-9_-]{6,})\S*[ \t]*(?:\n+|$)/;

interface YoutubeToken {
    type: 'youtube';
    raw: string;
    id: string;
}
interface MermaidToken {
    type: 'mermaid';
    raw: string;
    text: string;
}

/** marked 인스턴스를 신뢰 수준에 맞게 짓는다. 전역 `marked` 는 건드리지 않는다 (docs 사고 예방). */
function buildInstance(options: RenderOptions): MarkedInstance {
    const instance = new options.marked.Marked();
    const trusted = options.trust === 'self';

    instance.use({
        gfm: true,
        breaks: options.breaks ?? !trusted,
        extensions: [
            {
                name: 'youtube',
                level: 'block',
                start: (src: string) => {
                    const at = src.search(/https:\/\/(?:youtu\.be\/|www\.youtube\.com\/watch)/);
                    return at < 0 ? undefined : at;
                },
                tokenizer: (src: string): YoutubeToken | undefined => {
                    const m = YOUTUBE_LINE.exec(src);
                    return m ? { type: 'youtube', raw: m[0], id: m[1] } : undefined;
                },
                renderer: (token: unknown) => youtubeCard((token as YoutubeToken).id),
            },
            {
                // ```mermaid 원문을 escape 된 div 로. 그리는 것은 KarmoGraph 몫 (docs.ts 에서 승계).
                name: 'mermaid',
                level: 'block',
                start: (src: string) => {
                    const at = /^```mermaid[ \t]*(?:\r?\n|$)/m.exec(src);
                    return at ? at.index : undefined;
                },
                tokenizer: (src: string): MermaidToken | undefined => {
                    const m = /^```mermaid[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*(?:\n+|$)/.exec(src);
                    return m ? { type: 'mermaid', raw: m[0], text: m[1] } : undefined;
                },
                renderer: (token: unknown) =>
                    `<div class="mermaid">${escapeHtml((token as MermaidToken).text)}</div>\n`,
            },
        ],
        renderer: trusted
            ? {}
            : {
                  // 남의 글의 원문 HTML. 태그가 아니라 글자다. 이 한 줄이 이 모듈의 방어선이다.
                  html: (token: { raw?: string; text?: string }) =>
                      escapeHtml(token.raw ?? token.text ?? ''),
                  link(this: { parser: { parseInline(tokens: unknown[]): string } }, token: {
                      href: string;
                      tokens: unknown[];
                  }) {
                      const body = this.parser.parseInline(token.tokens);
                      const url = safeHref(token.href);
                      if (!url) return body; // 주소가 수상하면 링크를 안 만든다. 글자만 남는다
                      const external = /^https?:/i.test(url);
                      return `<a href="${escapeHtml(url)}"${
                          external ? ' target="_blank" rel="noopener noreferrer"' : ''
                      }>${body}</a>`;
                  },
                  image: (token: { href: string; text: string }) => {
                      const url = safeHref(token.href);
                      if (!url || /^data:/i.test(url)) return escapeHtml(token.text);
                      return `<img src="${escapeHtml(url)}" alt="${escapeHtml(token.text)}" loading="lazy">`;
                  },
              },
    });
    return instance;
}

/**
 * callout. 렌더 결과에서 `<blockquote><p>[!NOTE]...` 를 클래스 있는 인용으로.
 * 토큰 단계가 아니라 결과 문자열에서 바꾸는 이유: `[!NOTE]` 는 escape 를 지나도 그대로라
 * 신뢰 수준과 무관하게 같은 자리에서 같은 모양으로 잡힌다 (경로가 하나 = 시험도 하나).
 */
const CALLOUT_LABEL: Record<string, string> = {
    NOTE: '📝 노트',
    TIP: '💡 팁',
    IMPORTANT: '📌 중요',
    WARNING: '⚠️ 주의',
    CAUTION: '🚨 경고',
};
function applyCallouts(html: string): string {
    return html.replace(
        /<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(?:<br\s*\/?>\s*)?/g,
        (_whole, kind: string) =>
            `<blockquote class="md-callout md-callout-${kind.toLowerCase()}">` +
            `<p class="md-callout-tag">${CALLOUT_LABEL[kind]}</p><p>`
    );
}

/** 마크다운 → HTML. 이 함수가 이 앱의 유일한 마크다운 문 (위젯, 생성기 공용). */
export function renderMarkdown(source: string, options: RenderOptions): string {
    const html = buildInstance(options).parse(String(source ?? ''));
    return applyCallouts(html).replace(/<p>\s*<\/p>/g, '');
}

/**
 * 유튜브 카드를 누르면 그 자리에서 재생. iframe 은 이때 처음 실린다.
 * 위젯(커뮤니티, 문서, 블로그 탭)과 정적 글 장의 작은 스크립트가 같이 쓴다.
 */
export function activateYoutubeCards(root: ParentNode): void {
    root.querySelectorAll<HTMLAnchorElement>('a.md-yt[data-yt]').forEach((card) => {
        card.addEventListener('click', (event) => {
            event.preventDefault();
            const id = card.getAttribute('data-yt') ?? '';
            if (!/^[A-Za-z0-9_-]{6,}$/.test(id)) return;
            const frame = document.createElement('iframe');
            frame.className = 'md-yt-frame';
            frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`;
            frame.allow = 'autoplay; encrypted-media; picture-in-picture';
            frame.allowFullscreen = true;
            frame.title = 'YouTube 영상';
            card.replaceWith(frame);
        });
    });
}
