/**
 * 넣는 통로가 사람이 실제로 쓰는 모양을 받는지 (TASK-KAR-233).
 *
 * 세 달 동안 이 통로로 들어온 메모가 0건이었다. 콜론 뒤 공백을 강제하고
 * 있었는데, 붙여 쓰는 게 사람의 기본값이다.
 */
import { describe, expect, it } from 'vitest';
import { isBrainCapture } from './brain-capture';

describe('isBrainCapture', () => {
  it('붙여 쓴 것도 받는다', () => {
    expect(isBrainCapture('뇌:이거 기억해')).toBe(true);
    expect(isBrainCapture('뇌：이거 기억해')).toBe(true);
  });

  it('띄어 쓴 것도 그대로 받는다', () => {
    expect(isBrainCapture('뇌: 이거 기억해')).toBe(true);
    expect(isBrainCapture('뇌 : 이거 기억해')).toBe(true);
    expect(isBrainCapture('뇌 이거 기억해')).toBe(true);
  });

  it('링크만 던져도 받는다', () => {
    expect(isBrainCapture('뇌:https://example.com')).toBe(true);
  });

  it('뇌로 시작하는 보통 말은 안 걸린다', () => {
    expect(isBrainCapture('뇌졸중 증상이 뭐야')).toBe(false);
    expect(isBrainCapture('뇌가 아프다')).toBe(false);
    expect(isBrainCapture('내 뇌: 이상함')).toBe(false);
  });
});
