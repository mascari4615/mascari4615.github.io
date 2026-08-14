/**
 * 대역 계산과 포트 사전 (TASK-KL-316 / 25)
 *
 * `10.0.0.0/22` 가 어디부터 어디까지인지, 몇 대가 들어가는지는 **머리로 세면 꼭 하나 틀린다**.
 * 방화벽 규칙에서 그 하나가 문을 열어 두거나 닫아 버린다. 그래서 여기서 센다.
 *
 * 겹치는지도 본다 — 규칙 두 줄이 겹치면 뒤 줄이 안 먹거나 앞 줄이 너무 넓다.
 * 포트는 「몇 번이 뭐였더라」를 위한 작은 사전이다. **아는 것만** 적는다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'nettool',
  ops: {
    cidr: {
      desc: 'Work out a CIDR block: network, broadcast, first/last usable host, mask and how many addresses.',
      in: { cidr: 'string' },
      out: 'string'
    },
    contains: {
      desc: 'Say whether an address falls inside a CIDR block.',
      in: { cidr: 'string', ip: 'string' },
      out: 'boolean'
    },
    split: {
      desc: 'Split a CIDR block into smaller blocks of the given prefix length.',
      in: { cidr: 'string', prefix: 'number' },
      out: 'string'
    },
    port: {
      desc: 'Look up what usually listens on a port number (or find the port of a service name).',
      in: { query: 'string' },
      out: 'string'
    }
  }
};

/* ── IPv4 ──────────────────────────────────────────────────────────── */

export function ipToNumber(ip: string): number {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) throw new Error('IPv4 주소가 아닙니다: ' + ip);
  let out = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) throw new Error('마디가 0~255 를 벗어납니다: ' + ip);
    out = out * 256 + n;
  }
  return out >>> 0;
}

