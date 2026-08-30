/**
 * 누구를 세고 누구를 막는가 (change.identity-one).
 *
 * 두 키가 **서로 다른 것을 재는지**가 이 시험의 전부다. 하나로 합치면 반드시 한쪽이 틀린다:
 * 기기로 막으면 지우고 다시 오면 그만이고, IP 로 세면 같은 카페의 두 사람이 한 명이 된다.
 */
import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import { DEVICE_HEADER, identityOf, normalizeDeviceId } from './karmolab-identity';

function reqOf(headers: Record<string, string>, ip = '1.2.3.4'): Request {
  return { headers, socket: { remoteAddress: ip } } as unknown as Request;
}

function resSpy(): { res: Response; cookies: string[] } {
  const cookies: string[] = [];
  const res = { append: (_name: string, value: string) => cookies.push(value) } as unknown as Response;
  return { res, cookies };
}

const DEVICE = 'a1b2c3d4e5f60718293a4b5c';

describe('identityOf', () => {
  it('같은 기기면 IP 가 바뀌어도 같은 사람이다', () => {
    const a = identityOf(reqOf({ [DEVICE_HEADER]: DEVICE, 'user-agent': 'chrome' }, '1.1.1.1'));
    const b = identityOf(reqOf({ [DEVICE_HEADER]: DEVICE, 'user-agent': 'chrome' }, '9.9.9.9'));
    expect(a.personKey).toBe(b.personKey);
  });

  it('같은 IP 라도 기기가 다르면 다른 사람이다. 같은 카페의 두 사람', () => {
    const a = identityOf(reqOf({ [DEVICE_HEADER]: DEVICE, 'user-agent': 'chrome' }));
    const b = identityOf(reqOf({ [DEVICE_HEADER]: 'ffffffffffffffffffffffff', 'user-agent': 'chrome' }));
    expect(a.personKey).not.toBe(b.personKey);
  });

  it('상한을 거는 키는 언제나 IP. 기기가 달라도 같다', () => {
    const a = identityOf(reqOf({ [DEVICE_HEADER]: DEVICE }));
    const b = identityOf(reqOf({ [DEVICE_HEADER]: 'ffffffffffffffffffffffff' }));
    expect(a.abuseKey).toBe(b.abuseKey);
    expect(a.abuseKey).not.toBe(a.personKey);
  });

  it('쿠키로 와도 헤더와 같은 사람이다', () => {
    const head = identityOf(reqOf({ [DEVICE_HEADER]: DEVICE }));
    const cookie = identityOf(reqOf({ cookie: `kl_device=${DEVICE}; other=1` }));
    expect(cookie.personKey).toBe(head.personKey);
  });

  it('기기 id 가 없으면 옛 방식(IP+UA)으로 떨어진다. 쿠키를 막은 사람도 같이 쓴다', () => {
    const a = identityOf(reqOf({ 'user-agent': 'chrome' }));
    const b = identityOf(reqOf({ 'user-agent': 'chrome' }));
    const c = identityOf(reqOf({ 'user-agent': 'firefox' }));
    expect(a.deviceId).toBe(null);
    expect(a.personKey).toBe(b.personKey);
    expect(a.personKey).not.toBe(c.personKey);
  });

  it('없으면 심는다. 답을 줄 자리가 있을 때만', () => {
    const { res, cookies } = resSpy();
    const made = identityOf(reqOf({}), res);
    expect(made.deviceId).toMatch(/^[a-f0-9]{24}$/);
    expect(cookies[0]).toContain('kl_device=');
    expect(cookies[0]).toContain('SameSite=None');
    // 흐르는 연결처럼 답을 못 고치는 자리에서는 읽기만 한다
    expect(identityOf(reqOf({})).deviceId).toBe(null);
  });

  it('한 요청 안에서는 답이 안 바뀐다. 심은 그 요청도 새 id 로 센다', () => {
    const { res } = resSpy();
    const req = reqOf({ 'user-agent': 'chrome' });
    const first = identityOf(req, res);
    const again = identityOf(req);
    expect(again.personKey).toBe(first.personKey);
    expect(again.deviceId).toBe(first.deviceId);
  });

  it('남이 적어 보낸 아무 글자는 기기가 아니다', () => {
    expect(normalizeDeviceId('짧다')).toBe(null);
    expect(normalizeDeviceId('../../etc/passwd')).toBe(null);
    expect(normalizeDeviceId('A'.repeat(64))).toBe(null);
    expect(normalizeDeviceId(DEVICE)).toBe(DEVICE);
  });
});
