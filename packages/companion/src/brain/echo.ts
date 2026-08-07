import type { Brain, ThinkInput } from '../types';

/**
 * 가짜 두뇌 — LLM 없이 방금 들은 걸 그대로 돌려준다.
 *
 * 쓸모: ① API 키·네트워크 없이 코어가 도는지 확인 ② 단위 테스트 ③ 「두뇌를 갈아끼워도
 * 코어가 안 바뀐다」는 명제의 대조군.
 */
export const echoBrain: Brain = {
  name: 'echo',
  async think(input: ThinkInput): Promise<string> {
    return `(echo) ${input.sensation.text}`;
  },
};

/** 항상 침묵하는 두뇌 — 침묵 경로 테스트용. */
export const silentBrain: Brain = {
  name: 'silent',
  async think(): Promise<null> {
    return null;
  },
};
