import type { SearchDocument, SearchProvider } from '../search-system';
export type DocsSearchItem = { id: string; docId: string; heading: string; title: string; description: string };
type DocsCatalog = { documents?: Array<DocsSearchItem & { aliases?: string }> };
export function docsDocuments(catalog: DocsCatalog): SearchDocument<DocsSearchItem>[] {
  return (catalog.documents || []).map((item) => ({ value: item, id: item.id, title: item.title,
    description: item.description, aliases: item.aliases || '' }));
}
export function createDocsProvider(catalog: DocsCatalog): SearchProvider<DocsSearchItem> {
  const documents = docsDocuments(catalog);
  return { id: 'docs', documents: () => documents };
}
