import { createHash } from 'node:crypto';

// 본문 조각 집합의 Jaccard 유사도 0.8 이상. 짧은 글과 반복문은 정확 일치만 허용
export const DUPLICATE_POLICY = Object.freeze({ method: 'body-shingles-v1', width: 3, at: 0.8, minShingles: 40 });

export function fingerprint(body) {
  const normalized = String(body ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
    .replace(/^---\n[\s\S]*?\n---(?:\n|$)/, '')
    .normalize('NFKC').toLowerCase();
  const words = normalized.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) || [];
  const canonical = words.join(' ');
  const shingles = new Set();
  for (let i = 0; i <= words.length - DUPLICATE_POLICY.width; i += 1) {
    shingles.add(words.slice(i, i + DUPLICATE_POLICY.width).join(' '));
  }
  return { hash: createHash('sha256').update(canonical).digest('hex'), shingles,
    length: canonical.length, eligible: canonical.length >= 30 && new Set(words).size >= 4 };
}

export function compareFingerprints(a, b, common) {
  if (!a.eligible || !b.eligible) return { match: false, score: 0 };
  if (a.hash === b.hash) return { match: true, score: 1 };
  if (Math.min(a.shingles.size, b.shingles.size) < DUPLICATE_POLICY.minShingles) return { match: false, score: 0 };
  if (common == null) {
    const [small, large] = a.shingles.size <= b.shingles.size ? [a, b] : [b, a];
    common = 0;
    for (const s of small.shingles) if (large.shingles.has(s)) common += 1;
  }
  const score = common / (a.shingles.size + b.shingles.size - common);
  return { match: score >= DUPLICATE_POLICY.at, score };
}

export const duplicateBody = (d) => d.duplicateText ?? d.text ?? '';

export function findDuplicates(docs) {
  const prints = docs.map((d) => fingerprint(duplicateBody(d)));
  const postings = new Map();
  const exact = new Map();
  const matches = prints.map(() => new Map());
  let candidates = 0; let pairs = 0;
  for (let i = 0; i < prints.length; i += 1) {
    const fp = prints[i];
    if (!fp.eligible) continue;
    const counts = new Map();
    for (const shingle of fp.shingles) {
      const ids = postings.get(shingle) || [];
      for (const j of ids) counts.set(j, (counts.get(j) || 0) + 1);
      ids.push(i); postings.set(shingle, ids);
    }
    for (const j of exact.get(fp.hash) || []) if (!counts.has(j)) counts.set(j, 0);
    const ids = exact.get(fp.hash) || []; ids.push(i); exact.set(fp.hash, ids);
    for (const [j, common] of counts) {
      candidates += 1;
      const result = compareFingerprints(fp, prints[j], common);
      if (!result.match) continue;
      pairs += 1;
      matches[i].set(j, result.score); matches[j].set(i, result.score);
    }
  }
  // 긴 본문 우선, 같은 길이는 ID 순서. 모든 구성원끼리 직접 일치하는 무리
  const order = docs.map((_, i) => i).sort((a, b) => prints[b].length - prints[a].length
    || (docs[a].id < docs[b].id ? -1 : docs[a].id > docs[b].id ? 1 : 0));
  const groups = []; const assigned = new Set(); const representatives = new Map();
  for (const rep of order) {
    if (assigned.has(rep)) continue;
    const members = [rep]; assigned.add(rep);
    for (const candidate of order) {
      if (assigned.has(candidate) || !members.every((m) => matches[m].has(candidate))) continue;
      members.push(candidate); assigned.add(candidate);
      representatives.set(docs[candidate].id, docs[rep].id);
    }
    if (members.length > 1) groups.push(members.map((i) => docs[i].id));
  }
  return { representatives, groups, stat: { ...DUPLICATE_POLICY, pairs, candidates,
    marked: representatives.size, groups: groups.length } };
}
