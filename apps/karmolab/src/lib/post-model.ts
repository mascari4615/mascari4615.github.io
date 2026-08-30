/**
 * 글 한 편의 공통 모양 (change.post-model).
 *
 * 저장은 셋. 블로그 글은 git `content/posts`, 문서는 git `data/docs` 와 `world/wiki`,
 * 커뮤니티 글은 yawnbot 서버
 * 저장 통합 불가. 사용자 글을 git 에 넣으면 글 하나에 배포 한 판, git 글을 서버에 넣으면 버전 소실
 *
 * 합칠 수 있는 것은 다루는 규칙. 목록 줄, 본문 뷰, 찾기 결과가 제각각이면 판마다 화면 갈라짐
 * 여기서 모양 하나, 갈래마다 어댑터 하나
 */

/** 글이 어느 갈래에서 왔나. 목록 꼬리표와 신뢰 등급이 여기서 갈린다. */
export type PostOrigin = 'blog' | 'docs' | 'community';

/** 서식을 어디까지 열어 주나. 정본은 `systems/content-rendering.md`. */
export type PostTrust = 'self' | 'user';

export interface KarmoPost {
    /** 갈래 안에서 고유한 값. 주소에 그대로 실린다 */
    id: string;
    origin: PostOrigin;
    title: string;
    /** 목록 한 줄에 붙는 짧은 소개. 없으면 빈 글자 */
    excerpt: string;
    /** 목록에서 제목 옆에 서는 꼬리표. 분류나 갈래 이름 */
    label: string;
    /** ISO 시각. 시각이 없는 갈래(문서)는 null */
    at: string | null;
    /** 글쓴이 손잡이. 주인 글은 null */
    author: string | null;
    trust: PostTrust;
    /** 이 글을 여는 주소. 앱 안이면 물음표 주소, 정적 장이면 절대경로 */
    href: string;
}

const ORIGIN_LABEL: Record<PostOrigin, string> = { blog: '글', docs: '문서', community: '커뮤니티' };

/** 갈래 이름 한 마디. 찾기 결과 줄과 목록 꼬리표가 같은 말을 쓰게 한다. */
export function originLabel(origin: PostOrigin): string {
    return ORIGIN_LABEL[origin];
}

/** 블로그 색인 한 줄(`data/posts-index.json`)을 글 모양으로. 읽기는 정적 장이다. */
export function fromBlogRow(row: {
    slug: string;
    title: string;
    date: string;
    categories?: string[];
    excerpt?: string;
}): KarmoPost {
    return {
        id: row.slug,
        origin: 'blog',
        title: row.title,
        excerpt: row.excerpt ?? '',
        label: (row.categories ?? []).join(' > '),
        at: row.date || null,
        author: null,
        trust: 'self',
        href: `/posts/${encodeURIComponent(row.slug)}/`,
    };
}

/** 문서 한 편을 글 모양으로. 정적 장이 없어 앱 안 주소를 든다. */
export function fromDocEntry(entry: { id: string; label: string; desc: string; group: string }): KarmoPost {
    return {
        id: entry.id,
        origin: 'docs',
        title: entry.label,
        excerpt: entry.desc,
        label: entry.group,
        at: null,
        author: null,
        trust: 'self',
        href: `?board=docs&d=${encodeURIComponent(entry.id)}#community`,
    };
}

/** 서버 글 한 편을 글 모양으로. 사람이 쓴 글이라 신뢰는 user 다. */
export function fromCommunityPost(post: {
    id: string;
    board: string;
    title: string | null;
    text: string;
    authorHandle: string;
    createdAt: string;
    bumpedAt?: string;
}, boardLabel?: string): KarmoPost {
    return {
        id: post.id,
        origin: 'community',
        title: post.title ?? post.text.slice(0, 40),
        excerpt: post.title ? post.text.slice(0, 90) : '',
        label: boardLabel ?? post.board,
        at: post.bumpedAt || post.createdAt,
        author: post.authorHandle || null,
        trust: 'user',
        href: `?p=${encodeURIComponent(post.id)}#community`,
    };
}

/** 목록에 찍을 날짜. 시각이 없는 갈래는 빈 글자 */
export function postDate(post: KarmoPost): string {
    return post.at ? post.at.slice(0, 10) : '';
}
