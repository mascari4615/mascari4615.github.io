/**
 * 잠깐 쓰는 메일 곳간 — **주소를 알아도 못 읽나 · 제때 사라지나** (TASK-KL-339).
 *
 * 여기서 지키는 것은 사생활 셋이다. 셋 다 「오류 없이 조용히 틀리는」 종류라 검사로 못 박는다:
 *   ① 주소를 알아도 열쇠가 없으면 못 읽는다 (바깥 temp-mail 은 주소만 알면 열린다)
 *   ② 수명이 다하면 사라진다 (잊힌 편지함이 쌓이는 곳간은 유출 대기열이다)
 *   ③ HTML 은 **받는 자리에서** 글자로 눌린다 (곳간에 들어오지조차 않게)
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TTL_MS,
  MAX_LETTERS,
  MAX_TTL_MS,
  TempMailStore,
  makeName,
  plainOf,
  tidyFrom,
} from './temp-mail-store';

/** 시간을 손으로 돌린다 — 진짜로 10분을 기다릴 수는 없다. */
function at(start = 1_000_000) {
  let t = start;
  return { now: () => t, tick: (ms: number) => (t += ms) };
}

describe('편지함 열기', () => {
  it('주소와 열쇠를 준다', () => {
    const s = new TempMailStore();
    const box = s.open();
    expect(box.name.length).toBeGreaterThan(6);
    expect(box.token.length).toBeGreaterThan(20);
  });

  it('수명은 기본 10분, 아무리 길게 달라 해도 60분까지', () => {
    const clock = at();
    const s = new TempMailStore(clock.now);
    expect(s.open().expiresAt - clock.now()).toBe(DEFAULT_TTL_MS);
    expect(s.open(999 * 60 * 1000).expiresAt - clock.now()).toBe(MAX_TTL_MS);
    // 너무 짧게 달라 해도 1분은 준다 — 주소를 옮겨 적을 시간은 있어야 한다
    expect(s.open(1).expiresAt - clock.now()).toBe(60 * 1000);
  });

  it('이름은 헷갈리는 글자를 안 쓴다 — 손으로 옮겨 적는 물건이다', () => {
    for (let i = 0; i < 40; i++) expect(makeName()).not.toMatch(/[0o1li]/);
  });
});

describe('★ 주소를 알아도 못 읽는다', () => {
  it('열쇠가 맞아야 본다', () => {
    const s = new TempMailStore();
    const box = s.open();
    expect(s.read(box.name, box.token)).not.toBeNull();
  });

  it('열쇠가 틀리면 **없는 것과 같은 답** — 「그 주소는 있다」도 안 알려 준다', () => {
    const s = new TempMailStore();
    const box = s.open();
    expect(s.read(box.name, '아무거나')).toBeNull();
    expect(s.read(box.name, '')).toBeNull();
    expect(s.read('없는주소', box.token)).toBeNull();
  });

  it('열쇠가 없으면 버리지도 못한다', () => {
    const s = new TempMailStore();
    const box = s.open();
    expect(s.drop(box.name, '틀림')).toBe(false);
    expect(s.drop(box.name, box.token)).toBe(true);
    expect(s.read(box.name, box.token)).toBeNull();
  });

  it('밖으로 내주는 모양에 **열쇠가 안 실린다**', () => {
    const s = new TempMailStore();
    const box = s.open();
    const view = s.read(box.name, box.token)!;
    expect(JSON.stringify(view)).not.toContain(box.token);
  });
});

describe('편지 넣기', () => {
  it('넣으면 보인다', () => {
    const s = new TempMailStore();
    const box = s.open();
    expect(s.deliver(box.name, { from: 'a@b.com', subject: '확인 코드', text: '123456' })).toBe(true);
    expect(s.read(box.name, box.token)!.letters[0].text).toBe('123456');
  });

  it('대소문자가 달라도 같은 함이다 — 메일 주소는 그렇게 온다', () => {
    const s = new TempMailStore();
    const box = s.open();
    expect(s.deliver(box.name.toUpperCase(), { from: 'a', subject: 'b', text: 'c' })).toBe(true);
  });

  it('모르는 주소는 **조용히 버린다** — 오류로 만들면 로그가 남의 스팸으로 찬다', () => {
    const s = new TempMailStore();
    expect(s.deliver('없는함', { from: 'a', subject: 'b', text: 'c' })).toBe(false);
  });

  it('넘치면 오래된 것부터 밀린다 — 사람이 기다리는 건 방금 온 것이다', () => {
    const s = new TempMailStore();
    const box = s.open();
    for (let i = 0; i < MAX_LETTERS + 5; i++) s.deliver(box.name, { from: 'a', subject: String(i), text: String(i) });
    const letters = s.read(box.name, box.token)!.letters;
    expect(letters).toHaveLength(MAX_LETTERS);
    expect(letters[letters.length - 1].subject).toBe(String(MAX_LETTERS + 4));
  });

  it('아주 긴 편지는 **자른다**(버리지 않는다) — 앞부분은 대개 쓸모가 있다', () => {
    const s = new TempMailStore();
    const box = s.open();
    s.deliver(box.name, { from: 'a', subject: 'b', text: 'x'.repeat(999_999) });
    expect(s.read(box.name, box.token)!.letters[0].text.length).toBeLessThan(999_999);
  });
});

describe('★ 제때 사라진다', () => {
  it('수명이 지나면 못 읽는다', () => {
    const clock = at();
    const s = new TempMailStore(clock.now);
    const box = s.open();
    s.deliver(box.name, { from: 'a', subject: 'b', text: 'c' });
    clock.tick(DEFAULT_TTL_MS + 1);
    expect(s.read(box.name, box.token)).toBeNull();
    expect(s.size).toBe(0);
  });

  it('지난 함으로 온 편지는 안 들어간다', () => {
    const clock = at();
    const s = new TempMailStore(clock.now);
    const box = s.open();
    clock.tick(DEFAULT_TTL_MS + 1);
    expect(s.deliver(box.name, { from: 'a', subject: 'b', text: 'c' })).toBe(false);
  });

  it('아직 안 지난 함은 안 치운다', () => {
    const clock = at();
    const s = new TempMailStore(clock.now);
    const box = s.open();
    clock.tick(DEFAULT_TTL_MS - 1000);
    expect(s.read(box.name, box.token)).not.toBeNull();
  });
});

describe('★ HTML 은 받는 자리에서 글자로 눌린다', () => {
  it('태그가 사라진다', () => {
    expect(plainOf('<p>안녕<br>코드 <b>123456</b></p>')).toBe('안녕\n코드 123456');
  });

  it('스크립트·스타일은 통째로 빠진다 — 남이 보낸 코드가 우리 화면에 오면 안 된다', () => {
    const out = plainOf('<script>나쁜짓()</script><style>p{}</style><p>안녕</p>');
    expect(out).not.toContain('나쁜짓');
    expect(out).not.toContain('p{}');
    expect(out).toContain('안녕');
  });

  it('꺾쇠 기호는 글자로 돌아온다', () => {
    expect(plainOf('a &lt;b&gt; c &amp; d')).toBe('a <b> c & d');
  });

  it('보낸이는 꺾쇠 안 주소만 남긴다', () => {
    expect(tidyFrom('욘 <yon@example.com>')).toBe('yon@example.com');
    expect(tidyFrom('yon@example.com')).toBe('yon@example.com');
    expect(tidyFrom('')).toBe('');
  });
});
