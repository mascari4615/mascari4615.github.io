/**
 * 패스키 검증 (TASK-KL-156 D7).
 *
 * 여기가 틀리면 **아무나 남의 계정으로 들어온다** — 화면에는 아무 표시도 안 난다.
 * 그래서 진짜 P-256 열쇠를 만들어 실제 서명으로 왕복을 돌리고, 막아야 할 것들을 하나씩 찌른다.
 */
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  RP_ID,
  bufToB64url,
  verifyRegistration,
  verifyAssertion,
  coseToDer,
  decodeCbor,
} from './karmolab-passkey';

/** CBOR 로 적는다 — 시험이 진짜 브라우저가 보내는 모양을 만들어야 의미가 있다. */
function cborBytes(buf: Buffer): Buffer {
  const head = Buffer.from([0x58, buf.length]);
  return buf.length < 24 ? Buffer.concat([Buffer.from([0x40 + buf.length]), buf]) : Buffer.concat([head, buf]);
}
function cborInt(n: number): Buffer {
  if (n >= 0 && n < 24) return Buffer.from([n]);
  if (n < 0 && n > -25) return Buffer.from([0x20 + (-1 - n)]);
  throw new Error('시험용 CBOR 범위 밖');
}
function cborText(s: string): Buffer {
  const b = Buffer.from(s, 'utf8');
  return Buffer.concat([Buffer.from([0x60 + b.length]), b]);
}
function cborMap(pairs: Array<[Buffer, Buffer]>): Buffer {
  return Buffer.concat([Buffer.from([0xa0 + pairs.length]), ...pairs.flatMap(([k, v]) => [k, v])]);
}

/** 진짜 P-256 열쇠 한 벌 + 그것을 담은 authData/attestationObject. */
function makeKey(signCount = 0) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const raw = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  const point = raw.subarray(raw.length - 65); // 0x04 || x || y
  const x = point.subarray(1, 33);
  const y = point.subarray(33, 65);
  const cose = cborMap([
    [cborInt(1), cborInt(2)],
    [cborInt(3), cborInt(-7)],
    [cborInt(-1), cborInt(1)],
    [cborInt(-2), cborBytes(x)],
    [cborInt(-3), cborBytes(y)],
  ]);
  const credentialId = crypto.randomBytes(16);
  const rpIdHash = crypto.createHash('sha256').update(RP_ID).digest();
  const flags = Buffer.from([0x41 | 0x40]); // UP + AT
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(signCount);
  const idLen = Buffer.alloc(2);
  idLen.writeUInt16BE(credentialId.length);
  const authData = Buffer.concat([rpIdHash, flags, counter, Buffer.alloc(16), idLen, credentialId, cose]);
  const attestation = cborMap([
    [cborText('fmt'), cborText('none')],
    [cborText('attStmt'), Buffer.from([0xa0])],
    [cborText('authData'), Buffer.concat([Buffer.from([0x59]), (() => { const b = Buffer.alloc(2); b.writeUInt16BE(authData.length); return b; })(), authData])],
  ]);
  return { privateKey, credentialId, attestationObject: bufToB64url(attestation) };
}

function clientData(type: string, challenge: string, origin = 'https://blog.mascari4615.com'): string {
  return bufToB64url(Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false })));
}

function assertionFor(privateKey: crypto.KeyObject, challenge: string, signCount: number, origin?: string) {
  const rpIdHash = crypto.createHash('sha256').update(RP_ID).digest();
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(signCount);
  const authData = Buffer.concat([rpIdHash, Buffer.from([0x01]), counter]);
  const cd = clientData('webauthn.get', challenge, origin);
  const hash = crypto.createHash('sha256').update(Buffer.from(cd.replace(/-/g, '+').replace(/_/g, '/'), 'base64')).digest();
  const signature = crypto.sign('sha256', Buffer.concat([authData, hash]), privateKey);
  return {
    clientDataJSON: cd,
    authenticatorData: bufToB64url(authData),
    signature: bufToB64url(signature),
  };
}

describe('패스키 (KL-156 D7)', () => {
  it('CBOR 은 우리가 쓰는 것만 읽는다', () => {
    const { value } = decodeCbor(cborMap([[cborText('a'), cborInt(7)]]));
    expect((value as Map<string, number>).get('a')).toBe(7);
  });

  it('등록 왕복 — 진짜 키로 만든 것을 담을 모양으로 돌려준다', () => {
    const key = makeKey();
    const stored = verifyRegistration({
      challenge: 'chal-1',
      clientDataJSON: clientData('webauthn.create', 'chal-1'),
      attestationObject: key.attestationObject,
      label: '시험 기기',
    });
    expect(stored.id).toBe(bufToB64url(key.credentialId));
    expect(stored.label).toBe('시험 기기');
    expect(stored.signCount).toBe(0);
  });

  it('도전값이 다르면 등록이 안 된다 (훔친 답을 나중에 못 쓰게)', () => {
    const key = makeKey();
    expect(() =>
      verifyRegistration({
        challenge: 'chal-real',
        clientDataJSON: clientData('webauthn.create', 'chal-other'),
        attestationObject: key.attestationObject,
        label: 'x',
      }),
    ).toThrow();
  });

  it('모르는 출처에서 온 것은 안 받는다', () => {
    const key = makeKey();
    expect(() =>
      verifyRegistration({
        challenge: 'c',
        clientDataJSON: clientData('webauthn.create', 'c', 'https://evil.example'),
        attestationObject: key.attestationObject,
        label: 'x',
      }),
    ).toThrow();
  });

  it('로그인 왕복 — 서명이 맞으면 새 사용 횟수를 준다', () => {
    const key = makeKey();
    const stored = verifyRegistration({
      challenge: 'c1',
      clientDataJSON: clientData('webauthn.create', 'c1'),
      attestationObject: key.attestationObject,
      label: 'x',
    });
    const parts = assertionFor(key.privateKey, 'c2', 5);
    const count = verifyAssertion({ challenge: 'c2', passkey: stored, ...parts });
    expect(count).toBe(5);
  });

  it('남의 열쇠로 서명한 것은 통과 못 한다', () => {
    const mine = makeKey();
    const theirs = makeKey();
    const stored = verifyRegistration({
      challenge: 'c1',
      clientDataJSON: clientData('webauthn.create', 'c1'),
      attestationObject: mine.attestationObject,
      label: 'x',
    });
    const parts = assertionFor(theirs.privateKey, 'c2', 1);
    expect(() => verifyAssertion({ challenge: 'c2', passkey: stored, ...parts })).toThrow();
  });

  it('사용 횟수가 뒤로 가면 막는다 — 열쇠가 복제됐다는 신호다', () => {
    const key = makeKey();
    const stored = verifyRegistration({
      challenge: 'c1',
      clientDataJSON: clientData('webauthn.create', 'c1'),
      attestationObject: key.attestationObject,
      label: 'x',
    });
    stored.signCount = 9;
    const parts = assertionFor(key.privateKey, 'c2', 3);
    expect(() => verifyAssertion({ challenge: 'c2', passkey: stored, ...parts })).toThrow();
  });

  it('ES256(P-256) 아닌 키는 안 받는다', () => {
    const cose = new Map<number, unknown>([
      [1, 2],
      [3, -257],
      [-2, Buffer.alloc(32)],
      [-3, Buffer.alloc(32)],
    ]);
    expect(() => coseToDer(cose as unknown as Map<unknown, unknown>)).toThrow();
  });
});
