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
  assert.deepEqual(roster.orderFor(scores), [ids[1], ...ids.filter((_, seat) => seat !== 1)]);

  for (let seat = 1; seat < count; seat++) {
    const guest = new ranked.RankedRoster({ code: 'ABCDE', you: ids[seat], ids, seat }, false);
    guest.applySync(roster.sync());
    assert.equal(guest.ready, true, `${count}인 ${seat}번 손님도 같은 명단을 받아야 한다`);
    assert.deepEqual(guest.orderFor(scores), roster.orderFor(scores));
  }
}

console.log('[arcade-ranked] 통과. 등급전 지원 정책, 2, 3, 4인 좌석 동기화, 결과 순서');
