import type { SearchDocument, SearchProvider } from '../search-system';
import { fromBlogRow, originLabel, type KarmoPost } from '../../lib/post-model';

/** 블로그 색인 한 줄의 모양 (`data/posts-index.json`). */
export type BlogIndexRow = { slug: string; title: string; date: string; categories?: string[]; excerpt?: string };

/** 색인 줄을 글 모델로 옮기고 찾기 문서로 만든다 (change.post-model). */
export function postDocuments(rows: BlogIndexRow[]): SearchDocument<KarmoPost>[] {
    return (rows || []).map((row) => {
        const post = fromBlogRow(row);
        return {
            value: post,
            id: `post:${post.id}`,
            title: post.title,
            description: post.excerpt || post.label,
            aliases: [post.label, originLabel('blog')].filter(Boolean).join(' '),
        };
    });
}

export function createPostProvider(rows: BlogIndexRow[]): SearchProvider<KarmoPost> {
    const documents = postDocuments(rows);
    return { id: 'posts', documents: () => documents };
}
