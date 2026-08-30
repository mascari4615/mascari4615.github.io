/**
 * 누구인가. 한 곳에서 (change.identity-one, karmolab.system.identity).
 *
 * 지금까지 서버는 요청마다 `sha256(IP | User-Agent)` 로 사람을 만들었다. 그 값이 열일곱 군데에서
 * 따로 계산됐고, 그 위에 채팅, 방, 집계가 각자 이름표를 또 만들었다. 결과는 두 방향으로 틀렸다:
 * 같은 사람이 크롬과 엣지를 열면 **두 명**, 같은 카페의 두 사람은 **한 명**.
 *
 * 그래서 키를 **둘로 가른다**. 하나로 쓰면 반드시 한쪽이 틀린다:
 *  ① `personKey` = 사람을 **세는** 키. 브라우저가 만든 기기 id 가 있으면 그것.
 *  ② `abuseKey`  = 사람을 **막는** 키. 언제나 IP. 기기 id 는 사람이 지울 수 있어서,
 *     상한을 거기에만 걸면 그건 상한이 아니다.
 *
 * 기기 id 의 **정본은 브라우저**다(localStorage → `X-KL-Device` 헤더). 쿠키는 보조 . 
 * 이 서버는 다른 도메인에 있어서 브라우저가 제3자 쿠키를 막으면 쿠키만으로는 못 센다.
 */
import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { KarmolabTraceStore } from './karmolab-traces';

export const DEVICE_COOKIE = 'kl_device';
export const DEVICE_HEADER = 'x-kl-device';

/** 기기 id 한 살. 더 길게 잡아도 사람이 지우면 그만이고, 짧으면 매달 새 사람이 된다. */
const DEVICE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export interface KarmolabIdentity {
  /** 브라우저가 들고 온 기기 id. 없으면 null(쿠키도 헤더도 막힌 경우). */
  deviceId: string | null;
  /** 사람을 세는 키. 접속자, 채팅 지금 여기, 방 인원, 도구 열림 집계가 전부 이걸 쓴다. */
  personKey: string;
  /** 상한을 거는 키. 언제나 IP 기준. */
  abuseKey: string;
  ip: string;
}

/** 우리 앞에 터널이 하나 있다. 맨 앞 값만 쓴다. 뒤쪽은 아무나 적을 수 있다. */
export function ipOf(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : String(forwarded ?? '').split(',')[0];
  return (first || req.socket.remoteAddress || 'unknown').trim();
}

/** 기기 id 는 우리가 만든 모양만 받는다. 남이 적어 보낸 아무 글자나 사람이 되면 안 된다. */
export function normalizeDeviceId(raw: unknown): string | null {
  const value = String(raw ?? '').trim();
  return /^[a-z0-9]{16,32}$/.test(value) ? value : null;
}

