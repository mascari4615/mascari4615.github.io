/**
 * QR 코드 만들기 — 알맹이 (TASK-KL-088 / S1)
 *
 * 외부 API 를 안 부른다 — QR 에 담기는 건 대개 WiFi 비밀번호·연락처라, 그게 남의 서버로
 * 나가면 안 된다. `qrcode-generator` 를 번들해 여기서 직접 만든다.
 *
 * MCP 로 내놓는 이유(A등급): LLM 은 QR 을 **못 만든다**(그림이다). 그럴듯한 격자를 그려 줘도
 * 스캔이 안 된다. 게다가 WiFi·vCard 처럼 **문법이 정해진 문자열**은 이스케이프를 자주 빠뜨린다 —
 * 비밀번호에 `;` 나 `:` 가 있으면 그 자리에서 QR 이 통째로 깨지는데, 눈으로는 멀쩡해 보인다.
 *
 * 화면은 캔버스로 그리고, 여기서는 **SVG 문자열**로 낸다 — 캔버스 없이 도는 유일한 길이고
 * 확대해도 안 깨진다.
 */
import qrcode from 'qrcode-generator';
import type { ToolRunner, ToolSpec } from './types';

export type Level = 'L' | 'M' | 'Q' | 'H';

export const spec: ToolSpec = {
  id: 'qrgen',
  ops: {
    svg: {
      desc:
        '내용을 QR 코드 SVG 로 만든다 (외부 API 없음). level = L·M·Q·H 오류복원 수준(기본 M),' +
        ' size 는 픽셀 크기.',
      in: { text: 'string', level: 'string?', size: 'number?' },
      out: 'string'
    },
    wifi: {
      desc:
        'WiFi 접속 QR 을 만든다. 스캔하면 그 네트워크에 바로 붙는다.' +
        ' encryption = WPA(기본) · WEP · nopass. 비밀번호에 ; : , \\ 가 있어도 규칙대로 처리한다.',
      in: { ssid: 'string', password: 'string?', encryption: 'string?', hidden: 'boolean?', size: 'number?' },
      out: 'string'
    },
    contact: {
      desc: '연락처(vCard) QR 을 만든다. 스캔하면 주소록에 바로 들어간다.',
      in: { name: 'string', org: 'string?', tel: 'string?', email: 'string?', size: 'number?' },
      out: 'string'
    }
  }
};

/**
 * WiFi·vCard 문법에서 뜻을 가진 글자는 앞에 `\` 를 붙인다.
 * 이걸 빠뜨리면 비밀번호에 `;` 하나 있는 것만으로 **QR 이 조용히 다른 뜻**이 된다.
 */
export function escapeWifi(s: string): string {
  return s.replace(/([\\;,:"])/g, '\\$1');
}

export function wifiPayload(
  ssid: string,
  password = '',
  encryption = 'WPA',
  hidden = false
): string {
  if (ssid.trim() === '') throw new Error('WiFi 이름(SSID)이 필요합니다');
  const enc = encryption === 'nopass' || encryption === 'WEP' ? encryption : 'WPA';
  const pass = enc === 'nopass' ? '' : `P:${escapeWifi(password)};`;
  return `WIFI:T:${enc};S:${escapeWifi(ssid)};${pass}${hidden ? 'H:true;' : ''};`;
}

export function vcardPayload(name: string, org = '', tel = '', email = ''): string {
  if (name.trim() === '') throw new Error('이름이 필요합니다');
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${name}`,
    `FN:${name}`,
    org === '' ? '' : `ORG:${org}`,
    tel === '' ? '' : `TEL:${tel}`,
    email === '' ? '' : `EMAIL:${email}`,
    'END:VCARD'
  ]
    .filter((l) => l !== '')
    .join('\n');
}

export interface QrGrid {
  count: number;
  isDark(row: number, col: number): boolean;
}

/** 문자열 → QR 격자. UTF-8 로 담아야 한글이 안 깨진다. */
export function makeGrid(text: string, level: Level = 'M'): QrGrid {
  if (text === '') throw new Error('담을 내용이 없습니다');
  (qrcode as unknown as { stringToBytes: unknown; stringToBytesFuncs: Record<string, unknown> }).stringToBytes = (
    qrcode as unknown as { stringToBytesFuncs: Record<string, unknown> }
  ).stringToBytesFuncs['UTF-8'];
  const qr = qrcode(0, level);
  qr.addData(text);
  qr.make();
  return { count: qr.getModuleCount(), isDark: (r, c) => qr.isDark(r, c) };
}

/** 격자 → SVG. 여백 4칸은 규격이 요구하는 「조용한 구역」이라 줄이면 스캔이 안 된다. */
export function toSvg(grid: QrGrid, size = 256, fg = '#000000', bg = '#ffffff'): string {
  const margin = 4;
  const total = grid.count + margin * 2;
  let path = '';
  for (let r = 0; r < grid.count; r++) {
    for (let c = 0; c < grid.count; c++) {
      if (grid.isDark(r, c)) path += `M${c + margin} ${r + margin}h1v1h-1z`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}"` +
    ` shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="${bg}"/>` +
    `<path d="${path}" fill="${fg}"/></svg>`
  );
}

const levelOf = (raw: unknown): Level => {
  const l = String(raw ?? 'M').toUpperCase();
  return l === 'L' || l === 'Q' || l === 'H' ? l : 'M';
};

export const run: ToolRunner = (op, args) => {
  const size = Math.min(2048, Math.max(64, Math.round(Number(args.size ?? 256))));
  const level = levelOf(args.level);

  const text =
    op === 'svg'
      ? String(args.text ?? '')
      : op === 'wifi'
        ? wifiPayload(String(args.ssid ?? ''), String(args.password ?? ''), String(args.encryption ?? 'WPA'), args.hidden === true)
        : op === 'contact'
          ? vcardPayload(String(args.name ?? ''), String(args.org ?? ''), String(args.tel ?? ''), String(args.email ?? ''))
          : null;
  if (text === null) throw new Error(`qrgen 에 「${op}」 는 없습니다`);

  const grid = makeGrid(text, level);
  return toSvg(grid, size);
};
