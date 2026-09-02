import assert from 'node:assert/strict';
import { build } from 'esbuild';

const built = await build({
  entryPoints: ['src/widgets/arcade/ranked.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  write: false
});
const source = built.outputFiles[0].text;
const ranked = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

assert.equal(ranked.supportsRanked('gomoku', [2, 2]), true);
assert.equal(ranked.supportsRanked('yacht', [2, 4]), true);
assert.equal(ranked.supportsRanked('fleet', [2, 4]), false);
assert.equal(ranked.supportsRanked('speed', [2, 2]), false);

const run = new ranked.RankedRun();
let waitTick = () => {};
let waitDrops = 0;
run.startWaiting(() => {}, (tick, delay) => {
  waitTick = tick;
  assert.equal(delay, 1000);
  return () => { waitDrops += 1; };
});
assert.equal(run.room, 'beginner');
assert.equal(run.others, 0);
waitTick();
let queueDrops = 0;
run.queue = { cancel: () => { queueDrops += 1; } };
run.paired = { code: 'ABCDE', you: 'me', ids: ['me', 'you'], seat: 0 };
run.limit = 60;
let linkExpired = false;
run.watchLink(() => { linkExpired = true; }, 0);
run.reset();
await new Promise((resolve) => setTimeout(resolve, 5));
assert.equal(linkExpired, false);
assert.equal(queueDrops, 1);
assert.equal(waitDrops, 1);
assert.equal(run.paired, null);
assert.equal(run.limit, null);

const yachtBuilt = await build({
  entryPoints: ['src/widgets/arcade/games/yacht.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  write: false
});
const yachtModule = await import(`data:text/javascript;base64,${Buffer.from(yachtBuilt.outputFiles[0].text).toString('base64')}`);
const seats = ['A', 'B', 'C'].map((name, index) => ({ index, name, bot: false, score: 0 }));
const ctx = (now) => ({ seats, opts: { limit: 60 }, rng: () => 0, now, round: 0 });
let yachtState = yachtModule.yacht.init(ctx(0));
assert.equal(yachtState.turnEndsAt, 60_000);
assert.equal(yachtModule.yacht.tick(yachtState, ctx(59_999)), yachtState);
yachtState = yachtModule.yacht.tick(yachtState, ctx(60_000));
assert.deepEqual(yachtState.forfeited, [true, false, false]);
assert.equal(yachtState.turn, 1);
assert.equal(yachtState.turnEndsAt, 120_000);
assert.equal(yachtModule.yacht.outcome(yachtState, ctx(60_000)).over, false);
yachtState = yachtModule.yacht.tick(yachtState, ctx(120_000));
assert.deepEqual(yachtState.forfeited, [true, true, false]);
assert.deepEqual(yachtModule.yacht.outcome(yachtState, ctx(120_000)), {
  over: true,
  scores: [-1, -1, 0],
  note: { key: 'arcade.yacht.timeout', params: { who: 'B' } }
});

for (const count of [2, 3, 4]) {
  const ids = Array.from({ length: count }, (_, seat) => `account-${seat}`);
  const match = { code: 'ABCDE', you: ids[0], ids, seat: 0 };
  const roster = new ranked.RankedRoster(match, true);
  const peers = [];

  for (let seat = count - 1; seat >= 1; seat--) {
    const peer = { id: `peer-${seat}` };
    peers.push(peer);
    assert.equal(roster.acceptPeerMeta(peer.id, `ranked-roster:${seat}`), true);
  }

  assert.equal(roster.ready, true, `${count}인 명단이 완성되어야 한다`);
  assert.deepEqual(roster.sync(), ids, `${count}인 서버 좌석 순서를 보존해야 한다`);
  assert.deepEqual(roster.orderPeers(peers).map((peer) => peer.id), ids.slice(1).map((_, seat) => `peer-${seat + 1}`));

  const scores = ids.map((_, seat) => seat === 1 ? 99 : 10 - seat);
  const expected = { placements: [[ids[1]], ...ids.filter((_, seat) => seat !== 1).map((id) => [id])] };
  assert.deepEqual(roster.outcomeFor(scores), expected);

  const tied = ids.map((_, seat) => seat < 2 ? 99 : 10 - seat);
  assert.deepEqual(roster.outcomeFor(tied), {
    placements: [ids.slice(0, 2), ...ids.slice(2).map((id) => [id])]
  });

  for (let seat = 1; seat < count; seat++) {
    const guest = new ranked.RankedRoster({ code: 'ABCDE', you: ids[seat], ids, seat }, false);
    guest.applySync(roster.sync());
    assert.equal(guest.ready, true, `${count}인 ${seat}번 손님도 같은 명단을 받아야 한다`);
    assert.deepEqual(guest.outcomeFor(scores), roster.outcomeFor(scores));
  }
}

console.log('[arcade-ranked] 통과. 서버 공용 지원 정책, Yacht 시간 초과, 2~4인 좌석 동기화, 동률 결과');
