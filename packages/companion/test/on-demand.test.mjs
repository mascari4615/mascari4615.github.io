import assert from 'node:assert/strict';
import test from 'node:test';

import { 수요기동, 필요할때 } from '../dist/index.js';

/** 시계를 손에 쥔다 — 「몇 분 안 썼나」가 이 기능의 전부라 진짜 시간에 맡길 수 없다. */
const 판 = (설정 = {}) => {
  const 일어난일 = [];
  let 지금 = 1_000_000;
  let 살아있음 = false;
  const 기동 = new 수요기동({
    이름: '흉내 낸 목소리',
    살았나: async () => 살아있음,
    띄우기: () => {
      일어난일.push('띄움');
      살아있음 = true;
    },
    끄기: () => {
      일어난일.push('끔');
      살아있음 = false;
    },
    쉬면끄기ms: () => 설정.쉬면 ?? 30 * 60_000,
    자동인가: () => 설정.자동 ?? true,
    물어보는간격ms: 0,
    지금: () => 지금,
    log: (m) => 일어난일.push(`말: ${m}`),
  });
  return {
    기동,
    일어난일,
    흐르기: (ms) => {
      지금 += ms;
    },
    켜두기: () => {
      살아있음 = true;
    },
    살았나: () => 살아있음,
  };
};

const 기다림 = () => new Promise((r) => setImmediate(r));

test('쓸 때 켠다 — 그리고 기다리지 않는다', async () => {
  const t = 판();
  assert.equal(t.기동.준비됐나, false);
  await t.기동.써야한다();
  // 띄우기는 뒤에서 돈다. 부르는 쪽은 이미 반환됐다.
  await 기다림();
  assert.ok(t.일어난일.includes('띄움'), '안 띄웠다');
  await t.기동.써야한다();
  assert.equal(t.기동.준비됐나, true, '띄운 뒤에는 쓸 수 있어야 한다');
});

test('이미 떠 있으면 또 안 띄운다', async () => {
  const t = 판();
  t.켜두기();
  await t.기동.써야한다();
  await 기다림();
  assert.equal(t.일어난일.includes('띄움'), false);
  assert.equal(t.기동.준비됐나, true);
});

test('자동을 꺼 두면 손으로 띄운 것만 쓴다', async () => {
  const t = 판({ 자동: false });
  await t.기동.써야한다();
  await 기다림();
  assert.equal(t.일어난일.includes('띄움'), false);
  assert.equal(t.기동.준비됐나, false);
});

test('한동안 안 쓰면 끈다', async () => {
  const t = 판({ 쉬면: 30 * 60_000 });
  await t.기동.써야한다();
  await 기다림();
  await t.기동.써야한다();

  t.흐르기(29 * 60_000);
  assert.equal(await t.기동.쉬었으면끄기(), false, '아직 쉬는 시간이 안 됐다');

  t.흐르기(2 * 60_000);
  assert.equal(await t.기동.쉬었으면끄기(), true);
  assert.equal(t.살았나(), false);
  assert.equal(t.기동.준비됐나, false);
});

test('사람이 손으로 띄워 둔 것은 안 끈다', async () => {
  const t = 판({ 쉬면: 1000 });
  t.켜두기();
  await t.기동.써야한다();
  await 기다림();
  t.흐르기(10 * 60_000);
  assert.equal(await t.기동.쉬었으면끄기(), false, '남이 띄운 것을 껐다');
  assert.equal(t.살았나(), true);
});

test('0 으로 두면 영영 안 끈다', async () => {
  const t = 판({ 쉬면: 0 });
  await t.기동.써야한다();
  await 기다림();
  t.흐르기(100 * 60_000);
  assert.equal(await t.기동.쉬었으면끄기(), false);
});

const 가짜목소리 = (이름, 실패 = false) => ({
  name: 이름,
  contentType: 'audio/wav',
  voices: async () => [{ id: `${이름}-1`, label: 이름, gender: '?' }],
  synthesize: async () => {
    if (실패) throw new Error('죽었다');
    return Buffer.from(이름);
  },
});

