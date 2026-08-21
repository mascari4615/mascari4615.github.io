import assert from 'node:assert/strict';
import test from 'node:test';

import { searchWeb, readIn, extractResults, textOnly, resolveUrl, readSpec, handFrom, hintFrom } from '../dist/index.js';

/* 밖에서 찾아보는 손. 진짜 인터넷은 시험에서 안 쓴다 — 남의 화면이 바뀌면 우리 시험이
   빨개지는 건 우리 고장이 아니다. 대신 **뽑아내는 규칙**과 **못 찾았을 때**를 잠근다. */

const fakeResult = `
<div class="results">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fko.wikipedia.org%2Fwiki%2F%EB%8B%A4%EB%9E%8C%EC%A5%90">다람쥐 - 위키백과</a>
  <a class="result__snippet" href="#">다람쥐는 다람쥐과에 속하는 <b>설치류</b>다.</a>
  <a class="result__a" href="https://example.com/acorn">도토리 모으기</a>
  <a class="result__snippet" href="#">가을에 도토리를 모은다.</a>
</div>`;

test('결과를 뽑고, 감싸 둔 주소를 원래대로 푼다', () => {
  const items = extractResults(fakeResult);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, '다람쥐 - 위키백과');
  assert.equal(items[0].url, 'https://ko.wikipedia.org/wiki/다람쥐');
  assert.match(items[0].summary, /설치류/);
  assert.equal(items[1].url, 'https://example.com/acorn');
});

test('찾아서 사람이 읽는 글로 준다', async () => {
  const content = await searchWeb('다람쥐', { fetch: async () => fakeResult });
  assert.match(content, /다람쥐 - 위키백과/);
  assert.match(content, /https:\/\/ko\.wikipedia\.org/);
});

test('못 찾으면 못 찾았다고 한다 — 지어내는 것보다 낫다', async () => {
  const content2 = await searchWeb('없는것', { fetch: async () => '<html>아무것도 없음</html>' });
  assert.match(content2, /못 찾았다/);
});

test('저쪽이 죽어도 얘는 안 죽는다', async () => {
  const content3 = await searchWeb('아무거나', {
    fetch: async () => {
      throw new Error('HTTP 503');
    },
  });
  assert.match(content3, /못 찾았다/);
  assert.match(content3, /503/);
});

test('오래 걸리면 포기한다 — 검색 때문에 곁의 존재가 굳으면 안 된다', async () => {
  const content4 = await searchWeb('느린것', {
    waitMs: 60,
    fetch: (url, signal) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          const e = new Error('abort');
          e.name = 'AbortError';
          reject(e);
        });
      }),
  });
  assert.match(content4, /못 찾았다/);
  assert.match(content4, /초 안에 답이 없었다/);
});

test('빈 물음은 밖에 안 나간다', async () => {
  let called = false;
  const content5 = await searchWeb('   ', {
    fetch: async () => {
      called = true;
      return '';
    },
  });
  assert.equal(called, false);
  assert.match(content5, /무엇을 찾을지/);
});

test('페이지를 열면 대본·모양자를 걷어내고 textOnly 준다', async () => {
  const content6 = await readIn('https://example.com', {
    fetch: async () => '<html><script>var x=1;</script><style>a{}</style><p>도토리는 맛있다</p></html>',
  });
  assert.equal(content6, '도토리는 맛있다');
});

test('주소가 아니면 안 연다', async () => {
  const content7 = await readIn('C:\\Windows\\System32');
  assert.match(content7, /주소가 아니다/);
});

test('태그와 기호를 사람이 읽는 글로 바꾼다', () => {
  assert.equal(textOnly('<b>가&amp;나</b>  다&nbsp;라'), '가&나 다 라');
});

test('밖을 읽는 손은 경로 없이도 만들어진다 — 읽을 자리가 그때그때 온다', () => {
  const spec = readSpec({ name: '찾아보기', what: '밖에서 찾는다', kind: 'web-search', when: ['찾아봐'] });
  assert.notEqual(spec, null);
  const hand = handFrom(spec, { within: 'C:\\어딘가' });
  assert.notEqual(hand, null, '울타리 때문에 막히면 안 된다 — 파일을 읽는 손이 아니다');
  assert.equal(hand.name, '찾아보기');
});

test('모르는 갈래는 손이 안 된다', () => {
  assert.equal(readSpec({ name: 'x', what: 'y', kind: 'run-command', path: 'z' }), null);
});

test('찾는 손은 말에서 **찾을 말**을 뽑는다 (실제 사고: 늘 빈손으로 불렸다)', () => {
  const spec = readSpec({ name: '찾아보기', what: '밖에서 찾는다', kind: 'web-search', when: ['찾아봐', '뭐야'] });
  const hint = hintFrom(spec);
  assert.notEqual(hint.argument, undefined, '넘길 말을 뽑는 자리가 없다');
  assert.equal(hint.argument('GPT-SoVITS 가 뭐야? 찾아봐'), 'GPT-SoVITS 가');
  // 부르는 말만 있으면 온 말 그대로 — 빈손으로 보내는 것보다 낫다.
  assert.equal(hint.argument('찾아봐'), '찾아봐');
});

test('주소 읽는 손은 말에서 주소만 집는다', () => {
  const spec = readSpec({ name: '열어보기', what: '연다', kind: 'read-web', when: ['http'] });
  const hint = hintFrom(spec);
  assert.equal(hint.argument('이거 봐 https://example.com/a?b=1 재밌음'), 'https://example.com/a?b=1');
});

test('파일 읽는 손은 예전처럼 빈손이어도 된다 — 통째로 읽는 게 맞는 자리다', () => {
  const spec = readSpec({ name: '할일보기', what: '본다', kind: 'read-file', path: 'C:/x.md', when: ['할 일'] });
  assert.equal(hintFrom(spec).argument, undefined);
});
