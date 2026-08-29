/**
 * 글 앞머리(front matter) — **글 한 편의 설정을 글 안에 적는 한 가지 문법**.
 *
 * 블로그 글(`content/posts/**.md`)은 처음부터 `---` 사이에 `image:` 를 적어 왔다. 커뮤니티 글은
 * 그런 자리가 없어 썸네일을 걸 수 없었는데, 서버(yawnbot)에 필드를 새로 파면 저장 위치가 갈려
 * **한 사이트에 문법이 둘**이 된다. 그래서 커뮤니티 글도 본문 맨 앞의 같은 `---` 덩어리를 설정으로
 * 읽는다 — 서버는 여전히 글자 한 덩이만 알면 되고(스키마 변경 0), 사람이 쓰는 문법은 하나다.
 *
 * 읽는 것은 `key: value` 한 줄짜리뿐이다. 목록·본문 어디서도 이 덩어리는 글자로 그려지지 않는다.
 */

export interface FrontMatterSplit {
    /** 앞머리에 적힌 것들 (키는 소문자). 없으면 빈 객체. */
    meta: Record<string, string>;
    /** 앞머리를 걷어낸 본문. 앞머리가 없으면 원문 그대로. */
    body: string;
}

/** 값의 겉따옴표만 벗긴다 (`"foo"` · `'foo'` → `foo`). */
function unquote(raw: string): string {
    const value = raw.trim();
    const quoted = /^(["'])([\s\S]*)\1$/.exec(value);
    return quoted ? quoted[2] : value;
}

/** 글 한 편을 앞머리와 본문으로. 문법이 안 맞으면 통째로 본문이다 (글이 사라지는 것보다 낫다). */
export function splitFrontMatter(source: string): FrontMatterSplit {
    const text = String(source ?? '');
    const match = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
    if (!match) return { meta: {}, body: text };

    const meta: Record<string, string> = {};
    for (const line of match[1].split(/\r?\n/)) {
        const pair = /^([A-Za-z][A-Za-z0-9_-]*)[ \t]*:[ \t]*(.*)$/.exec(line);
        if (pair) meta[pair[1].toLowerCase()] = unquote(pair[2]);
    }
    return { meta, body: text.slice(match[0].length) };
}

/**
 * 글의 표지 그림 주소. 없거나 수상하면 null.
 * 남의 글도 지나는 길이라 `http(s)` 와 사이트 안쪽 절대경로만 통과시킨다 (`render.ts` 의 `safeHref` 와 같은 규율).
 */
export function coverImage(meta: Record<string, string>): string | null {
    const raw = (meta.image ?? '').trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^\/[^/]/.test(raw)) return raw;
    return null;
}

/**
 * 글 머리에 붙일 속성 한 벌 — `<header class="c-post-head"${coverAttrs(url)}>`.
 * 그림이 없으면 빈 문자열이라 아무 규칙도 안 걸린다(= 옛 모양). 겉모습 규칙은 `css/community.css` 정본.
 * 주소는 따옴표·괄호를 막아 `style` 속성을 벗어나지 못하게 한다.
 */
export function coverAttrs(url: string | null): string {
    if (!url) return '';
    // `encodeURIComponent` 는 `'`·`(`·`)` 를 그냥 통과시킨다 — 그 셋이 바로 속성을 벗어나는 글자라
    // 손으로 적는다 (시험: 「주소가 style 속성을 못 벗어난다」).
    const ESCAPES: Record<string, string> = {
        '\\': '%5C', "'": '%27', '"': '%22', '(': '%28', ')': '%29', '<': '%3C', '>': '%3E',
    };
    const safe = url.replace(/[\\'"()<>\s]/g, (ch) => ESCAPES[ch] ?? encodeURIComponent(ch));
    return ` data-cover="1" style="background-image:url('${safe}')"`;
}
