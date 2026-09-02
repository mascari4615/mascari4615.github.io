'use strict';

function normalizeOutcome(value, roster) {
  const placements = value && Array.isArray(value.placements) ? value.placements : null;
  if (!placements || placements.length === 0) return null;
  const groups = [];
  for (const group of placements) {
    if (!Array.isArray(group) || group.length === 0) return null;
    groups.push(group.map(String));
  }
  const flat = groups.flat();
  const expected = roster.map(String);
  if (flat.length !== expected.length || new Set(flat).size !== flat.length) return null;
  const allowed = new Set(expected);
  if (flat.some((id) => !allowed.has(id))) return null;
  return { placements: groups };
}

function outcomeFromScores(ids, scores, higherWins = true) {
  if (ids.length === 0 || ids.length !== scores.length || scores.some((score) => !Number.isFinite(score))) return null;
  const rows = ids.map((id, seat) => ({ id: String(id), score: scores[seat], seat }));
  rows.sort((a, b) => (higherWins ? b.score - a.score : a.score - b.score) || a.seat - b.seat);
  const placements = [];
  let priorScore = Number.NaN;
  for (const row of rows) {
    const prior = placements[placements.length - 1];
    if (prior && row.score === priorScore) prior.push(row.id);
    else placements.push([row.id]);
    priorScore = row.score;
  }
  return normalizeOutcome({ placements }, ids);
}

function flattenOutcome(outcome) {
  return outcome.placements.flat();
}

function outcomeKey(outcome) {
  return outcome.placements.map((group) => [...group].sort().join('\u001f')).join('\u001e');
}

/*
 * 등급전 양쪽 경계의 공용 계약. 브라우저의 버튼과 서버의 좌석 수.
 * 시간, 점수 계산은 서버 게임 규칙 소유.
 */
const RANKED_CAPABILITIES = Object.freeze({
  gomoku: Object.freeze({ minSeats: 2, maxSeats: 2 }),
  yacht: Object.freeze({ minSeats: 2, maxSeats: 4 })
});

function rankedCapability(game) {
  return RANKED_CAPABILITIES[game] ?? null;
}

function rankedSeatCounts(game) {
  const capability = rankedCapability(game);
  if (!capability) return [];
  return Array.from({ length: capability.maxSeats - capability.minSeats + 1 }, (_, i) => capability.minSeats + i);
}

function supportsRanked(game, seats) {
  const capability = rankedCapability(game);
  return !!capability && seats[0] === capability.minSeats && seats[1] === capability.maxSeats;
}

module.exports = {
  flattenOutcome,
  normalizeOutcome,
  outcomeFromScores,
  outcomeKey,
  rankedCapability,
  rankedSeatCounts,
  supportsRanked
};