test('준비될 때까지 기다렸다 **고른 목소리로** 말한다 — 딴 목소리로 안 바꾼다', async () => {
  const t = 판();
  const 목소리 = 필요할때({ 진짜: 가짜목소리('흉내'), 기동: t.기동 });
  // 아직 안 떴지만, 뒤에서 떠서 결국 그 목소리로 나온다.
  assert.equal((await 목소리.synthesize('안녕')).toString(), '흉내');
});

test('영영 안 뜨면 소리가 없다 — 조용한 게 딴 사람 목소리보다 낫다', async () => {
  const t = 판({ 자동: false }); // 자동 기동 꺼 두면 영영 안 뜬다
  const 목소리 = 필요할때({ 진짜: 가짜목소리('흉내'), 기동: t.기동, 기다림한계ms: 300 });
  await assert.rejects(() => 목소리.synthesize('안녕'), /준비 안 됐다/);
});

test('떠 있는데 실패하면 그 실패가 그대로 드러난다 — 몰래 딴 목소리로 안 바꾼다', async () => {
  const t = 판();
  t.켜두기();
  const 목소리 = 필요할때({ 진짜: 가짜목소리('흉내', true), 기동: t.기동 });
  await assert.rejects(() => 목소리.synthesize('안녕'), /죽었다/);
});

test('꺼져 있어도 목록에는 늘 보인다 — 사라지면 사람은 기능이 없어진 줄 안다', async () => {
  const t = 판();
  const 목소리 = 필요할때({ 진짜: 가짜목소리('흉내'), 기동: t.기동 });
  const 목록 = await 목소리.voices();
  assert.equal(목록.length, 1);
  assert.equal(목록[0].id, '흉내-1');
});

/* 아래 둘이 **실제로 났던 사고**다. 위 시험들은 「부르면 곧바로 뜨는」 가짜를 썼기 때문에
   전부 초록이었는데, 진짜 서버는 뜨는 데 30초가 걸린다. 그 사이 말이 올 때마다 다시
   띄워서 파이썬 프로세스가 38개까지 갔다. 느리게 뜨는 판을 시험이 흉내 내야 한다. */

/** 부른 뒤 `뜨는데` 만큼 지나야 살아나는 판. */
const 느린판 = ({ 뜨는데 = 200, 절대안뜸 = false } = {}) => {
  const 일어난일 = [];
  let 띄운때 = null;
  const 기동 = new 수요기동({
    이름: '느린 것',
    살았나: async () => 절대안뜸 === false && 띄운때 !== null && Date.now() - 띄운때 >= 뜨는데,
    띄우기: () => {
      일어난일.push('띄움');
      띄운때 = Date.now();
    },
    끄기: () => {
      띄운때 = null;
    },
    자동인가: () => true,
    물어보는간격ms: 0,
    준비물어보는간격ms: 20,
    준비대기ms: 400,
    실패후쉬기ms: 10_000,
    log: () => {},
  });
  return { 기동, 일어난일 };
};

test('느리게 뜨는 것은 **한 번만** 띄운다 (실제 사고: 25번 띄워 프로세스 38개)', async () => {
  const t = 느린판({ 뜨는데: 200 });
  for (let i = 0; i < 10; i += 1) {
    await t.기동.써야한다();
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(t.일어난일.filter((x) => x === '띄움').length, 1, `${t.일어난일.length}번 띄웠다`);
  await new Promise((r) => setTimeout(r, 250));
  await t.기동.써야한다();
  assert.equal(t.기동.준비됐나, true, '뜬 뒤에는 쓸 수 있어야 한다');
});

test('영영 안 뜨면 포기하고, 한동안 다시 안 띄운다', async () => {
  const t = 느린판({ 절대안뜸: true });
  await t.기동.써야한다();
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(t.일어난일.filter((x) => x === '띄움').length, 1);
  // 실패 직후에는 다시 안 띄운다 — 안 그러면 실패를 무한히 되풀이한다.
  await t.기동.써야한다();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(t.일어난일.filter((x) => x === '띄움').length, 1, '실패하자마자 또 띄웠다');
});
