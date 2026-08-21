import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { 대사창고, 골라내기, touchReply, touchKind, clearReplyMemory, reflexFor, 반사갈래 } from '../dist/index.js';

const newFile = () => join(mkdtempSync(join(tmpdir(), 'stock-')), '지은-대사.json');

test('한가할 때 채워 두면 그걸 꺼내 쓴다', async () => {
  const store = new 대사창고({ 지어오기: async () => '…또야?\n…손 치워.\n…그만해.' });
  assert.equal(store.남은수('touch:쿡:1'), 0);
  const storedCount = await store.채우기('touch:쿡:1', '쿡 찔렸을 때 대꾸');
  assert.equal(storedCount, 3);
  assert.equal(store.raise('touch:쿡:1'), '…또야?');
});

test('꺼낸 것은 없어진다 — 담아 둔 걸 다시 쓰면 또 도는 말이 된다', async () => {
  const store2 = new 대사창고({ 지어오기: async () => '하나\n둘' });
  await store2.채우기('갈래', '아무거나');
  assert.equal(store2.raise('갈래'), '하나');
  assert.equal(store2.raise('갈래'), '둘');
  assert.equal(store2.raise('갈래'), null);
});

test('지어 온 것 중 설명·존댓말·긴 말은 안 담는다', async () => {
  const store3 = new 대사창고({
    지어오기: async () =>
      [
        '1. …또야?',
        '"…손 치워."',
        '그만해 주세요',
        '이 대꾸는 짧은 자리에 쓰기에는 너무 길어서 설명문에 가깝다',
        '- …그만.',
      ].join('\n'),
  });
  const storedCount2 = await store3.채우기('갈래', '아무거나');
  assert.equal(storedCount2, 3);
  assert.deepEqual([store3.raise('갈래'), store3.raise('갈래'), store3.raise('갈래')], ['…또야?', '…손 치워.', '…그만.']);
});

test('쓸 게 하나도 안 남으면 아무것도 안 담는다', async () => {
  const store4 = new 대사창고({ 지어오기: async () => '무엇을 도와드릴까요?\n필요하신 게 있으면 말씀해 주세요' });
  assert.equal(await store4.채우기('갈래', '아무거나'), 0);
  assert.equal(store4.raise('갈래'), null);
});

test('두뇌가 못 지어도(널·예외) 얘는 안 죽는다', async () => {
  const nullValue = new 대사창고({ 지어오기: async () => null });
  assert.equal(await nullValue.채우기('갈래', '아무거나'), 0);
  const crash = new 대사창고({
    지어오기: async () => {
      throw new Error('두뇌가 없다');
    },
  });
  assert.equal(await crash.채우기('갈래', '아무거나'), 0);
});

test('넉넉하면 두뇌를 안 부른다', async () => {
  let callCount = 0;
  const store5 = new 대사창고({
    지어오기: async () => {
      callCount += 1;
      return '하나\n둘';
    },
  });
  await store5.채우기('갈래', '아무거나', 2);
  await store5.채우기('갈래', '아무거나', 2);
  assert.equal(callCount, 1);
});

test('껐다 켜도 담아 둔 게 남는다', async () => {
  const path = newFile();
  const firstRun = new 대사창고({ path, 지어오기: async () => '하나\n둘' });
  await firstRun.채우기('갈래', '아무거나');
  const nextRun = new 대사창고({ path, 지어오기: async () => '안 불러야 한다' });
  assert.equal(nextRun.raise('갈래'), '하나');
  // 꺼낸 것은 파일에서도 빠져야 한다 — 안 그러면 다음에 켤 때 같은 말이 또 나온다.
  assert.equal(JSON.parse(readFileSync(path, 'utf8'))['갈래'].말들.includes('하나'), false);
});

test('인격이 바뀌면 앞 인격이 지은 말은 안 쓴다', async () => {
  let who = '욘';
  const store6 = new 대사창고({ whom: () => who, 지어오기: async () => '…또야?' });
  await store6.채우기('갈래', '아무거나');
  who = '무명';
  assert.equal(store6.남은수('갈래'), 0);
  assert.equal(store6.raise('갈래'), null);
});

test('깨진 파일은 없는 셈 친다 — 그것 때문에 못 뜨면 안 된다', () => {
  const path = newFile();
  writeFileSync(path, '{{{ 깨짐', 'utf8');
  const store7 = new 대사창고({ path, 지어오기: async () => null });
  assert.equal(store7.남은수('갈래'), 0);
});

