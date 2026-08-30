/**
 * PEM 과 그 속(ASN.1 DER) 을 읽는다 (TASK-KL-316 / 22, 23 공용)
 *
 * 열쇠도 인증서도 CSR 도 겉모습은 같다. `-----BEGIN ...-----` + base64. 속은 전부 **DER**이라
 * 읽는 법도 하나다. 그래서 여기 한 번만 만들고 두 도구(`cryptolab`, `certview`)가 같이 쓴다.
 * 두 벌로 만들면 한쪽만 고쳐지고, 그 순간 같은 파일에 두 답이 나온다.
 *
 * 알아보는 것만 이름을 대고 **모르는 OID 는 숫자 그대로** 돌려준다. 지어내지 않는다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'pem',
  ops: {
    look: {
      desc: 'Look inside a PEM block (key, certificate or CSR): what it is, and the ASN.1 structure.',
      in: { pem: 'string' },
      out: 'string'
    }
  }
};

export interface Block {
  /** `CERTIFICATE`, `PRIVATE KEY`, `PUBLIC KEY`, `CERTIFICATE REQUEST` ... */
  label: string;
  der: Uint8Array;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/=]/g, '');
  const out: number[] = [];
  let bits = 0;
  let acc = 0;
  for (const ch of clean) {
    if (ch === '=') break;
    const v = B64.indexOf(ch);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : B64[c & 63];
  }
  return out;
}

/** 여러 덩이가 이어 붙어 있는 파일도 있다(사슬 인증서). 다 읽는다. */
export function readPem(text: string): Block[] {
  const out: Block[] = [];
  const re = /-----BEGIN ([^-]+)-----([\s\S]*?)-----END \1-----/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push({ label: m[1].trim(), der: base64ToBytes(m[2]) });
  return out;
}

export function toPem(label: string, der: Uint8Array): string {
  const body = bytesToBase64(der).replace(/(.{64})/g, '$1\n').trim();
  return '-----BEGIN ' + label + '-----\n' + body + '\n-----END ' + label + '-----';
}

/* ── ASN.1 DER ─────────────────────────────────────────────────────── */

export interface Asn1 {
  /** 태그 번호 (0x30 = SEQUENCE ...) */
  tag: number;
  /** 사람이 읽는 이름. 모르면 `[숫자]` */
  kind: string;
  /** 속 바이트 (원시) */
  bytes: Uint8Array;
  children?: Asn1[];
  /** 읽을 수 있는 것은 값으로 (정수, 문자열, OID, 시각) */
  value?: string;
}

const TAGS: Record<number, string> = {
  0x01: 'BOOLEAN',
  0x02: 'INTEGER',
  0x03: 'BIT STRING',
  0x04: 'OCTET STRING',
  0x05: 'NULL',
  0x06: 'OID',
  0x0c: 'UTF8String',
  0x13: 'PrintableString',
  0x16: 'IA5String',
  0x17: 'UTCTime',
  0x18: 'GeneralizedTime',
  0x30: 'SEQUENCE',
  0x31: 'SET'
};

/** 우리가 마주치는 OID 만. **모르면 숫자를 그대로 준다.** */
const OIDS: Record<string, string> = {
  '1.2.840.113549.1.1.1': 'RSA',
  '1.2.840.113549.1.1.11': 'SHA256withRSA',
  '1.2.840.113549.1.1.12': 'SHA384withRSA',
  '1.2.840.113549.1.1.13': 'SHA512withRSA',
  '1.2.840.113549.1.1.5': 'SHA1withRSA',
  '1.2.840.10045.2.1': 'EC',
  '1.2.840.10045.4.3.2': 'SHA256withECDSA',
  '1.2.840.10045.3.1.7': 'P-256',
  '1.3.132.0.34': 'P-384',
  '1.3.132.0.35': 'P-521',
  '1.3.101.112': 'Ed25519',
  '2.5.4.3': 'CN',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.8': 'ST',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
  '1.2.840.113549.1.9.1': 'email',
  '2.5.29.17': 'subjectAltName',
  '2.5.29.19': 'basicConstraints',
  '2.5.29.15': 'keyUsage',
  '2.5.29.37': 'extKeyUsage',
  '2.5.29.14': 'subjectKeyIdentifier',
  '2.5.29.35': 'authorityKeyIdentifier'
};

export function oidName(oid: string): string {
  return OIDS[oid] ?? oid;
}

