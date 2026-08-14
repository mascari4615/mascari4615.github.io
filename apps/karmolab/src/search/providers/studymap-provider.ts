import type { SearchDocument, SearchProvider } from '../search-system';

type StudyMapData = { tracks?: Array<{ id: string; title: string; lead?: string; stages?: Array<{ id: string; title: string; nodes?: Array<{ id: string; title: string; why?: string; check?: string; links?: Array<{ label: string }>; tool?: { label?: string } }> }> }> };
export type StudyMapSearchItem = { id: string; title: string; description: string; trackTitle: string; nodeId: string };

export function studyMapDocuments(data: StudyMapData): SearchDocument<StudyMapSearchItem>[] {
  const documents: SearchDocument<StudyMapSearchItem>[] = [];
  for (const track of data.tracks || []) for (const stage of track.stages || []) for (const node of stage.nodes || []) {
    const value = { id: `study:${node.id}`, title: node.title, description: node.why || '', trackTitle: track.title, nodeId: node.id };
    documents.push({ value, id: node.id, title: node.title,
      description: [node.why, node.check].filter(Boolean).join(' '),
      aliases: [track.title, track.lead, stage.title, node.tool?.label, ...(node.links || []).map((link) => link.label)].filter(Boolean).join(' ') });
  }
  return documents;
}

export function createStudyMapProvider(data: StudyMapData): SearchProvider<StudyMapSearchItem> {
  const documents = studyMapDocuments(data);
  return { id: 'studymap', documents: () => documents };
}