export function numberToIp(value: number): string {
  const n = value >>> 0;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

export interface Block {
  cidr: string;
  prefix: number;
  network: string;
  broadcast: string;
  /** 쓸 수 있는 첫·마지막 주소. /31·/32 는 **없다**(그 둘은 규칙이 다르다). */
  firstHost?: string;
  lastHost?: string;
  mask: string;
  wildcard: string;
  /** 주소 개수 (네트워크·브로드캐스트 포함) */
  total: number;
  /** 실제로 기기에 줄 수 있는 개수 */
  usable: number;
  /** 사설 대역인가 (10/8 · 172.16/12 · 192.168/16 · 100.64/10 · 169.254/16) */
  private: boolean;
}

const PRIVATE: Array<[string, number]> = [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['100.64.0.0', 10],
  ['169.254.0.0', 16],
  ['127.0.0.0', 8]
];

export function parseCidr(text: string): Block {
  const [ipPart, prefixPart] = text.trim().split('/');
  const prefix = prefixPart === undefined ? 32 : Number(prefixPart);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error('/0 부터 /32 까지만 됩니다');
  const ip = ipToNumber(ipPart);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = prefix === 0 ? 4294967296 : Math.pow(2, 32 - prefix);
  /* /31 은 둘 다 쓴다(점대점), /32 는 한 대뿐 — 「-2」를 그냥 하면 음수가 나온다. */
  const usable = prefix >= 31 ? total : total - 2;
  const isPrivate = PRIVATE.some(([base, bits]) => {
    const m = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (ipToNumber(base) & m) === (network & m);
  });
  return {
    cidr: numberToIp(network) + '/' + prefix,
    prefix,
    network: numberToIp(network),
    broadcast: numberToIp(broadcast),
    firstHost: prefix >= 31 ? undefined : numberToIp(network + 1),
    lastHost: prefix >= 31 ? undefined : numberToIp(broadcast - 1),
    mask: numberToIp(mask),
    wildcard: numberToIp(~mask >>> 0),
    total,
    usable,
    private: isPrivate
  };
}

export function contains(cidr: string, ip: string): boolean {
  const block = parseCidr(cidr);
  const value = ipToNumber(ip);
  return value >= ipToNumber(block.network) && value <= ipToNumber(block.broadcast);
}

/** 규칙 두 줄이 겹치나 — 겹치면 뒤 줄이 안 먹거나 앞 줄이 너무 넓다. */
export function overlaps(a: string, b: string): boolean {
  const x = parseCidr(a);
  const y = parseCidr(b);
  return ipToNumber(x.network) <= ipToNumber(y.broadcast) && ipToNumber(y.network) <= ipToNumber(x.broadcast);
}

/** 큰 대역을 작은 대역으로 쪼갠다. 너무 많으면 **개수를 말하고 앞의 것만** 준다. */
export function split(cidr: string, prefix: number, cap = 256): { blocks: string[]; count: number } {
  const block = parseCidr(cidr);
  if (prefix < block.prefix) throw new Error('원래 대역보다 큰 조각으로는 못 쪼갭니다');
  if (prefix > 32) throw new Error('/32 보다 잘게는 못 쪼갭니다');
  const count = Math.pow(2, prefix - block.prefix);
  const step = Math.pow(2, 32 - prefix);
  const start = ipToNumber(block.network);
  const blocks: string[] = [];
  for (let i = 0; i < Math.min(count, cap); i++) blocks.push(numberToIp(start + i * step) + '/' + prefix);
  return { blocks, count };
}

/** 주소 목록을 덮는 **가장 작은 하나**의 대역 (규칙 한 줄로 줄일 때 쓴다). */
export function summarize(ips: string[]): string {
  if (ips.length === 0) throw new Error('주소가 없습니다');
  const numbers = ips.map((ip) => ipToNumber(ip.split('/')[0]));
  const low = Math.min(...numbers);
  const high = Math.max(...numbers);
  let prefix = 32;
  while (prefix > 0) {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    if ((low & mask) === (high & mask)) break;
    prefix--;
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return numberToIp((low & mask) >>> 0) + '/' + prefix;
}

/* ── 포트 사전 ─────────────────────────────────────────────────────── */

/** 이름은 어느 말에서나 같다(프로토콜 이름) — 그래서 여기 둔다. 설명은 화면이 붙인다. */
export const PORTS: Record<number, string> = {
  20: 'FTP data',
  21: 'FTP',
  22: 'SSH',
  23: 'Telnet',
  25: 'SMTP',
  53: 'DNS',
  67: 'DHCP server',
  68: 'DHCP client',
  80: 'HTTP',
  110: 'POP3',
  123: 'NTP',
  143: 'IMAP',
  161: 'SNMP',
  389: 'LDAP',
  443: 'HTTPS',
  445: 'SMB',
  465: 'SMTPS',
  514: 'syslog',
  587: 'SMTP (submission)',
  636: 'LDAPS',
  873: 'rsync',
  993: 'IMAPS',
  995: 'POP3S',
  1080: 'SOCKS',
  1194: 'OpenVPN',
  1433: 'SQL Server',
  1521: 'Oracle',
  1883: 'MQTT',
  2049: 'NFS',
  2375: 'Docker (평문)',
  2376: 'Docker (TLS)',
  3000: 'Node dev',
  3306: 'MySQL',
  3389: 'RDP',
  5000: 'Flask · AirPlay',
  5173: 'Vite dev',
  5432: 'PostgreSQL',
  5672: 'AMQP',
  5900: 'VNC',
  6379: 'Redis',
  8000: 'HTTP 대체',
  8080: 'HTTP 대체',
  8443: 'HTTPS 대체',
  8813: 'KarmoLab dev',
  9000: 'SonarQube · MinIO',
  9090: 'Prometheus',
  9200: 'Elasticsearch',
  11211: 'memcached',
  27017: 'MongoDB'
};

export interface PortHit {
  port: number;
  name: string;
}

/** 숫자면 그 포트를, 글자면 이름으로 찾는다. 못 찾으면 **빈 목록**(지어내지 않는다). */
export function findPort(query: string): PortHit[] {
  const text = query.trim();
  if (text === '') return [];
  if (/^\d+$/.test(text)) {
    const port = Number(text);
    const name = PORTS[port];
    return name === undefined ? [] : [{ port, name }];
  }
  const lower = text.toLowerCase();
  return Object.entries(PORTS)
    .filter(([, name]) => name.toLowerCase().includes(lower))
    .map(([port, name]) => ({ port: Number(port), name }))
    .sort((a, b) => a.port - b.port);
}

/** 잘 알려진 자리인가 — 1024 아래는 관리자 권한이 필요하다(리눅스). */
export function isWellKnown(port: number): boolean {
  return port > 0 && port < 1024;
}

export const run: ToolRunner = (op, args) => {
  if (op === 'cidr') {
    const b = parseCidr(String(args.cidr ?? ''));
    return [
      b.cidr + '  (' + b.total.toLocaleString() + ' addresses, ' + b.usable.toLocaleString() + ' usable)',
      'network   ' + b.network,
      'broadcast ' + b.broadcast,
      b.firstHost === undefined ? '' : 'hosts     ' + b.firstHost + ' – ' + String(b.lastHost),
      'mask      ' + b.mask + '   wildcard ' + b.wildcard,
      b.private ? 'private range' : 'public range'
    ]
      .filter((s) => s !== '')
      .join('\n');
  }
  if (op === 'contains') return contains(String(args.cidr ?? ''), String(args.ip ?? ''));
  if (op === 'split') {
    const got = split(String(args.cidr ?? ''), Number(args.prefix ?? 24));
    return got.blocks.join('\n') + (got.count > got.blocks.length ? '\n… ' + got.count.toLocaleString() + ' total' : '');
  }
  if (op === 'port') return findPort(String(args.query ?? '')).map((p) => p.port + '  ' + p.name).join('\n');
  throw new Error('nettool: 모르는 연산 ' + op);
};