export function newDeviceId(): string {
  return crypto.randomBytes(12).toString('hex'); // 24글자
}

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function cookieOf(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/**
 * 이 요청은 누구인가.
 *
 * `res` 를 주면 기기 id 가 없을 때 **그 자리에서 하나 심는다**. 안 주면 읽기만 한다
 * (흐르는 연결처럼 머리를 이미 보낸 자리에서 쿠키를 심으면 아무 일도 안 일어난다).
 */
export function identityOf(req: Request, res?: Response): KarmolabIdentity {
  /* 한 요청 안에서는 **같은 답**이어야 한다. 처음 심는 요청에서 뒤이어 다시 물으면 머리에도
     쿠키에도 아직 그 id 가 없어서 옛 키로 떨어졌고, 그러면 이름표가 요청 하나 안에서 두 번
     바뀐다. 채팅 스모크가 남의 줄 이름이 보낸 사람과 다르다로 이걸 잡았다. */
  const cached = (req as Request & { klIdentity?: KarmolabIdentity }).klIdentity;
  if (cached) return cached;

  const ip = ipOf(req);
  const abuseKey = hash(`ip|${ip}`);
  const fromHeader = normalizeDeviceId(req.headers[DEVICE_HEADER]);
  const fromCookie = normalizeDeviceId(cookieOf(req, DEVICE_COOKIE));
  /* 흐르는 연결(EventSource)은 **머리를 못 단다**. 그 자리는 주소에 싣는다.
     막을 이유도 없다: 이건 열쇠가 아니라 세는 표라, 머리로 오든 주소로 오든 똑같이 위조된다. */
  const fromQuery = normalizeDeviceId((req.query as Record<string, unknown> | undefined)?.dev);
  let deviceId = fromHeader ?? fromQuery ?? fromCookie;

  if (!deviceId && res) {
    deviceId = newDeviceId();
    res.append(
      'Set-Cookie',
      `${DEVICE_COOKIE}=${deviceId}; Max-Age=${Math.floor(DEVICE_MAX_AGE_MS / 1000)}; Path=/; Secure; SameSite=None`,
    );
  }

  /* 기기 id 를 못 얻었으면 옛 방식으로 떨어진다. 쿠키도 저장소도 막은 브라우저가 있고,
     그 사람도 같이 쓸 수 있어야 한다. 정확도는 떨어지지만 **없는 것보다 낫다**. */
  const personKey = deviceId
    ? hash(`dev|${deviceId}`)
    // 옛 키 그대로 떨어진다. 모양을 바꾸면 어제까지 센 사람이 오늘 새 사람이 된다.
    : KarmolabTraceStore.visitorKey(ip, String(req.headers['user-agent'] ?? ''));

  const identity: KarmolabIdentity = { deviceId: deviceId ?? null, personKey, abuseKey, ip };
  (req as Request & { klIdentity?: KarmolabIdentity }).klIdentity = identity;
  return identity;
}

/* ── 오늘의 이름표 (change.identity-one 3단계) ──────────────────
 *
 * 이름과 색을 만드는 규칙은 **여기 하나**다. 예전엔 채팅이 자기 안에 들고 있었고, 방(커서)은
 * 또 다른 규칙(`colorFor`)으로 색을 만들었다 — 같은 사람이 화면마다 다른 색이었다.
 */
/**
 * 이름표 재료.
 *
 * 색과 동물을 곱하면 480 가지다 — 이 사이트 동시 접속 규모에서 겹칠 일이 사실상 없고,
 * 겹쳐도 대화가 안 망가진다(색이 같이 다르다). 굳이 번호를 붙여 이름을 못생기게 만들지 않는다.
 */
export const NAME_COLORS: { label: string; css: string }[] = [
    { label: '연보라', css: '#b39ddb' },
    { label: '하늘', css: '#7fc7f5' },
    { label: '민트', css: '#5fd3b2' },
    { label: '살구', css: '#f2a97e' },
    { label: '자몽', css: '#ef8b8b' },
    { label: '레몬', css: '#e6c65c' },
    { label: '풀빛', css: '#8fc76a' },
    { label: '바다', css: '#5aa9e6' },
    { label: '분홍', css: '#f094c0' },
    { label: '보라', css: '#a086e0' },
    { label: '잿빛', css: '#a9b4c2' },
    { label: '구리', css: '#d09a5e' },
];

export const NAME_ANIMALS = [
    '수달', '너구리', '여우', '올빼미', '고슴도치', '두더지', '다람쥐', '해달',
    '펭귄', '물범', '알파카', '라마', '카피바라', '왈라비', '오소리', '족제비',
    '삵', '표범', '늑대', '순록', '큰부리새', '홍학', '두루미', '기러기',
    '개구리', '도롱뇽', '거북', '도마뱀', '문어', '해파리', '고래', '돌고래',
    '나비', '반딧불이', '무당벌레', '사슴벌레', '달팽이', '해마', '가오리', '복어',
];


export interface AnonLabel {
  /** 밖에 보여도 되는 짧은 이름표. */
  who: string;
  name: string;
  color: string;
  /** 서버만 아는 열쇠 — 이게 새면 익명이 아니다. */
  key: string;
}

/** KST 날짜 한 줄. 이름표는 하루마다 바뀐다 — 어제 한 말과 오늘 한 말이 안 이어진다. */
export function kstDay(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 오늘의 이름표. 같은 사람이면 하루 종일 같고, 날짜가 바뀌면 달라진다.
 * 어디에도 저장하지 않는다 — 필요할 때 다시 계산하면 되고, 저장 안 하는 편이 더 익명이다.
 */
export function anonLabel(salt: string, personKey: string, now: Date = new Date()): AnonLabel {
  const digest = crypto.createHash('sha256').update(`${salt}|${kstDay(now)}|${personKey}`).digest();
  const color = NAME_COLORS[digest[0] % NAME_COLORS.length];
  const animal = NAME_ANIMALS[digest[1] % NAME_ANIMALS.length];
  return {
    who: digest.toString('hex').slice(0, 10),
    name: `${color.label} ${animal}`,
    color: color.css,
    key: digest.toString('hex'),
  };
}
