/**
 * 모험 종료 시 정수 추출 — KL-032 θ 단계.
 *
 * provider 호출 → yaml + md fence 추출 → AdventureSummary.
 * yaml = chatbot 호환 frontmatter (entityId/slug/title/oneLine/tags/npcs/places/events).
 * md = 티메토 1인칭 GM 회고 (2-5 문단).
 */
import { createAdventureProvider } from './provider';
import type { AdventureProviderId } from './provider';
import type { AdventureSession } from './storage';

export interface AdventureSummary {
  slug: string;
  title: string;
  oneLine: string;
  tags: string[];
  npcs: string[];
  places: string[];
  events: string[];
  yaml: string;
  md: string;
}

const SUMMARY_SYSTEM_INSTRUCTION = `
당신은 KL-032 무한 텍스트 어드벤처의 *정수 추출자* 입니다.

조수님의 모험 history 를 읽고 KarmoWorld wiki entity 형식으로 정수를 추출하세요.

출력 형식 (정확히 두 fence — yaml 먼저, md 다음):

\`\`\`yaml
entityId: adv-{slug-kebab-case-3단어이내}
slug: {slug 동일}
title: {짧은 모험 제목 — 한국어, 5단어 이내}
oneLine: {한 줄 요약 — 한국어}
tags:
  - adventure
  - {분위기 / 장르 태그}
npcs:
  - {등장한 NPC slug — alisa / ling / timeto / yon / fourth 등}
places:
  - {등장한 장소 이름}
events:
  - {주요 사건 — 짧은 라벨}
startedAt: {ISO timestamp}
endedAt: {ISO timestamp — 지금}
\`\`\`

\`\`\`md
{모험의 서술. 2-5 문단. 티메토 1인칭 GM 회고 톤. 조수님과의 모험을 돌이켜보는 톤.}
\`\`\`

규칙:
- 두 fence 외 다른 텍스트 박지 마세요. 설명 X.
- npcs / places / events 는 모험에 *실제 등장한* 것만.
- 태그는 모험 분위기 (예: 코지 / 미스터리 / 액션 / 일상 / 연구).
`.trim();

function parseInlineList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter((s) => s.length > 0);
}

function parseBlockList(yaml: string, key: string): string[] {
  const re = new RegExp(`^${key}:\\s*$`, 'm');
  const m = re.exec(yaml);
  if (!m) return [];
  const after = yaml.slice(m.index + m[0].length);
  const lines = after.split('\n');
  // 첫 빈 줄 또는 새 top-level key 까지
  const items: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && line === '') continue;
    const trimmedItem = /^\s+-\s*(.+)$/.exec(line);
    if (trimmedItem) {
      items.push(trimmedItem[1].trim().replace(/^['"]|['"]$/g, ''));
      continue;
    }
    if (line.trim() === '') continue;
    if (!/^\s/.test(line)) break; // top-level key
  }
  return items;
}

function parseListField(yaml: string, key: string): string[] {
  const inline = new RegExp(`^${key}:\\s*\\[(.*)\\]\\s*$`, 'm').exec(yaml);
  if (inline) return parseInlineList(inline[1]);
  return parseBlockList(yaml, key);
}

function parseScalarField(yaml: string, key: string): string {
  const m = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(yaml);
  if (!m) return '';
  return m[1].trim().replace(/^['"]|['"]$/g, '');
}

function extractFences(text: string): { yaml: string; md: string } {
  const fenceRegex = /```([a-z]*)\n([\s\S]*?)\n```/g;
  const fences: Array<{ lang: string; body: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(text)) !== null) {
    fences.push({ lang: match[1].toLowerCase(), body: match[2] });
  }
  let yaml = '';
  let md = '';
  for (const f of fences) {
    if ((f.lang === 'yaml' || f.lang === 'yml') && !yaml) yaml = f.body.trim();
    else if ((f.lang === '' || f.lang === 'md' || f.lang === 'markdown') && !md) md = f.body.trim();
  }
  // fence 가 1개만 있으면 yaml 우선
  if (!yaml && !md && fences.length === 1) yaml = fences[0].body.trim();
  return { yaml, md };
}

export async function extractSummary(
  session: AdventureSession,
  providerId?: AdventureProviderId,
): Promise<AdventureSummary> {
  const provider = createAdventureProvider(providerId);

  const historyText = session.turns
    .map((t) => {
      const narrative = t.parsed?.narrative || t.assistantText;
      return `**조수님:** ${t.userText.trim()}\n**GM:** ${narrative.trim()}`;
    })
    .join('\n\n---\n\n');

  const userText = `## 모험 history\n\nslug: ${session.slug}\nstartedAt: ${session.startedAt}\ncast: ${session.castSlugs.join(', ') || '(없음)'}\n\n${historyText}\n\n위 모험의 정수를 추출하세요. yaml 의 endedAt 은 ${new Date().toISOString()} 으로 박으세요.`;

  const response = await provider.complete({
    systemInstruction: SUMMARY_SYSTEM_INSTRUCTION,
    history: [],
    userText,
  });

  const { yaml, md } = extractFences(response.text);
  if (!yaml) {
    throw new Error('정수 추출 응답에 yaml fence 없음:\n' + response.text.slice(0, 800));
  }

  const slug = parseScalarField(yaml, 'slug') || session.slug;
  const title = parseScalarField(yaml, 'title') || session.slug;
  const oneLine = parseScalarField(yaml, 'oneLine');
  const tags = parseListField(yaml, 'tags');
  const npcs = parseListField(yaml, 'npcs');
  const places = parseListField(yaml, 'places');
  const events = parseListField(yaml, 'events');

  return { slug, title, oneLine, tags, npcs, places, events, yaml, md };
}
