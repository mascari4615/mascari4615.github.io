/**
 * 패스키(WebAuthn) — 두 번째 문 (TASK-KL-156 D7).
 *
 * 왜: 지금 계정에 들어오는 문은 디스코드 하나뿐이고, 복구 코드는 종이 한 장이라 잃으면 끝이다.
 * 패스키는 기기(지문·얼굴·PIN)가 열쇠라 **외부 등록도 secret 도 필요 없다** — 도메인만 있으면
 * 된다. 2026 기준 주요 브라우저가 전부 지원한다.
 *
 * 왜 라이브러리를 안 쓰나: 여기서 필요한 것은 ES256 서명 검증 하나와 CBOR 의 **아주 일부**다.
 * Node 의 `crypto` 가 검증을 다 하고, 우리가 읽어야 할 CBOR 는 지도(map)·바이트열·정수뿐이라
 * 100줄이면 끝난다. 이 한 줄을 위해 의존성 나무를 들이지 않는다.
 *
 * 무엇을 확인하나 (하나라도 빠지면 검증이 아니다):
 *  ① `type` 이 우리가 기대한 단계인가 (`webauthn.create` / `webauthn.get`)
 *  ② `challenge` 가 **우리가 방금 낸 것**인가 (한 번 쓰면 버린다)
 *  ③ `origin` 이 우리 사이트인가
 *  ④ `rpIdHash` 가 우리 도메인의 해시인가
 *  ⑤ 서명이 그 공개키로 맞는가
 *  ⑥ 사용 횟수(signCount)가 뒤로 가지 않았나 — 복제된 열쇠를 알아보는 유일한 신호
 */
import crypto from 'crypto';

/** 우리 도메인. 패스키는 이 이름에 묶인다 — 여기가 바뀌면 기존 패스키는 안 열린다. */
/**
 * 우리 도메인. 브라우저는 **이 값과 주소가 안 맞으면 패스키를 아예 안 만들어 준다.**
 *
 * 그래서 로컬에서 확인하려면 `KARMOLAB_RP_ID=localhost` 로 띄워야 한다 (TASK-KL-191 축5).
 * 기본값 그대로면 로컬에서는 **어떤 패스키도 통과하지 못한다** — 배포해야만 확인되는
 * 기능이 되고, 그건 확인 루프가 없는 것과 같다.
 * IP 주소(`127.0.0.1`)는 브라우저가 도메인으로 안 쳐 준다 — 반드시 `localhost` 다.
 */
export const RP_ID = process.env.KARMOLAB_RP_ID?.trim() || 'blog.mascari4615.com';
export const RP_NAME = 'KarmoLab';

/** 패스키를 만들거나 쓸 수 있는 출처. 그 외에서 온 것은 우리 것이 아니다. */
const ALLOWED_ORIGINS = new Set(
  (process.env.KARMOLAB_RP_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? []).concat([
    'https://blog.mascari4615.com',
    // 화면을 고치면서 시험할 자리. 배포해야만 시험된다면 확인 루프가 죽는다.
    'http://127.0.0.1:8813',
    'http://localhost:8813',
  ]),
);

/** 도전값이 살아 있는 시간. 짧아야 한다 — 오래 살아 있으면 훔쳐서 나중에 쓸 수 있다. */
export const CHALLENGE_TTL_MS = 3 * 60 * 1000;

