/**
 * 패스키 — **진짜 브라우저가 만든 것**으로 검사한다 (TASK-KL-191 축5).
 *
 * 지금까지의 패스키 시험은 우리가 노드에서 만든 자료로 우리 코드를 검사했다. 만드는 쪽과
 * 읽는 쪽이 같은 가정을 공유하면 **둘 다 틀려도 초록**이다 — 우리가 CBOR 해독부터 COSE→DER
 * 변환까지 직접 짰으니 그 위험이 그대로 있었다.
 *
 * 여기 쓰는 자료는 크롬의 가상 인증기(CDP `WebAuthn`)가 만든 것이다. 사람 손가락은 자동화할
 * 수 없지만, **자료의 모양은 진짜 기기와 같다** — 규격대로 크롬이 만든다.
 * 다시 뜨기: `cd apps/karmolab && URL=http://localhost:8813/... node scripts/gen-passkey-fixture.mjs`
 *
 * 이 검사가 이미 하나 잡았다: 우리 기본 rpId 는 `blog.mascari4615.com` 이라, 로컬(localhost)
 * 에서는 **어떤 패스키도 통과하지 못한다**. 배포해야만 확인되는 기능이었다는 뜻이고,
 * 그건 확인 루프가 없는 것과 같다.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import fixture from './__fixtures__/passkey-chrome.json';

type Passkey = typeof import('./karmolab-passkey');
let passkey: Passkey;

beforeAll(async () => {
  // 모듈이 읽는 시점에 정해지는 값이라, 불러오기 **전에** 바꿔야 한다.
  process.env.KARMOLAB_RP_ID = fixture.rpId;
  process.env.KARMOLAB_RP_ORIGINS = fixture.origin;
  passkey = await import('./karmolab-passkey');
});
afterAll(() => {
  delete process.env.KARMOLAB_RP_ID;
  delete process.env.KARMOLAB_RP_ORIGINS;
});

describe('진짜 브라우저가 만든 패스키 (KL-191 축5)', () => {
  it('떠 온 자료가 손으로 지어낸 것이 아니다 — 만든 자리와 방법이 적혀 있다', () => {
    expect(fixture.note).toContain('가상 인증기');
    expect(fixture.register.attestationObject.length).toBeGreaterThan(100);
    expect(fixture.assert.signature.length).toBeGreaterThan(60);
    // 파일이 실제로 스크립트가 쓰는 자리에 있다 (손으로 옮겨 둔 사본이 아니다)
    expect(fs.existsSync(path.join(__dirname, '__fixtures__/passkey-chrome.json'))).toBe(true);
  });

  it('등록 — 크롬이 만든 것을 우리가 읽어 담을 모양으로 돌려준다', () => {
    const stored = passkey.verifyRegistration({
      challenge: fixture.register.challenge,
      clientDataJSON: fixture.register.clientDataJSON,
      attestationObject: fixture.register.attestationObject,
      label: '검사 기기',
    });
    expect(stored.id).toBe(fixture.register.id);
    expect(stored.publicKey.length).toBeGreaterThan(40);
    expect(stored.label).toBe('검사 기기');
  });

  it('로그인 — 크롬이 만든 서명이 그 공개키로 맞는다', () => {
    const stored = passkey.verifyRegistration({
      challenge: fixture.register.challenge,
      clientDataJSON: fixture.register.clientDataJSON,
      attestationObject: fixture.register.attestationObject,
      label: '검사 기기',
    });
    const count = passkey.verifyAssertion({
      challenge: fixture.assert.challenge,
      clientDataJSON: fixture.assert.clientDataJSON,
      authenticatorData: fixture.assert.authenticatorData,
      signature: fixture.assert.signature,
      passkey: stored,
    });
    expect(count).toBeGreaterThanOrEqual(stored.signCount);
  });

  it('서명을 한 바이트만 건드려도 막힌다 — 통과가 요행이 아니라는 증거', () => {
    const stored = passkey.verifyRegistration({
      challenge: fixture.register.challenge,
      clientDataJSON: fixture.register.clientDataJSON,
      attestationObject: fixture.register.attestationObject,
      label: '검사 기기',
    });
    const raw = Buffer.from(fixture.assert.signature, 'base64url');
    raw[raw.length - 1] ^= 0x01;
    expect(() =>
      passkey.verifyAssertion({
        challenge: fixture.assert.challenge,
        clientDataJSON: fixture.assert.clientDataJSON,
        authenticatorData: fixture.assert.authenticatorData,
        signature: raw.toString('base64url'),
        passkey: stored,
      }),
    ).toThrow();
  });

  it('다른 도전값으로는 안 된다 — 훔친 답을 나중에 못 쓴다', () => {
    expect(() =>
      passkey.verifyRegistration({
        challenge: 'bm90LXRoZS1zYW1lLWNoYWxsZW5nZQ',
        clientDataJSON: fixture.register.clientDataJSON,
        attestationObject: fixture.register.attestationObject,
        label: 'x',
      }),
    ).toThrow();
  });

  it('로컬에서 만든 것은 **실서비스 도메인 설정으로는 안 통과한다** — 이 사실을 못 박아 둔다', async () => {
    /* 배포 도메인 기본값으로 다시 불러오면 같은 자료가 막혀야 한다. 막히는 것이 옳다:
     * rpId 가 다르면 다른 사이트의 열쇠다. 동시에 이것이 「로컬에서는 실서비스 설정으로
     * 패스키를 시험할 수 없다」는 뜻이라, 확인 루프는 rpId 를 바꿔서 돈다. */
    process.env.KARMOLAB_RP_ID = 'blog.mascari4615.com';
    /* 모듈을 **정말로 다시 읽어야** 한다 — 캐시된 것을 받으면 이 시험은 아무것도 안 본다
     * (주소에 물음표를 붙이는 수법은 번들러가 경고만 하고 캐시를 줄 수 있다). */
    vi.resetModules();
    const prod = await import('./karmolab-passkey');
    expect(prod.RP_ID).toBe('blog.mascari4615.com');
    expect(() =>
      prod.verifyRegistration({
        challenge: fixture.register.challenge,
        clientDataJSON: fixture.register.clientDataJSON,
        attestationObject: fixture.register.attestationObject,
        label: 'x',
      }),
    ).toThrow();
    process.env.KARMOLAB_RP_ID = fixture.rpId;
    vi.resetModules();
  });
});
