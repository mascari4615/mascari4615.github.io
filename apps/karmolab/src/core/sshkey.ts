/**
 * SSH 열쇠 줄을 읽고, 지문을 내고, PEM 을 OpenSSH 줄로 (TASK-KL-316 / 24)
 *
 * `authorized_keys` 는 **한 줄이 곧 출입증**인데, 눈으로는 어느 줄이 누구 것인지 안 보인다.
 * 서버에서 지우려면 지문(`SHA256:…`)이 필요하고, 그 지문은 보통 서버에 들어가야 볼 수 있다.
 * 여기서는 줄만 붙여넣으면 종류·길이·주석·지문을 낸다 — **열쇠가 브라우저를 안 벗어난다.**
 *
 * 만드는 쪽은 **안 만든다**: 열쇠쌍은 이미 「암호화 도구」의 열쇠 탭이 WebCrypto 로 만든다.
 * 대신 그 PEM(SPKI)을 **OpenSSH 한 줄로 바꿔 준다** — 사람이 실제로 막히는 자리가 거기다.
 *
 * 해시는 밖에서 받는다(`deps.sha256`) — 알맹이는 브라우저 것을 직접 못 쓴다(`core` 규약).
 */
import type { ToolRunner, ToolSpec } from './types';
import { bytesToBase64, base64ToBytes, parseDer, readPem, type Asn1 } from './pem';

export const spec: ToolSpec = {
  id: 'sshkey',
  ops: {
    read: {
      desc: 'Read authorized_keys lines: key type, size, comment and options (fingerprints need a hash backend).',
      in: { text: 'string' },
      out: 'string'
    },
    convert: {
      desc: 'Turn a PEM public key (SPKI) into an OpenSSH one-line public key.',
      in: { pem: 'string', comment: 'string?' },
      out: 'string'
    }
  }
};

export interface Entry {
  /** `command="…",no-pty` 같은 앞머리 */
  options?: string;
  type: string;
  base64: string;
  comment?: string;
  /** 열쇠 길이 (알 수 있으면) */
  bits?: number;
  /** 줄이 이상하면 왜 이상한지 */
  problem?: string;
}

const KNOWN = ['ssh-rsa', 'ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-dss', 'sk-ssh-ed25519@openssh.com'];

/** SSH 선 형식: 4바이트 길이 + 값, 되풀이. */
export function readFields(blob: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  let at = 0;
  while (at + 4 <= blob.length) {
    const len = ((blob[at] << 24) | (blob[at + 1] << 16) | (blob[at + 2] << 8) | blob[at + 3]) >>> 0;
    at += 4;
    if (len > blob.length - at) throw new Error('열쇠 속이 잘렸습니다');
    out.push(blob.slice(at, at + len));
    at += len;
  }
  return out;
}

function writeFields(parts: Uint8Array[]): Uint8Array {
  let size = 0;
  for (const p of parts) size += 4 + p.length;
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out[at++] = (p.length >>> 24) & 0xff;
    out[at++] = (p.length >>> 16) & 0xff;
    out[at++] = (p.length >>> 8) & 0xff;
    out[at++] = p.length & 0xff;
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** 열쇠 크기 — RSA 는 계수(modulus) 비트, ed25519 는 늘 256. */
export function bitsOf(type: string, blob: Uint8Array): number | undefined {
  try {
    const fields = readFields(blob);
    if (type === 'ssh-rsa' && fields.length >= 3) {
      let n = fields[2];
      while (n.length > 0 && n[0] === 0) n = n.slice(1);
      return n.length * 8;
    }
    if (type === 'ssh-ed25519') return 256;
    const curve = /nistp(\d+)/.exec(type);
    if (curve !== null) return Number(curve[1]);
    return undefined;
  } catch {
    return undefined;
  }
}

/** `authorized_keys` 한 뭉치. **이상한 줄도 버리지 않는다** — 왜 이상한지 적어서 돌려준다. */
export function parseAuthorized(text: string): Entry[] {
  const out: Entry[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;

    /* 앞에 옵션이 붙을 수 있다 — 종류 낱말이 나올 때까지가 옵션이다. */
    let rest = line;
    let options: string | undefined;
    const first = line.split(/\s+/)[0];
    if (!KNOWN.includes(first) && !first.startsWith('ssh-') && !first.startsWith('ecdsa-')) {
      const at = line.search(/\s(ssh-|ecdsa-|sk-)/);
      if (at < 0) {
        out.push({ type: '?', base64: '', problem: 'noType' });
        continue;
      }
      options = line.slice(0, at).trim();
      rest = line.slice(at).trim();
    }

    const parts = rest.split(/\s+/);
    const type = parts[0];
    const base64 = parts[1] ?? '';
    const comment = parts.slice(2).join(' ');
    const entry: Entry = { options, type, base64, comment: comment === '' ? undefined : comment };
    if (base64 === '') {
      entry.problem = 'noKey';
      out.push(entry);
      continue;
    }
    /* base64 가 아닌 글자가 섞였으면 **그것부터** 말한다 — 조용히 걸러 읽으면
       「종류가 안 맞는다」 같은 엉뚱한 이유가 나온다(실측). */
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      entry.problem = 'badBase64';
      out.push(entry);
      continue;
    }
    try {
      const blob = base64ToBytes(base64);
      const fields = readFields(blob);
      const declared = new TextDecoder().decode(fields[0] ?? new Uint8Array());
      /* 줄에 적힌 종류와 **속에 적힌 종류**가 다르면 그건 붙여넣다 섞인 줄이다. */
      if (declared !== type) entry.problem = 'typeMismatch';
      entry.bits = bitsOf(type, blob);
    } catch {
      entry.problem = 'badBase64';
    }
    out.push(entry);
  }
  return out;
}

