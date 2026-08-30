/**
 * 인증서, CSR 을 사람 말로 (TASK-KL-316 / 23)
 *
 * 인증서에서 사람이 알고 싶은 건 늘 같다: **누구 것인가, 언제까지인가, 어떤 이름들에 쓰이나**.
 * 그런데 `openssl x509 -text` 는 한 화면을 넘고, 웹 도구는 인증서를 남의 서버로 올린다.
 *
 * 여기서는 `core/pem` 이 읽은 나무에서 그 넷만 집어 온다. 남는 자리(확장, 서명)는 나무 그대로 둔다 . 
 * **모르는 것을 지어내지 않는다**(모르는 OID 는 숫자 그대로 나온다).
 */
import type { ToolRunner, ToolSpec } from './types';
import { findAll, oidName, parseDer, readPem, type Asn1 } from './pem';

export const spec: ToolSpec = {
  id: 'certview',
  ops: {
    read: {
      desc: 'Read a PEM certificate or CSR: who it is for, who issued it, when it expires, and which names it covers.',
      in: { pem: 'string' },
      out: 'string'
    }
  }
};

export interface Cert {
  kind: 'certificate' | 'request' | 'unknown';
  /** `CN=example.com, O=...` */
  subject: string;
  issuer: string;
  serial?: string;
  notBefore?: string;
  notAfter?: string;
  /** 이 인증서가 덮는 이름들 (SAN) */
  names: string[];
  keyAlgorithm?: string;
  signatureAlgorithm?: string;
  isCa?: boolean;
  /** 스스로 서명했나 (발급자와 주체가 같다) */
  selfSigned: boolean;
}

/** `SEQUENCE > SET > SEQUENCE{OID, 값}` 을 `CN=..., O=...` 로 편다. */
function readName(node: Asn1 | undefined): string {
  if (node === undefined || node.children === undefined) return '';
  const parts: string[] = [];
  for (const set of node.children) {
    for (const pair of set.children ?? []) {
      const kids = pair.children ?? [];
      const oid = kids.find((k) => k.kind === 'OID')?.value;
      const value = kids.find((k) => k.value !== undefined && k.kind !== 'OID')?.value;
      if (oid !== undefined && value !== undefined) parts.push(oid + '=' + value);
    }
  }
  return parts.join(', ');
}

/** SAN 확장. 안이 또 DER 이다. `[2]` 는 dNSName, `[7]` 은 IP. */
function readSans(nodes: Asn1[]): string[] {
  const out: string[] = [];
  /* 확장은 `SEQUENCE { OID, OCTET STRING }` 꼴이라 **OID 옆의 형제**를 봐야 한다 (OID 만 찾으면 못 찾는다). */
  const walk = (list: Asn1[]): void => {
    for (const node of list) {
      const kids = node.children ?? [];
      const oid = kids.find((k) => k.kind === 'OID');
      if (oid?.value === 'subjectAltName') {
        for (const kid of kids) {
          for (const entry of kid.children ?? []) {
            for (const name of entry.children ?? [entry]) {
              if (name.bytes.length === 0) continue;
              const text = new TextDecoder().decode(name.bytes);
              /* dNSName 은 [2] = 태그 0x82, IP 는 [7] = 0x87 */
              if (name.tag === 0x82 && /^[\w.*-]+$/.test(text)) out.push(text);
              else if (name.tag === 0x87 && name.bytes.length === 4) out.push([...name.bytes].join('.'));
            }
          }
        }
      }
      if (node.children !== undefined) walk(node.children);
    }
  };
  walk(nodes);
  return [...new Set(out)];
}

function readCa(nodes: Asn1[]): boolean | undefined {
  let found: boolean | undefined;
  const walk = (list: Asn1[]): void => {
    for (const node of list) {
      const kids = node.children ?? [];
      if (kids.find((k) => k.kind === 'OID')?.value === 'basicConstraints') {
        const boolean = findAll(kids, 'BOOLEAN').find((b) => b.value !== undefined);
        found = boolean?.value === 'true';
      }
      if (node.children !== undefined) walk(node.children);
    }
  };
  walk(nodes);
  return found;
}

