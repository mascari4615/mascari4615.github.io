/**
 * **소품 목록 읽기** — 따로 글을 안 쓴 참여작 (change.blog-surfaces-as-widgets ②).
 *
 * 정본 = `content/posts/works/*-works.md` 의 「기록」 절. 사람이 쭉 적어 온 목록이고,
 * 줄 모양이 이미 규칙적이다:
 *
 *     - 230318: 지하돌 티어게임, 팀 드래프트 (고세구) \| 프로그래밍
 *       - [왁물원 후기](https://cafe.naver.com/...)
 *
 * 예전에는 이 목록이 **글 한 장 안에만** 있었고, 작업물 장에는 「다른 프로젝트도 보고
 * 싶다면」이라는 카드 하나로 걸려 있었다 — 27건이 카드 한 장 뒤에 숨어 있었던 셈이다.
 * 여기서 자료로 읽어 작업물 장이 「그 외 참여」로 편다. 사람은 계속 그 글만 고치면 된다.
 */

/** `230318` · `2303` → `2023-03`. 못 읽으면 null (그 줄은 버리지 않고 때만 비운다). */
export function parseWhen(raw) {
    const digits = String(raw ?? '').trim();
    if (/^\d{6}$/.test(digits)) return `20${digits.slice(0, 2)}-${digits.slice(2, 4)}`;
    if (/^\d{4}$/.test(digits)) return `20${digits.slice(0, 2)}-${digits.slice(2, 4)}`;
    return null;
}

/**
 * 「기록」 절의 목록 → 항목 배열.
 * @param {string} markdown 글 본문(frontmatter 뗀 것)
 * @returns {Array<{when:string|null,title:string,client:string,role:string,links:{label:string,href:string}[]}>}
 */
export function parseMinorWorks(markdown) {
    const out = [];
    for (const line of markdown.split(/\r?\n/)) {
        const top = /^-\s+(\d{4,6}):\s*(.+)$/.exec(line);
        if (top) {
            let rest = top[2].trim();
            /* 역할은 파이프 뒤에 온다. 글에서는 `\|` 로 적혀 있다 — 표 문법과 섞이지 않게. */
            const [head, role = ''] = rest.split(/\s*\\?\|\s*/);
            let title = head.trim();
            let client = '';
            /* 맨 뒤 괄호 = 누구 것인가 (고세구 · 릴파 · 우왁굳 …). 제목 안 괄호는 안 건드린다. */
            const paren = /^(.*)\(([^()]*)\)\s*$/.exec(title);
            if (paren) {
                title = paren[1].trim();
                client = paren[2].trim();
            }
            /* 제목이 통째로 링크인 줄도 있다 — 표시 글자만 남기고 주소는 links 로 옮긴다. */
            const links = [];
            title = title.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_w, label, href) => {
                links.push({ label: label.trim(), href: href.trim() });
                return label.trim();
            });
            out.push({ when: parseWhen(top[1]), title, client, role: role.trim(), links });
            continue;
        }
        const sub = /^\s+-\s+\[([^\]]+)\]\(([^)]+)\)/.exec(line);
        if (sub && out.length) out[out.length - 1].links.push({ label: sub[1].trim(), href: sub[2].trim() });
    }
    return out;
}
