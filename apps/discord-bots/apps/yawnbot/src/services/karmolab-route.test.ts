/**
 * TASK-KL-196 E — 말로 부리기 시험.
 *
 * 제일 중요한 것: **모델이 지어낸 도구로 사람을 보내지 않는 것**. 그럴듯한 id 를 그대로
 * 열면 없는 화면으로 떨어지고, 그 순간 이 기능은 「가끔 엉뚱한 데로 보내는 것」이 된다.
 * 그다음이 아끼기 — 같은 물음을 두 번 묻지 않고, 「없다」도 기억한다.
 */
import { describe, it, expect } from 'vitest';
import {
  DAILY_LIMIT,
  MIN_GAP_MS,
  RouteMemory,
  buildPrompt,
  loadCatalog,
  normalizeQuery,
  parsePick,
  setCatalogForTest,
} from './karmolab-route';

const items = [
  { id: 'charcount', title: 'charcount', lead: '글자수·단어·바이트' },
  { id: 'bgremove', title: 'bgremove', lead: '사진 배경 지우기' },
];

describe('물음 정규화', () => {
  it('띄어쓰기·대소문자·물음표를 같은 것으로 본다', () => {
    expect(normalizeQuery('  배경   지워줘? ')).toBe('배경 지워줘');
    expect(normalizeQuery('Background REMOVE!')).toBe('background remove');
  });
});

describe('모델 답 읽기', () => {
  it('목록에 있는 id 만 받는다', () => {
    expect(parsePick('{"toolId":"bgremove","why":"배경을 지운다"}', items)).toEqual({
      toolId: 'bgremove',
      why: '배경을 지운다',
    });
  });

  it('지어낸 id 는 버린다 — 없는 화면으로 보내지 않는다', () => {
    expect(parsePick('{"toolId":"magic-eraser","why":"쓱"}', items)).toBeNull();
  });

  it('none 은 「못 골랐다」다', () => {
    expect(parsePick('{"toolId":"none","why":""}', items)).toBeNull();
  });

  it('앞뒤에 말이 붙어 있어도 JSON 만 꺼낸다', () => {
    expect(parsePick('네! {"toolId":"charcount","why":"글자를 센다"} 입니다', items)?.toolId).toBe('charcount');
  });

  it('JSON 이 아니면 못 골랐다로 본다', () => {
    expect(parsePick('bgremove 를 쓰세요', items)).toBeNull();
  });

  it('이유는 잘라 담는다 — 화면 한 줄을 넘기지 않는다', () => {
    const long = 'ㄱ'.repeat(200);
    expect(parsePick(`{"toolId":"charcount","why":"${long}"}`, items)?.why.length).toBe(60);
  });
});

describe('시키는 말', () => {
  it('목록과 물음이 들어가고, 못 고를 수 있다고 알려 준다', () => {
    const prompt = buildPrompt('사진 배경 지워줘', items);
    expect(prompt).toContain('bgremove: 사진 배경 지우기');
    expect(prompt).toContain('사진 배경 지워줘');
    expect(prompt).toContain('none');
  });
});

describe('아끼기', () => {
  it('같은 물음은 한 번만 — 「없다」도 기억한다', () => {
    const memory = new RouteMemory();
    expect(memory.get('배경 지워줘').hit).toBe(false);
    memory.put('배경 지워줘', null);
    const again = memory.get('  배경  지워줘? ');
    expect(again.hit).toBe(true);
    expect(again.pick).toBeNull();
  });

  it('너무 자주 물으면 막는다', () => {
    const memory = new RouteMemory();
    const now = Date.now();
    expect(memory.allow('a', now)).toBe(true);
    expect(memory.allow('a', now + MIN_GAP_MS - 1)).toBe(false);
    expect(memory.allow('a', now + MIN_GAP_MS + 1)).toBe(true);
  });

  it('하루 상한이 있다', () => {
    const memory = new RouteMemory();
    let now = Date.now();
    for (let i = 0; i < DAILY_LIMIT + 5; i++) {
      memory.allow('b', now);
      now += MIN_GAP_MS + 1;
    }
    expect(memory.allow('b', now)).toBe(false);
  });

  it('사람마다 따로 센다', () => {
    const memory = new RouteMemory();
    const now = Date.now();
    memory.allow('a', now);
    expect(memory.allow('c', now)).toBe(true);
  });
});

describe('도구 목록', () => {
  it('못 받아 오면 빈 배열 — 이 기능만 조용히 없어진다', async () => {
    setCatalogForTest(null);
    const fake = (async () => ({ ok: false })) as unknown as typeof fetch;
    expect(await loadCatalog(Date.now(), fake)).toEqual([]);
  });

  it('한 번 받아 두면 다시 안 받는다', async () => {
    setCatalogForTest(null);
    let calls = 0;
    const fake = (async () => {
      calls++;
      return { ok: true, json: async () => ({ tools: { charcount: { lead: '글자수' } } }) };
    }) as unknown as typeof fetch;
    const now = Date.now();
    await loadCatalog(now, fake);
    await loadCatalog(now + 1000, fake);
    expect(calls).toBe(1);
  });

  it('바깥이 죽어도 지난 목록을 쓴다', async () => {
    setCatalogForTest([{ id: 'charcount', title: 'charcount', lead: '글자수' }], Date.now() - 10 * 3600e3);
    const dead = (async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    expect((await loadCatalog(Date.now(), dead)).length).toBe(1);
  });
});
