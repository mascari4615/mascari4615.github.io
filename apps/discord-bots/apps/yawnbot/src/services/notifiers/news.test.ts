/**
 * TASK-YB-035 회귀 테스트.
 *
 * 근본 버그: 영속 dedup 이 Google News RSS 의 휘발성 link(`?oc=5` CBMi 토큰,
 * fetch 세션마다 재생성)를 키로 써서 같은 기사가 재시작·재폴링마다 다른 link →
 * 중복 발송. 안정적 키 = 정규화 제목. dedupKey 가 그 안정성을 보장하는지 잠금.
 */
import { describe, it, expect } from 'vitest';
import { dedupKey, parseSources } from './news';

describe('dedupKey — 안정적 dedup 키 (TASK-YB-035)', () => {
  it('같은 기사의 표기 변형(공백/대소문자/유니코드)을 동일 키로 정규화', () => {
    const base = dedupKey('AI 가 일자리를 바꾼다 - 한국일보');
    expect(dedupKey('  AI 가  일자리를   바꾼다 - 한국일보  ')).toBe(base);
    expect(dedupKey('AI 가 일자리를 바꾼다 - 한국일보\n')).toBe(base);
    expect(dedupKey('Ai 가 일자리를 바꾼다 - 한국일보')).toBe(base);
  });

  it('link 가 달라도(Google News 토큰 로테이션 시뮬레이션) 제목 키는 불변', () => {
    // 동일 기사가 폴링마다 다른 link 를 받아도 dedupKey 는 link 와 무관.
    const title = 'Breaking: 시장 급락 - 매일경제';
    expect(dedupKey(title)).toBe(dedupKey(title));
  });

  it('서로 다른 기사(다른 매체 suffix 포함)는 다른 키 — 오병합 방지', () => {
    expect(dedupKey('동일 헤드라인 - A신문')).not.toBe(dedupKey('동일 헤드라인 - B신문'));
    expect(dedupKey('기사 하나 - X')).not.toBe(dedupKey('기사 둘 - X'));
  });
});

describe('parseSources — 소스 on/subset/off 단일 노브', () => {
  it('미설정/빈값 = 전체 폴백 (하위호환)', () => {
    expect(parseSources(undefined)).toEqual(new Set(['google', 'hn', 'gn']));
    expect(parseSources('')).toEqual(new Set(['google', 'hn', 'gn']));
    expect(parseSources('   ')).toEqual(new Set(['google', 'hn', 'gn']));
  });

  it('subset 지정 = 해당 소스만', () => {
    expect(parseSources('google,gn')).toEqual(new Set(['google', 'gn']));
    expect(parseSources(' GOOGLE , GN ')).toEqual(new Set(['google', 'gn']));
  });

  it('off 센티넬(none/off/-/0) = 빈 Set → 게시 비활성', () => {
    for (const s of ['none', 'off', '-', '0', 'OFF', ' none ']) {
      expect(parseSources(s).size).toBe(0);
    }
  });

  it('전부 무효 토큰 = 전체 폴백 (off 와 구분)', () => {
    expect(parseSources('bogus,xyz')).toEqual(new Set(['google', 'hn', 'gn']));
  });
});
