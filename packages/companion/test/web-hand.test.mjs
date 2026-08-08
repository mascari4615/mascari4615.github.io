import assert from 'node:assert/strict';
import test from 'node:test';

import { 웹에서찾기, 읽어오기, 결과뽑기, 글만, 주소풀기, readSpec, handFrom, hintFrom } from '../dist/index.js';

/* 밖에서 찾아보는 손. 진짜 인터넷은 시험에서 안 쓴다 — 남의 화면이 바뀌면 우리 시험이
   빨개지는 건 우리 고장이 아니다. 대신 **뽑아내는 규칙**과 **못 찾았을 때**를 잠근다. */

const 가짜결과 = `
<div class="results">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fko.wikipedia.org%2Fwiki%2F%EB%8B%A4%EB%9E%8C%EC%A5%90">다람쥐 - 위키백과</a>
  <a class="result__snippet" href="#">다람쥐는 다람쥐과에 속하는 <b>설치류</b>다.</a>
  <a class="result__a" href="https://example.com/acorn">도토리 모으기</a>
  <a class="result__snippet" href="#">가을에 도토리를 모은다.</a>
</div>`;

test('결과를 뽑고, 감싸 둔 주소를 원래대로 푼다', () => {
  const 것들 = 결과뽑기(가짜결과);
  assert.equal(것들.length, 2);
  assert.equal(것들[0].제목, '다람쥐 - 위키백과');
  assert.equal(것들[0].주소, 'https://ko.wikipedia.org/wiki/다람쥐');
  assert.match(것들[0].요약, /설치류/);
  assert.equal(것들[1].주소, 'https://example.com/acorn');
});

test('찾아서 사람이 읽는 글로 준다', async () => {
  const 글 = await 웹에서찾기('다람쥐', { 가져오기: async () => 가짜결과 });
  assert.match(글, /다람쥐 - 위키백과/);
  assert.match(글, /https:\/\/ko\.wikipedia\.org/);
});

test('못 찾으면 못 찾았다고 한다 — 지어내는 것보다 낫다', async () => {
  const 글 = await 웹에서찾기('없는것', { 가져오기: async () => '<html>아무것도 없음</html>' });
  assert.match(글, /못 찾았다/);
});

test('저쪽이 죽어도 얘는 안 죽는다', async () => {
  const 글 = await 웹에서찾기('아무거나', {
    가져오기: async () => {
      throw new Error('HTTP 503');
    },
  });
  assert.match(글, /못 찾았다/);
  assert.match(글, /503/);
});

test('오래 걸리면 포기한다 — 검색 때문에 곁의 존재가 굳으면 안 된다', async () => {
  const 글 = await 웹에서찾기('느린것', {
    기다림ms: 60,
    가져오기: (url, signal) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          const e = new Error('abort');
          e.name = 'AbortError';
          reject(e);
        });
      }),
  });
  assert.match(글, /못 찾았다/);
  assert.match(글, /초 안에 답이 없었다/);
});

test('빈 물음은 밖에 안 나간다', async () => {
  let 불렀나 = false;
  const 글 = await 웹에서찾기('   ', {
    가져오기: async () => {
      불렀나 = true;
      return '';
    },
  });
  assert.equal(불렀나, false);
  assert.match(글, /무엇을 찾을지/);
});

test('페이지를 열면 대본·모양자를 걷어내고 글만 준다', async () => {
  const 글 = await 읽어오기('https://example.com', {
    가져오기: async () => '<html><script>var x=1;</script><style>a{}</style><p>도토리는 맛있다</p></html>',
  });
  assert.equal(글, '도토리는 맛있다');
});

test('주소가 아니면 안 연다', async () => {
  const 글 = await 읽어오기('C:\\Windows\\System32');
  assert.match(글, /주소가 아니다/);
});

test('태그와 기호를 사람이 읽는 글로 바꾼다', () => {
  assert.equal(글만('<b>가&amp;나</b>  다&nbsp;라'), '가&나 다 라');
});

test('밖을 읽는 손은 경로 없이도 만들어진다 — 읽을 자리가 그때그때 온다', () => {
  const spec = readSpec({ name: '찾아보기', what: '밖에서 찾는다', kind: 'web-search', when: ['찾아봐'] });
  assert.notEqual(spec, null);
  const 손 = handFrom(spec, { within: 'C:\\어딘가' });
  assert.notEqual(손, null, '울타리 때문에 막히면 안 된다 — 파일을 읽는 손이 아니다');
  assert.equal(손.name, '찾아보기');
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