test('닿음 대꾸가 창고 것을 먼저 쓰고, 비면 손으로 적은 표로 물러선다', async () => {
  clearReplyMemory();
  const store8 = new 대사창고({ 지어오기: async () => '…또야?' });
  await store8.채우기(touchKind('쿡', 0), '쿡 찔렸을 때');
  assert.equal(touchReply('쿡', { times: 1, 창고: store8 }), '…또야?');
  // 비었으니 이제 기본 표. (기본 표에 있는 말이어야 한다)
  const next = touchReply('쿡', { times: 1, 창고: store8 });
  assert.ok(['…어?', '왜.', '응?'].includes(next), `기본 표에서 나와야 하는데 "${next}"`);
});

test('창고를 안 주면 예전과 똑같이 돈다', () => {
  clearReplyMemory();
  const text = touchReply('쿡', { times: 1 });
  assert.ok(['…어?', '왜.', '응?'].includes(text));
});

test('골라내기는 겹치는 말을 한 번만 남긴다', () => {
  assert.deepEqual(골라내기('…또야?\n…또야?\n…그만.'), ['…또야?', '…그만.']);
});

test('두뇌가 되물으며 낸 말은 대꾸로 안 담는다 (89회차 실측 — 창고에 실제로 담겼던 것들)', async () => {
  const store9 = new 대사창고({
    지어오기: async () => ['소설/스토리 캐릭터의 대사인가요?', '게임 대사 작성인가요?', '다른 프로젝트인가요?'].join('\n'),
  });
  assert.equal(await store9.채우기('갈래', '아무거나'), 0);
});

test('반말 대꾸는 그 잣대에 안 걸린다', () => {
  assert.deepEqual(골라내기('…또야?\n뭐야 갑자기\n아, 놔\n됐어 됐어'), ['…또야?', '뭐야 갑자기', '아, 놔', '됐어 됐어']);
});

test('반사도 미리 지어 둔 것을 먼저 쓰고, 비면 손으로 적은 표로 물러선다', async () => {
  const store10 = new 대사창고({ 지어오기: async () => '어, 왔어' });
  await store10.채우기(반사갈래('인사', '보통'), '인사 받는 말');
  assert.equal(reflexFor('안녕', { energy: 0.5, 창고: store10 }), '어, 왔어');
  const next2 = reflexFor('안녕', { energy: 0.5, 창고: store10 });
  assert.ok(['응, 왔네.', '어, 안녕.', '왔어?'].includes(next2), `기본 표에서 나와야 하는데 "${next2}"`);
});

test('결이 다르면 그 자리 것을 안 꺼낸다 — 늘어진 애가 생생한 말을 하면 안 된다', async () => {
  const store11 = new 대사창고({ 지어오기: async () => '…어… 왔네' });
  await store11.채우기(반사갈래('인사', '처짐'), '나른할 때 인사');
  // 기운이 생생한데 처짐 자리 것이 나오면 안 된다 — 기본 표(생생)에서 나와야 한다.
  const text2 = reflexFor('안녕', { energy: 0.9, 창고: store11 });
  assert.notEqual(text2, '…어… 왔네');
  assert.ok(['오, 왔네!', '어 안녕.', '왔구나.'].includes(text2), `생생 표에서 나와야 하는데 "${text2}"`);
  assert.equal(store11.남은수(반사갈래('인사', '처짐')), 1);
});

test('반사 아닌 말은 창고가 있어도 반사하지 않는다', async () => {
  const store12 = new 대사창고({ 지어오기: async () => '아무 말' });
  await store12.채우기(반사갈래('인사', '보통'), '인사');
  assert.equal(reflexFor('오늘 회의가 진짜 길었어', { energy: 0.5, 창고: store12 }), null);
});

test('인격을 주면 그 글이 부탁에 실린다 — 안 실으면 맨 두뇌가 짓는다 (89회차 실측)', async () => {
  let receivedRequest = '';
  const store13 = new 대사창고({
    인격글: () => '너는 욘. 늘 나른하고 반말만 쓴다.',
    지어오기: async (prompt) => {
      receivedRequest = prompt;
      return '어, 왔어';
    },
  });
  await store13.채우기('갈래', '인사 받는 말');
  assert.ok(receivedRequest.includes('너는 욘. 늘 나른하고 반말만 쓴다.'), '인격 글이 안 실렸다');
  assert.ok(receivedRequest.includes('반말'), '반말로 지으라는 말이 안 실렸다');
});