export interface StoredPasskey {
  /** 브라우저가 준 자격증명 id (base64url) */
  id: string;
  /** COSE 공개키에서 뽑은 DER SubjectPublicKeyInfo (base64) */
  publicKey: string;
  /** 사용 횟수 — 뒤로 가면 복제 신호다 */
  signCount: number;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/* ── CBOR 에서 우리가 읽어야 할 것만 ───────────────────────────────── */

interface CborCursor {
  buf: Buffer;
  at: number;
}

function readHead(c: CborCursor): { major: number; value: number } {
  const first = c.buf[c.at];
  c.at += 1;
  const major = first >> 5;
  const small = first & 0x1f;
  if (small < 24) return { major, value: small };
  if (small === 24) {
    const value = c.buf[c.at];
    c.at += 1;
    return { major, value };
  }
  if (small === 25) {
    const value = c.buf.readUInt16BE(c.at);
    c.at += 2;
    return { major, value };
  }
  if (small === 26) {
    const value = c.buf.readUInt32BE(c.at);
    c.at += 4;
    return { major, value };
  }
  throw new Error('CBOR: 우리가 안 쓰는 길이 형식');
}

/** 지도·바이트열·글자·정수만 읽는다. 그 밖의 것이 오면 **조용히 넘기지 않고 멈춘다**. */
function readValue(c: CborCursor): unknown {
  const { major, value } = readHead(c);
  switch (major) {
    case 0:
      return value;
    case 1:
      return -1 - value;
    case 2: {
      const out = c.buf.subarray(c.at, c.at + value);
      c.at += value;
      return out;
    }
    case 3: {
      const out = c.buf.subarray(c.at, c.at + value).toString('utf8');
      c.at += value;
      return out;
    }
    case 4: {
      const arr: unknown[] = [];
      for (let i = 0; i < value; i += 1) arr.push(readValue(c));
      return arr;
    }
    case 5: {
      const map = new Map<unknown, unknown>();
      for (let i = 0; i < value; i += 1) {
        const key = readValue(c);
        map.set(key, readValue(c));
      }
      return map;
    }
    default:
      throw new Error(`CBOR: 모르는 형식 ${major}`);
  }
}

export function decodeCbor(buf: Buffer): { value: unknown; rest: number } {
  const cursor: CborCursor = { buf, at: 0 };
  const value = readValue(cursor);
  return { value, rest: buf.length - cursor.at };
}

/* ── COSE 공개키 → Node 가 아는 형식 ─────────────────────────────── */

/**
 * COSE(EC2/P-256) 를 DER SubjectPublicKeyInfo 로 옮긴다.
 * P-256 만 받는다 — 브라우저가 기본으로 만드는 것이고, 종류를 늘리면 검증할 것도 늘어난다.
 */
export function coseToDer(cose: Map<unknown, unknown>): Buffer {
  const kty = cose.get(1);
  const alg = cose.get(3);
  if (kty !== 2) throw new Error('패스키: EC2 키만 받는다');
  if (alg !== -7) throw new Error('패스키: ES256 만 받는다');
  const x = cose.get(-2) as Buffer;
  const y = cose.get(-3) as Buffer;
  if (!Buffer.isBuffer(x) || !Buffer.isBuffer(y) || x.length !== 32 || y.length !== 32) {
    throw new Error('패스키: 좌표가 이상하다');
  }
  // SPKI 머리 = P-256 공개키라는 표시. 뒤에 0x04||x||y (압축 안 한 점) 를 붙인다.
  const prefix = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex');
  return Buffer.concat([prefix, Buffer.from([0x04]), x, y]);
}

/* ── authenticatorData ────────────────────────────────────────────── */

export interface AuthData {
  rpIdHash: Buffer;
  flags: number;
  signCount: number;
  credentialId: Buffer | null;
  publicKeyDer: Buffer | null;
}

export function parseAuthData(buf: Buffer): AuthData {
  if (buf.length < 37) throw new Error('패스키: authData 가 너무 짧다');
  const rpIdHash = buf.subarray(0, 32);
  const flags = buf[32];
  const signCount = buf.readUInt32BE(33);
  if ((flags & 0x40) === 0) {
    return { rpIdHash, flags, signCount, credentialId: null, publicKeyDer: null };
  }
  // AAGUID(16) 다음에 자격증명 id 길이(2) 가 온다.
  const idLen = buf.readUInt16BE(53);
  const credentialId = buf.subarray(55, 55 + idLen);
  const { value } = decodeCbor(buf.subarray(55 + idLen));
  const publicKeyDer = coseToDer(value as Map<unknown, unknown>);
  return { rpIdHash, flags, signCount, credentialId, publicKeyDer };
}

/* ── 검증 ─────────────────────────────────────────────────────────── */

function b64urlToBuf(value: string): Buffer {
  return Buffer.from(String(value).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export function bufToB64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** `clientDataJSON` 이 우리가 낸 도전에 대한 답이 맞나. */
export function checkClientData(
  clientDataJSON: string,
  expected: { type: 'webauthn.create' | 'webauthn.get'; challenge: string },
): void {
  const data = JSON.parse(b64urlToBuf(clientDataJSON).toString('utf8')) as {
    type?: string;
    challenge?: string;
    origin?: string;
  };
  if (data.type !== expected.type) throw new Error('패스키: 단계가 다르다');
  if (data.challenge !== expected.challenge) throw new Error('패스키: 도전값이 다르다');
  if (!data.origin || !ALLOWED_ORIGINS.has(data.origin)) throw new Error('패스키: 모르는 출처');
}

function checkRpIdHash(authData: AuthData): void {
  const expected = crypto.createHash('sha256').update(RP_ID).digest();
  if (!authData.rpIdHash.equals(expected)) throw new Error('패스키: 다른 도메인의 것');
  // 사용자가 실제로 기기를 만졌나 (UP). 안 만진 서명은 사람의 뜻이 아니다.
  if ((authData.flags & 0x01) === 0) throw new Error('패스키: 사람 확인이 없다');
}

/** 등록 — 새 패스키 하나를 만들어 저장할 모양으로 돌려준다. */
export function verifyRegistration(input: {
  challenge: string;
  clientDataJSON: string;
  attestationObject: string;
  label: string;
  now?: Date;
}): StoredPasskey {
  checkClientData(input.clientDataJSON, { type: 'webauthn.create', challenge: input.challenge });
  const { value } = decodeCbor(b64urlToBuf(input.attestationObject));
  const attestation = value as Map<string, unknown>;
  const authData = parseAuthData(attestation.get('authData') as Buffer);
  checkRpIdHash(authData);
  if (!authData.credentialId || !authData.publicKeyDer) throw new Error('패스키: 키가 안 들어 있다');

  const at = (input.now ?? new Date()).toISOString();
  return {
    id: bufToB64url(authData.credentialId),
    publicKey: authData.publicKeyDer.toString('base64'),
    signCount: authData.signCount,
    label: String(input.label || '패스키').slice(0, 24),
    createdAt: at,
    lastUsedAt: null,
  };
}

/**
 * 로그인 — 서명이 그 공개키로 맞나.
 * @returns 새 사용 횟수 (저장할 값)
 */
export function verifyAssertion(input: {
  challenge: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
  passkey: StoredPasskey;
}): number {
  checkClientData(input.clientDataJSON, { type: 'webauthn.get', challenge: input.challenge });
  const authDataBuf = b64urlToBuf(input.authenticatorData);
  const authData = parseAuthData(authDataBuf);
  checkRpIdHash(authData);

  const clientHash = crypto.createHash('sha256').update(b64urlToBuf(input.clientDataJSON)).digest();
  const signed = Buffer.concat([authDataBuf, clientHash]);
  const key = crypto.createPublicKey({
    key: Buffer.from(input.passkey.publicKey, 'base64'),
    format: 'der',
    type: 'spki',
  });
  const ok = crypto.verify('sha256', signed, key, b64urlToBuf(input.signature));
  if (!ok) throw new Error('패스키: 서명이 안 맞는다');

  /* 사용 횟수는 뒤로 가지 않는다. 뒤로 갔다면 **열쇠가 복제됐다는 신호**다 —
   * 둘 다 0 인 경우(횟수를 안 세는 기기)는 정상이라 그때만 통과시킨다. */
  if (authData.signCount !== 0 || input.passkey.signCount !== 0) {
    if (authData.signCount <= input.passkey.signCount) throw new Error('패스키: 사용 횟수가 뒤로 갔다');
  }
  return authData.signCount;
}