export function readCert(der: Uint8Array, label = ''): Cert {
  const tree = parseDer(der);
  const top = tree[0];
  if (top === undefined || top.children === undefined) throw new Error('인증서로 안 읽힙니다');

  const isRequest = /REQUEST/i.test(label);
  const tbs = top.children[0];
  const parts = tbs.children ?? [];

  /* 인증서: [0]버전?, 일련번호, 서명알고리즘, 발급자, 기간, 주체, 공개키, 확장
     CSR:    버전, 주체, 공개키, 속성. 그래서 자리 세는 법이 다르다. */
  let subject = '';
  let issuer = '';
  let serial: string | undefined;
  let notBefore: string | undefined;
  let notAfter: string | undefined;

  if (isRequest) {
    subject = readName(parts[1]);
  } else {
    const hasVersion = parts[0] !== undefined && parts[0].tag === 0xa0;
    const at = (i: number): Asn1 | undefined => parts[i + (hasVersion ? 1 : 0)];
    serial = at(0)?.value;
    issuer = readName(at(2));
    const validity = at(3);
    notBefore = validity?.children?.[0]?.value;
    notAfter = validity?.children?.[1]?.value;
    subject = readName(at(4));
  }

  const algorithms = findAll(tree, 'OID')
    .map((o) => o.value ?? '')
    .filter((v) => v !== '');
  const keyAlgorithm = algorithms.find((a) => a === 'RSA' || a === 'EC' || a === 'Ed25519');
  const signatureAlgorithm = algorithms.find((a) => /with(RSA|ECDSA)/i.test(a));

  return {
    kind: isRequest ? 'request' : 'certificate',
    subject,
    issuer,
    serial,
    notBefore,
    notAfter,
    names: readSans(tree),
    keyAlgorithm,
    signatureAlgorithm,
    isCa: readCa(tree),
    selfSigned: issuer !== '' && issuer === subject
  };
}

export interface Chain {
  certs: Cert[];
  /** 사슬이 이어지나. 앞 것의 발급자가 뒤 것의 주체인가 */
  linked: boolean;
  /** 남은 날 (첫 인증서 기준). 이미 지났으면 음수 */
  daysLeft?: number;
}

export function readChain(pemText: string, now = Date.now()): Chain {
  const blocks = readPem(pemText);
  if (blocks.length === 0) throw new Error('PEM 덩이를 못 찾았습니다');
  const certs = blocks.map((b) => readCert(b.der, b.label));
  let linked = certs.length > 1;
  for (let i = 0; i < certs.length - 1; i++) {
    if (certs[i].issuer !== certs[i + 1].subject) linked = false;
  }
  const until = certs[0].notAfter === undefined ? undefined : Date.parse(certs[0].notAfter);
  return {
    certs,
    linked,
    daysLeft: until === undefined || Number.isNaN(until) ? undefined : Math.floor((until - now) / 86400000)
  };
}

export const run: ToolRunner = (op, args) => {
  if (op !== 'read') throw new Error('certview: 모르는 연산 ' + op);
  const chain = readChain(String(args.pem ?? ''));
  return chain.certs
    .map((c, i) =>
      [
        '#' + (i + 1) + ' ' + c.kind + (c.selfSigned ? ' (self-signed)' : ''),
        '  subject: ' + c.subject,
        c.issuer === '' ? '' : '  issuer:  ' + c.issuer,
        c.notAfter === undefined ? '' : '  until:   ' + c.notAfter + (i === 0 && chain.daysLeft !== undefined ? '  (' + chain.daysLeft + ' days)' : ''),
        c.names.length === 0 ? '' : '  names:   ' + c.names.join(', '),
        '  key:     ' + (c.keyAlgorithm ?? '?') + '  sig: ' + (c.signatureAlgorithm ?? '?')
      ]
        .filter((s) => s !== '')
        .join('\n')
    )
    .join('\n\n');
};

export { oidName };
