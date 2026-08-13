import { scoreSearchableTool, type SearchMatchKind, type SearchableTool } from './tool-search';
export { englishKeysToKorean, scoreSearchableTool } from './tool-search';

export type SearchDocument<T> = SearchableTool & { value: T };
export type SearchResult<T> = {
  value: T;
  score: number;
  reason: SearchMatchKind;
  titleNormStart: number | null;
};

export type SearchSystem<T> = {
  replace(documents: Iterable<SearchDocument<T>>): void;
  search(query: string, limit?: number): SearchResult<T>[];
  size(): number;
};

/**
 * UI나 저장 방식과 무관한 메모리 검색 시스템.
 * 문서 공급, 질의 해석, 점수화, 정렬의 경계를 한 API로 고정한다.
 */
export function createSearchSystem<T>(initial: Iterable<SearchDocument<T>> = []): SearchSystem<T> {
  let documents = Array.from(initial);
  return {
    replace(next) {
      documents = Array.from(next);
    },
    search(query, limit) {
      const results: SearchResult<T>[] = [];
      for (const document of documents) {
        const match = scoreSearchableTool(document, query);
        if (!match) continue;
        results.push({
          value: document.value,
          score: match.score,
          reason: match.kind,
          titleNormStart: match.titleNormStart,
        });
      }
      results.sort((a, b) => b.score - a.score || String((a.value as { title?: string }).title || '')
        .localeCompare(String((b.value as { title?: string }).title || ''), 'ko-KR'));
      return typeof limit === 'number' ? results.slice(0, Math.max(0, limit)) : results;
    },
    size() {
      return documents.length;
    },
  };
}
