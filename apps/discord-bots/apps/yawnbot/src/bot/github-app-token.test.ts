// github-app-token 순수 코어 검증 (HTTP 무관). KAR-018-Y.
import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import { buildAppJwt, isTokenFresh } from './github-app-token';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;

describe('buildAppJwt (순수·결정적 구조)', () => {
  it('header.payload.sig 3분절 + RS256 + iss/iat/exp', () => {
    const now = Date.parse('2026-05-18T00:00:00Z');
    const jwt = buildAppJwt('12345', pem, now);
    const parts = jwt.split('.');
    expect(parts).toHaveLength(3);
    const dec = (s: string) =>
      JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    expect(dec(parts[0])).toEqual({ alg: 'RS256', typ: 'JWT' });
    const p = dec(parts[1]);
    expect(p.iss).toBe('12345');
    const iat = Math.floor(now / 1000) - 60;
    expect(p.iat).toBe(iat);
    expect(p.exp).toBe(iat + 9 * 60); // <10분 한도
    expect(parts[2].length).toBeGreaterThan(40); // 서명 존재
  });

  it('잘못된 키 = throw (조용한 빈 토큰 X)', () => {
    expect(() => buildAppJwt('1', 'not-a-pem')).toThrow();
  });
});

describe('isTokenFresh (순수)', () => {
  const now = 1_000_000_000_000;
  it('만료 5분 초과 남음 = fresh', () => {
    expect(isTokenFresh({ token: 't', expMs: now + 6 * 60_000 }, now)).toBe(true);
  });
  it('만료 5분 이내 = stale(재발급)', () => {
    expect(isTokenFresh({ token: 't', expMs: now + 4 * 60_000 }, now)).toBe(false);
    expect(isTokenFresh({ token: 't', expMs: now - 1 }, now)).toBe(false);
  });
  it('null = stale', () => {
    expect(isTokenFresh(null, now)).toBe(false);
  });
});
