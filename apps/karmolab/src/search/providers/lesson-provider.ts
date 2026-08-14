import type { SearchDocument, SearchProvider } from '../search-system';

export type LessonSearchItem = { id: string; nodeId: string; partId: string; title: string; nodeTitle: string; description: string };
type LessonCatalog = { documents?: Array<LessonSearchItem & { aliases?: string }> };

export function lessonDocuments(catalog: LessonCatalog): SearchDocument<LessonSearchItem>[] {
  return (catalog.documents || []).map((item) => ({
    value: item,
    id: item.id,
    title: item.title,
    description: item.description,
    aliases: [item.nodeTitle, item.aliases].filter(Boolean).join(' '),
  }));
}

export function createLessonProvider(catalog: LessonCatalog): SearchProvider<LessonSearchItem> {
  const documents = lessonDocuments(catalog);
  return { id: 'lessons', documents: () => documents };
}