/** 지문은 **열쇠 덩이(base64 푼 것)의 SHA-256** 을 base64 로 (끝의 `=` 는 뗀다). */
export function fingerprint(base64: string, sha256: (bytes: Uint8Array) => Uint8Array): string {
  const digest = sha256(base64ToBytes(base64));
  return 'SHA256:' + bytesToBase64(digest).replace(/=+$/, '');
}

/* ── PEM(SPKI) → OpenSSH 한 줄 ─────────────────────────────────────── */

function bigIntBytes(node: Asn1): Uint8Array {
  return node.bytes;
}

/** 공개키 PEM 을 OpenSSH 줄로. RSA 와 Ed25519 만 — 나머지는 그렇다고 말한다. */
export function toOpenSsh(pemText: string, comment = ''): string {
  const blocks = readPem(pemText);
  if (blocks.length === 0) throw new Error('PEM 덩이를 못 찾았습니다');
  const tree = parseDer(blocks[0].der);
  const top = tree[0];
  if (top === undefined || top.children === undefined) throw new Error('공개키로 안 읽힙니다');

  const algorithm = top.children[0]?.children?.[0]?.value ?? '';
  const bitString = top.children[1];

  if (algorithm === 'RSA') {
    /* SPKI 의 BIT STRING 안에 `SEQUENCE { INTEGER n, INTEGER e }` 가 또 들어 있다. */
    const inner = bitString?.children?.[0];
    const parts = inner?.children ?? [];
    if (parts.length < 2) throw new Error('RSA 공개키 속을 못 읽었습니다');
    const n = bigIntBytes(parts[0]);
    const e = bigIntBytes(parts[1]);
    const type = new TextEncoder().encode('ssh-rsa');
    const blob = writeFields([type, e, n]);
    return ('ssh-rsa ' + bytesToBase64(blob) + (comment === '' ? '' : ' ' + comment)).trim();
  }

  if (algorithm === 'Ed25519') {
    const raw = bitString?.bytes.slice(1) ?? new Uint8Array();
    const type = new TextEncoder().encode('ssh-ed25519');
    return ('ssh-ed25519 ' + bytesToBase64(writeFields([type, raw])) + (comment === '' ? '' : ' ' + comment)).trim();
  }

  throw new Error('아직 RSA 와 Ed25519 만 바꿉니다 (' + (algorithm === '' ? '?' : algorithm) + ')');
}

export const run: ToolRunner = (op, args, deps) => {
  if (op === 'read') {
    const sha256 = deps?.sha256 as ((bytes: Uint8Array) => Uint8Array) | undefined;
    return parseAuthorized(String(args.text ?? ''))
      .map((e) => {
        const head = e.type + (e.bits === undefined ? '' : ' ' + e.bits) + (e.comment === undefined ? '' : '  ' + e.comment);
        const print = sha256 === undefined || e.base64 === '' ? '' : '  ' + fingerprint(e.base64, sha256);
        return head + print + (e.problem === undefined ? '' : '  ⚠ ' + e.problem);
      })
      .join('\n');
  }
  if (op === 'convert') return toOpenSsh(String(args.pem ?? ''), String(args.comment ?? ''));
  throw new Error('sshkey: 모르는 연산 ' + op);
};