function readOid(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  const parts = [Math.floor(bytes[0] / 40), bytes[0] % 40];
  let value = 0;
  for (let i = 1; i < bytes.length; i++) {
    value = value * 128 + (bytes[i] & 0x7f);
    if ((bytes[i] & 0x80) === 0) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join('.');
}

function readTime(text: string): string {
  /* UTCTime 은 두 자리 해다. 50 이상이면 1900년대(RFC 5280). 이걸 틀리면 만료가 50년 어긋난다. */
  const m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z?$/.exec(text);
  if (m === null) return text;
  const yy = Number(m[1]);
  const year = text.length > 13 ? Number(text.slice(0, 4)) : yy >= 50 ? 1900 + yy : 2000 + yy;
  return year + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + (m[6] ?? '00') + 'Z';
}

/** DER 을 나무로. 길이가 어긋나면 **거기서 멈추고 말한다** (조용히 반쪽을 주지 않는다). */
export function parseDer(der: Uint8Array, depth = 0): Asn1[] {
  const out: Asn1[] = [];
  let at = 0;
  while (at < der.length) {
    const tag = der[at++];
    if (at >= der.length) break;
    let len = der[at++];
    if (len > 0x80) {
      const count = len & 0x7f;
      if (count > 4 || at + count > der.length) throw new Error('길이가 이상합니다 (' + at + '번째 바이트)');
      len = 0;
      for (let i = 0; i < count; i++) len = len * 256 + der[at++];
    } else if (len === 0x80) {
      throw new Error('끝을 안 적은 길이(indefinite)는 DER 이 아닙니다');
    }
    if (at + len > der.length) throw new Error('속이 잘렸습니다 (' + (at + len) + ' > ' + der.length + ')');
    const bytes = der.slice(at, at + len);
    at += len;

    const node: Asn1 = { tag, kind: TAGS[tag] ?? '[' + tag + ']', bytes };
    const constructed = (tag & 0x20) !== 0;
    if (tag === 0x06) node.value = oidName(readOid(bytes));
    else if (tag === 0x02) {
      node.value = bytes.length <= 6 ? String([...bytes].reduce((n, b) => n * 256 + b, 0)) : bytes.length * 8 + ' bit';
    } else if (tag === 0x0c || tag === 0x13 || tag === 0x16) node.value = new TextDecoder().decode(bytes);
    else if (tag === 0x17 || tag === 0x18) node.value = readTime(new TextDecoder().decode(bytes));
    else if (tag === 0x01) node.value = bytes[0] !== 0 ? 'true' : 'false';

    if (constructed && depth < 20) {
      try {
        node.children = parseDer(bytes, depth + 1);
      } catch {
        /* 속이 DER 이 아닐 수 있다. 그건 잘못이 아니다(그냥 바이트다) */
      }
    }
    /* BIT STRING, OCTET STRING 속에 또 DER 이 든 경우가 흔하다 (공개키, 확장) */
    if ((tag === 0x03 || tag === 0x04) && bytes.length > 2 && depth < 20) {
      const inner = tag === 0x03 ? bytes.slice(1) : bytes;
      try {
        const kids = parseDer(inner, depth + 1);
        if (kids.length > 0 && kids[0].bytes.length > 0) node.children = kids;
      } catch {
        /* 그냥 바이트면 그대로 둔다 */
      }
    }
    out.push(node);
  }
  return out;
}

/** 나무에서 처음 만나는 것 하나 (`OID` 같은 것을 집을 때). */
export function findFirst(nodes: Asn1[], kind: string): Asn1 | undefined {
  for (const node of nodes) {
    if (node.kind === kind) return node;
    const inner = node.children === undefined ? undefined : findFirst(node.children, kind);
    if (inner !== undefined) return inner;
  }
  return undefined;
}

export function findAll(nodes: Asn1[], kind: string, out: Asn1[] = []): Asn1[] {
  for (const node of nodes) {
    if (node.kind === kind) out.push(node);
    if (node.children !== undefined) findAll(node.children, kind, out);
  }
  return out;
}

export function show(nodes: Asn1[], indent = 0): string {
  return nodes
    .map((n) => {
      const head = '  '.repeat(indent) + n.kind + (n.value === undefined ? '' : ': ' + n.value) + (n.children === undefined && n.value === undefined ? '  (' + n.bytes.length + ' bytes)' : '');
      return n.children === undefined ? head : head + '\n' + show(n.children, indent + 1);
    })
    .join('\n');
}

export const run: ToolRunner = (op, args) => {
  if (op !== 'look') throw new Error('pem: 모르는 연산 ' + op);
  const blocks = readPem(String(args.pem ?? ''));
  if (blocks.length === 0) throw new Error('PEM 덩이를 못 찾았습니다');
  return blocks.map((b) => b.label + ' (' + b.der.length + ' bytes)\n' + show(parseDer(b.der))).join('\n\n');
};
