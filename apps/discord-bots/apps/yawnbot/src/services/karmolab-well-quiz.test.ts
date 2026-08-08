/**
 * TASK-KL-190 ③ — 우물에서 뽑은 오늘의 문제 시험.
 *
 * 자동 생성 문제의 사고는 늘 같은 자리에서 난다: 정답이 늘 첫 칸이거나 · 새로고침하면
 * 문제가 바뀌거나(틀리면 다시 뽑으면 그만) · 1등과 2등 차이가 0.1 이라 운이거나 ·
 * 정답 글자가 응답에 그대로 실려 소스만 열면 보이거나.
 */
import { describe, it, expect } from 'vitest';
import { quizFor, hashAnswer, normalize } from './karmolab-well-quiz';
import type { WellPack } from './karmolab-wells';

const pack = (n = 20): WellPack => ({
  title: '표',
  emoji: '🔥',
  fields: [
    { key: 'ccu', label: '접속자', kind: 'number', unit: '명' },
    { key: 'dev', label: '만든 곳', kind: 'category' },
  ],
  items: Array.from({ length: n }, (_, i) => ({ name: `게임 ${i}`, img: 'x', ccu: (i + 1) * 100, dev: '만든곳' })),
  fetchedAt: '',
  stale: false,
  well: 'steam-hot',
});

describe('정답 숨기기', () => {
  it('대조는 소문자·공백·쉼표를 지우고 한다 — 기존 「오늘의 문제」와 같은 규약', () => {
    expect(normalize(' Counter, Strike ')).toBe('counterstrike');
    expect(hashAnswer('Counter, Strike')).toBe(hashAnswer('counterstrike'));
  });

  it('정답 글자가 응답에 안 실린다 — 지문만', () => {
    const quiz = quizFor(pack(), '2026-08-08')!;
    expect(quiz.answerHash).toHaveLength(16);
    // 고를 것 안에는 정답이 있어야 한다(그건 고르라고 주는 것이다)
    expect(quiz.choices.some((c) => hashAnswer(c) === quiz.answerHash)).toBe(true);
  });
});

describe('오늘의 문제', () => {
  it('같은 날이면 같은 문제 — 새로고침해서 다시 뽑을 수 없다', () => {
    const a = quizFor(pack(), '2026-08-08')!;
    const b = quizFor(pack(), '2026-08-08')!;
    expect(b.question).toBe(a.question);
    expect(b.choices).toEqual(a.choices);
    expect(b.answerHash).toBe(a.answerHash);
  });

  it('날이 바뀌면 대체로 바뀐다', () => {
    const days = Array.from({ length: 20 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`);
    const seen = new Set(days.map((d) => quizFor(pack(), d)!.answerHash));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('우물이 다르면 뽑는 차례도 다르다 — 다섯 우물이 매일 같은 문제를 내면 안 된다', () => {
    /* 표가 똑같으면 「가장 많은 것」의 답도 똑같은 게 맞다(그게 사실이니까).
     * 그러니 답이 아니라 **뽑는 차례**가 갈리는지를 본다 — 우물 이름이 씨앗에 들어가는가. */
    let differed = 0;
    for (let i = 1; i <= 20; i += 1) {
      const day = `2026-11-${String(i).padStart(2, '0')}`;
      const a = quizFor(pack(), day)!;
      const b = quizFor({ ...pack(), well: 'anime-top' }, day)!;
      if (a.question !== b.question || a.choices.join() !== b.choices.join()) differed += 1;
    }
    expect(differed).toBeGreaterThan(10);
  });

  it('고를 것은 넷, 겹치지 않는다', () => {
    for (const day of ['2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11']) {
      const quiz = quizFor(pack(), day)!;
      expect(quiz.choices).toHaveLength(4);
      expect(new Set(quiz.choices).size).toBe(4);
    }
  });

  it('정답이 늘 첫 칸에 있지 않다 — 그러면 아무도 안 읽고 첫 칸을 누른다', () => {
    const spots = new Set<number>();
    for (let i = 1; i <= 30; i += 1) {
      const day = `2026-09-${String(i).padStart(2, '0')}`;
      const quiz = quizFor(pack(), day)!;
      spots.add(quiz.choices.findIndex((c) => hashAnswer(c) === quiz.answerHash));
    }
    expect(spots.size).toBeGreaterThan(1);
  });

  it('헷갈릴 것은 정답 바로 옆에서 안 뽑는다 — 1등과 2등 차이 0.1 은 실력이 아니라 운이다', () => {
    // 「가장 많은 것」 문제면 2등이 보기로 나오면 안 된다 (풀 자체가 아래 3분의 2)
    for (let i = 1; i <= 20; i += 1) {
      const quiz = quizFor(pack(30), `2026-10-${String(i).padStart(2, '0')}`)!;
      if (!quiz.question.includes('가장 많은')) continue;
      expect(quiz.choices).not.toContain('게임 28'); // 2등 (0-based 29 가 1등)
    }
  });

  it('푼 뒤에 왜 그게 답인지 말한다 — 숫자까지', () => {
    const quiz = quizFor(pack(), '2026-08-08')!;
    expect(quiz.because).toMatch(/접속자/);
    expect(quiz.because).toMatch(/명/);
  });
});

describe('못 만드는 표', () => {
  it('숫자 칸이 없으면 안 만든다 — 억지로 만들면 빈칸 문제가 나온다', () => {
    const noNumbers: WellPack = {
      ...pack(),
      fields: [{ key: 'area', label: '나라', kind: 'category' }],
      items: pack().items.map((i) => ({ name: i.name, area: 'Korean' })),
    };
    expect(quizFor(noNumbers, '2026-08-08')).toBeNull();
  });

  it('항목이 여덟도 안 되면 안 만든다 — 보기 넷이 표의 절반이 된다', () => {
    expect(quizFor(pack(6), '2026-08-08')).toBeNull();
  });
});
