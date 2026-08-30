export type SearchableTool = { id: string; title: string; description?: string; aliases?: string; initials?: string };
import { englishKeysToKorean, looksLikeMistypedKorean } from './korean-keyboard';
export { englishKeysToKorean } from './korean-keyboard';

export type SearchMatchKind = 'id' | 'title' | 'initials' | 'aliases' | 'description' | 'fuzzy' | 'keyboard';
export type SearchScore = { score: number; kind: SearchMatchKind; titleNormStart: number | null };

const TOKEN_RE = /[a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ]+/g;

export function normalizeSearchText(value: unknown): string {
  return String(value == null ? '' : value).normalize('NFC').toLocaleLowerCase('ko-KR')
    .replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function compactSearchText(value: unknown): string {
  return normalizeSearchText(value).replace(/\s/g, '');
}

export function searchTokens(value: unknown): string[] {
  return normalizeSearchText(value).match(TOKEN_RE) || [];
}

function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const value = Math.min(current[j - 1] + 1, previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      current[j] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

function fuzzyToken(query: string, candidates: string[]): number | null {
  if (query.length < 3) return null;
  const limit = query.length >= 6 ? 2 : 1;
  let best = limit + 1;
  for (const candidate of candidates) {
    if (candidate.length >= 3) best = Math.min(best, editDistance(query, candidate, limit));
  }
  return best <= limit ? best : null;
}


/**
 * 도구 한 개를 **질문과 무관하게** 미리 다듬어 둔다 (2026-08-16).
 *
 * 왜: 점수 계산이 글자를 칠 때마다 도구마다 `compactSearchText`/`searchTokens` 를 다섯 번씩
 * 다시 돌리고 있었다. 그 안은 `normalize('NFC')` + `toLocaleLowerCase('ko-KR')` + 정규식 두 번이라
 * 싸지 않다. 문서가 250개면 한 글자에 1,250번이다. 그런데 **그 결과는 질문과 아무 상관이 없다.**
 * 실측(폰 폭, 로컬): 한 글자당 화면이 바뀌기까지 450~520ms. 사람이 굼뜨다고 느끼는 값이다.
 *
 * 도구 객체를 열쇠로 삼는다(WeakMap). 목록을 새로 지으면 새 객체라 저절로 새 값이 되고,
 * 옛 것은 알아서 사라진다. 언제 캐시를 비우나를 사람이 기억할 필요가 없다.
 */
type PreparedTool = {
  id: string; title: string; initials: string; aliases: string; description: string;
  fields: Array<{ kind: SearchMatchKind; weight: number; tokens: string[] }>;
  allTokens: string[];
};

const prepared = new WeakMap<SearchableTool, PreparedTool>();

/** 첫 글자를 치기 **전에** 미리 다듬어 둔다. 안 그러면 첫 글자만 유독 굼뜨다(실측 305ms). */
export function warmSearchable(tool: SearchableTool): void { prepare(tool); }

function prepare(tool: SearchableTool): PreparedTool {
  const hit = prepared.get(tool);
  if (hit) return hit;
  const fields = [
    { kind: 'title' as const, weight: 150, tokens: searchTokens(tool.title) },
    { kind: 'id' as const, weight: 125, tokens: searchTokens(tool.id) },
    { kind: 'aliases' as const, weight: 105, tokens: searchTokens(tool.aliases || '') },
    { kind: 'description' as const, weight: 75, tokens: searchTokens(tool.description || '') },
  ];
  const value: PreparedTool = {
    id: compactSearchText(tool.id),
    title: compactSearchText(tool.title),
    initials: compactSearchText(tool.initials || ''),
    aliases: compactSearchText(tool.aliases || ''),
    description: compactSearchText(tool.description || ''),
    fields,
    allTokens: fields.flatMap((field) => field.tokens),
  };
  prepared.set(tool, value);
  return value;
}

/** 문구 일치, 여러 단어의 교차 필드 일치, 제한적인 오타 순으로 점수를 계산한다. */
function scoreQuery(tool: SearchableTool, query: string): SearchScore | null {
  const compact = compactSearchText(query);
  if (!compact) return null;
  const { id, title, initials, aliases, description, fields, allTokens } = prepare(tool);

  if (id === compact) return { score: 1200, kind: 'id', titleNormStart: null };
  if (title === compact) return { score: 1100, kind: 'title', titleNormStart: 0 };
  const titleAt = title.indexOf(compact);
  if (titleAt >= 0) return { score: 950 - titleAt - title.length, kind: 'title', titleNormStart: titleAt };
  if (initials && /^[ㄱ-ㅎ]+$/.test(compact)) {
    const at = initials.indexOf(compact);
    if (at >= 0) return { score: 850 - at, kind: 'initials', titleNormStart: null };
  }
  const phraseFields: Array<[SearchMatchKind, number, string]> = [
    ['id', 760, id], ['aliases', 700, aliases], ['description', 580, description],
  ];
  for (const [kind, weight, field] of phraseFields) {
    const at = field.indexOf(compact);
    if (at >= 0) return { score: weight - Math.min(at, 100), kind, titleNormStart: null };
  }

  const queryTokens = searchTokens(query);
  let score = 0;
  let strongest: SearchMatchKind = 'description';
  let strongestWeight = 0;
  let fuzzyCount = 0;
  for (const token of queryTokens) {
    let tokenScore = 0;
    let tokenKind: SearchMatchKind = 'description';
    for (const field of fields) {
      if (field.tokens.some((candidate) => candidate === token || candidate.includes(token))) {
        if (field.weight > tokenScore) { tokenScore = field.weight; tokenKind = field.kind; }
      }
    }
    if (!tokenScore) {
      const distance = fuzzyToken(token, allTokens);
      if (distance == null) return null;
      tokenScore = 42 - distance * 10;
      tokenKind = 'fuzzy';
      fuzzyCount++;
    }
    score += tokenScore;
    if (tokenScore > strongestWeight) { strongestWeight = tokenScore; strongest = tokenKind; }
  }
  return { score: score + queryTokens.length * 35 - fuzzyCount * 20,
    kind: fuzzyCount ? 'fuzzy' : strongest, titleNormStart: null };
}

export function scoreSearchableTool(tool: SearchableTool, query: string): SearchScore | null {
  const direct = scoreQuery(tool, query);
  if (!looksLikeMistypedKorean(query)) return direct;
  const restored = englishKeysToKorean(query);
  const keyboard = restored === query ? null : scoreQuery(tool, restored);
  if (!keyboard || (direct && direct.score >= keyboard.score - 5)) return direct;
  return { ...keyboard, score: keyboard.score - 5, kind: 'keyboard', titleNormStart: null };
}
