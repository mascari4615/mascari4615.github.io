import assert from 'node:assert/strict';
import test from 'node:test';

import { Tally, pickIngredients, tallyReport } from '../dist/index.js';

const 재료 = (name, text, weight, when) => ({ name, text, weight, ...(when === undefined ? {} : { when }) });

// ── 세기 ────────────────────────────────────────────────────────────

test('실린 것과 안 실린 것을 따로 센다', () => {
  const t = new Tally();
  t.mark('기분', '실림');
  t.mark('기분', '실림');
  t.mark('화제', '꺼짐');
  assert.equal(t.get('기분').실림, 2);
  assert.equal(t.get('화제').꺼짐, 1);
  assert.equal(t.get('화제').실림, 0);
});

test('한 번도 안 센 것은 0 이다', () => {
  assert.deepEqual(new Tally().get('없는것'), { 실림: 0, 밀림: 0, 꺼짐: 0, 빔: 0, lastAt: 0 });
});

test('마지막으로 실린 때를 남긴다 — 실릴 때만', () => {
  let 지금 = 100;
  const t = new Tally({ now: () => 지금 });
  t.mark('기분', '꺼짐');
  assert.equal(t.get('기분').lastAt, 0, '안 실렸으면 안 적는다');
  t.mark('기분', '실림');
  assert.equal(t.get('기분').lastAt, 100);
});

// ── 죽은 기능 찾기 ──────────────────────────────────────────────────

test('여러 번 지나갔는데 한 번도 안 실린 것을 찾는다 — 이게 이걸 만든 이유다', () => {
  const t = new Tally();
  for (let i = 0; i < 12; i += 1) t.mark('화제', '꺼짐');
  for (let i = 0; i < 12; i += 1) t.mark('기분', '실림');
  assert.deepEqual(t.neverUsed(10), ['화제']);
});

test('몇 번 안 지나간 건 아직 죽었다고 안 한다 — 조급하게 판단하지 않는다', () => {
  const t = new Tally();
  t.mark('화제', '꺼짐');
  t.mark('화제', '꺼짐');
  assert.deepEqual(t.neverUsed(10), []);
});

test('밀리기만 한 것도 죽은 것으로 본다 — 켜져도 두뇌에 안 가면 없는 것과 같다', () => {
  const t = new Tally();
  for (let i = 0; i < 12; i += 1) t.mark('통한말', '밀림');
  assert.deepEqual(t.neverUsed(10), ['통한말']);
});

test('몇 번 지나가야 판단할지 정할 수 있다', () => {
  const t = new Tally();
  for (let i = 0; i < 3; i += 1) t.mark('화제', '꺼짐');
  assert.deepEqual(t.neverUsed(3), ['화제']);
});

// ── 고르는 자리에서 저절로 세기 ─────────────────────────────────────

test('재료를 고를 때 넷으로 갈라 센다 — 여기가 모두 지나가는 유일한 길목이다', () => {
  const 센것 = [];
  pickIngredients(
    [
      재료('실릴것', '짧은 말', 9),
      재료('꺼진것', '안 켜짐', 8, false),
      재료('빈것', '', 7),
      재료('밀릴것', '가'.repeat(500), 6),
    ],
    { maxChars: 100, maxLines: 5, mark: (name, fate) => 센것.push(`${name}:${fate}`) },
  );
  assert.deepEqual(센것.sort(), ['꺼진것:꺼짐', '밀릴것:밀림', '빈것:빔', '실릴것:실림'].sort());
});

test('줄 수에 밀린 것도 밀림으로 센다 — 조용히 사라지면 안 된다', () => {
  const 센것 = [];
  pickIngredients(
    Array.from({ length: 6 }, (_, i) => 재료(`${i}`, '짧다', 10 - i)),
    { maxLines: 2, mark: (name, fate) => 센것.push(`${name}:${fate}`) },
  );
  assert.equal(센것.filter((x) => x.endsWith('밀림')).length, 4);
});

test('세는 걸 안 달아도 고르기는 그대로 돈다', () => {
  const 고른것 = pickIngredients([재료('가', '하나', 9), 재료('나', '둘', 8)]);
  assert.deepEqual(고른것.map((x) => x.name), ['가', '나']);
});

test('큰 게 밀려도 뒤의 작은 건 실린다 — 하나 못 넣었다고 멈추지 않는다', () => {
  const 고른것 = pickIngredients(
    [재료('큰것', '가'.repeat(200), 9), 재료('작은것', '짧다', 8)],
    { maxChars: 50 },
  );
  assert.deepEqual(고른것.map((x) => x.name), ['작은것']);
});

// ── 사람이 읽는 표 ──────────────────────────────────────────────────

test('한 번도 안 실린 것을 맨 위에 둔다 — 잘 도는 걸 위에 놓으면 아무것도 안 보인다', () => {
  const t = new Tally();
  for (let i = 0; i < 20; i += 1) t.mark('기분', '실림');
  for (let i = 0; i < 20; i += 1) t.mark('화제', '꺼짐');
  const 표 = tallyReport(t).split('\n');
  assert.match(표[0], /화제/);
  assert.match(표[0], /한 번도 안 실림/);
});

test('센 게 없으면 그렇다고 말한다', () => {
  assert.match(tallyReport(new Tally()), /아직 센 게 없다/);
});

// ── 껐다 켜기 ───────────────────────────────────────────────────────

test('파일에 남겨 두면 껐다 켜도 이어진다 — 하루 이틀 봐야 죽었는지 안다', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'tally-'));
  const path = join(dir, '기록.json');
  try {
    const 처음 = new Tally({ path, saveEvery: 1 });
    처음.mark('기분', '실림');
    처음.mark('기분', '실림');
    assert.equal(new Tally({ path }).get('기분').실림, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('파일이 깨져 있어도 죽지 않는다', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'tally-'));
  const path = join(dir, '기록.json');
  try {
    writeFileSync(path, '깨진 것', 'utf8');
    assert.equal(new Tally({ path }).get('기분').실림, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
