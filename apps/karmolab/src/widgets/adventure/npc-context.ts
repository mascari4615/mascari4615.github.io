/**
 * NPC chatbot context 흡수 — KL-032 결정 3 (chatbot character 전체 컨텍스트).
 *
 * KarmoWorld.bindings.chatbot.characters 에서 slug → 컨텍스트 string 합성.
 * yaml 의 chatbot_personality / scenario / firstMes / visualDescription / userNote 모두 박음.
 *
 * 사용처: prompt.ts 가 NPC 만남 시 system instruction 에 합성.
 */

interface ChatbotCharacter {
  entityId: string;
  chatbotId: string;
  name: string;
  userName: string;
  userNote: string;
  visualDescription: string;
  description: string;
  personality: string;
  scenario: string;
  firstMes: string;
}

interface KarmoWorldChatbotBinding {
  characters?: ChatbotCharacter[];
}

interface KarmoWorldNamespace {
  bindings?: { chatbot?: KarmoWorldChatbotBinding };
}

function getCharacters(): ChatbotCharacter[] {
  const KW = (globalThis as unknown as { KarmoWorld?: KarmoWorldNamespace }).KarmoWorld;
  return KW?.bindings?.chatbot?.characters ?? [];
}

export function findCharacterBySlug(slug: string): ChatbotCharacter | null {
  if (!slug) return null;
  const lower = slug.toLowerCase();
  for (const c of getCharacters()) {
    if (c.entityId === slug) return c;
    if (c.chatbotId === slug) return c;
    if (c.entityId.toLowerCase() === lower) return c;
    if (c.chatbotId.toLowerCase() === lower) return c;
  }
  return null;
}

export function listAllCharacterSlugs(): { slug: string; name: string }[] {
  return getCharacters().map((c) => ({ slug: c.entityId || c.chatbotId, name: c.name }));
}

/** NPC 한 명의 풀 컨텍스트 string — system instruction 에 직접 박음 */
export function buildCharacterContext(char: ChatbotCharacter): string {
  const lines: string[] = [];
  lines.push(`# ${char.name} (slug: ${char.entityId || char.chatbotId})`);
  if (char.description) lines.push(`설명: ${char.description}`);
  if (char.visualDescription) lines.push(`외양: ${char.visualDescription}`);
  if (char.personality) lines.push(`성격:\n${char.personality}`);
  if (char.scenario) lines.push(`상황:\n${char.scenario}`);
  if (char.firstMes) lines.push(`첫 대사 톤 (참고):\n${char.firstMes}`);
  if (char.userNote) lines.push(`사용자 (조수님 / "${char.userName}") 메모: ${char.userNote}`);
  return lines.join('\n\n');
}

/** 여러 slug 묶음 — 모험 시작 시 cast 박을 때 */
export function buildCastContext(slugs: string[]): string {
  if (slugs.length === 0) return '';
  const blocks: string[] = [];
  for (const slug of slugs) {
    const char = findCharacterBySlug(slug);
    if (!char) continue;
    blocks.push(buildCharacterContext(char));
  }
  return blocks.join('\n\n---\n\n');
}
