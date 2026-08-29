import { warmSearchable, scoreSearchableTool, type SearchMatchKind, type SearchableTool } from './tool-search';
export { englishKeysToKorean, scoreSearchableTool } from './tool-search';

export type SearchDocument<T> = SearchableTool & { value: T };
export type SearchProvider<T> = { id: string; documents(): Iterable<SearchDocument<T>> };
export type SearchResult<T> = {
  value: T;
  providerId: string;
  score: number;
  reason: SearchMatchKind;
  titleNormStart: number | null;
};

export type SearchSystem<T> = {
  register(provider: SearchProvider<T>): () => void;
  unregister(providerId: string): boolean;
  refresh(providerId?: string): void;
  replace(documents: Iterable<SearchDocument<T>>): void;
  search(query: string, limit?: number): SearchResult<T>[];
  /** 한가할 때 미리 다듬어 둔다. 첫 글자만 굼뜬 것을 없앤다. */
  warm(): void;
  size(): number;
  providerIds(): string[];
};

/**
 * UI나 저장 방식과 무관한 메모리 검색 시스템.
 * 문서 공급, 질의 해석, 점수화, 정렬의 경계를 한 API로 고정한다.
 */
export function createSearchSystem<T>(initial: Iterable<SearchDocument<T>> = []): SearchSystem<T> {
  const DEFAULT_PROVIDER = 'default';
  const providers = new Map<string, SearchProvider<T>>();
  const snapshots = new Map<string, SearchDocument<T>[]>();
  let defaultDocuments = Array.from(initial);
  providers.set(DEFAULT_PROVIDER, { id: DEFAULT_PROVIDER, documents: () => defaultDocuments });
  const api: SearchSystem<T> = {
    register(provider) {
      if (!provider.id || provider.id === DEFAULT_PROVIDER) throw new Error('검색 공급자 id가 비었거나 예약된 이름입니다.');
      if (providers.has(provider.id)) throw new Error(`검색 공급자 id가 겹칩니다: ${provider.id}`);
      providers.set(provider.id, provider);
      api.refresh(provider.id);
      return () => { api.unregister(provider.id); };
    },
    unregister(providerId) {
      if (providerId === DEFAULT_PROVIDER) return false;
      snapshots.delete(providerId);
      return providers.delete(providerId);
    },
    refresh(providerId) {
      const targets = providerId ? [[providerId, providers.get(providerId)] as const] : Array.from(providers.entries());
      for (const [id, provider] of targets) {
        if (!provider) throw new Error(`등록되지 않은 검색 공급자입니다: ${id}`);
        snapshots.set(id, Array.from(provider.documents()));
      }
    },
    replace(next) {
      defaultDocuments = Array.from(next);
      api.refresh(DEFAULT_PROVIDER);
    },
    search(query, limit) {
      const results: SearchResult<T>[] = [];
      for (const [providerId, documents] of snapshots) {
        for (const document of documents) {
          const match = scoreSearchableTool(document, query);
          if (!match) continue;
          results.push({ value: document.value, providerId, score: match.score, reason: match.kind,
            titleNormStart: match.titleNormStart });
        }
      }
      results.sort((a, b) => b.score - a.score || String((a.value as { title?: string }).title || '')
        .localeCompare(String((b.value as { title?: string }).title || ''), 'ko-KR'));
      return typeof limit === 'number' ? results.slice(0, Math.max(0, limit)) : results;
    },
    /** 한가할 때 미리 다듬어 둔다. 첫 글자의 굼뜸을 없앤다. */
    warm() {
      for (const documents of snapshots.values()) for (const document of documents) warmSearchable(document);
    },
    size() {
      let total = 0;
      for (const documents of snapshots.values()) total += documents.length;
      return total;
    },
    providerIds() {
      return Array.from(providers.keys()).filter((id) => id !== DEFAULT_PROVIDER);
    },
  };
  api.refresh();
  return api;
}
