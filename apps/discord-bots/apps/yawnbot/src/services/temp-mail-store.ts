/**
 * 잠깐 쓰는 메일. 곳간 (TASK-KL-339 / 흡혈 원장 3, 50)
 *
 * ## 규칙 다섯
 *
 * ① **주소를 알아도 못 읽는다.** 발급할 때 열쇠를 따로 주고 조회에 그 열쇠를 요구한다.
 *    바깥 temp-mail 은 주소만 알면 남의 편지함이 열린다(주소가 짧아 긁는 사람도 있다).
 *    주소는 남에게 줘야 쓸모가 있는 물건이니, 읽는 권한은 **주소가 아니라 열쇠**에 둔다.
 * ② **분 단위로 사라진다.** 기본 10분, 최대 60분. 잊힌 편지함이 쌓이는 곳간은 유출 대기열이다.
 * ③ **첨부는 안 받는다.** 임시 주소로 오는 파일을 우리가 보관할 이유가 없다.
 * ④ **상한을 둔다**. 편지함당 20통, 통당 256KB, 전체 5000함. 없으면 남이 우리 메모리를 쓴다.
 * ⑤ **메모리에만 산다.** 서버가 다시 서면 사라진다. 수명이 분 단위라 그게 맞고, 화면에 적는다.
 *
 * 이 파일에는 HTTP 도 Cloudflare 도 없다. 그래야 시간을 손으로 돌리며 만료를 잰다.
 */
import crypto from 'crypto';

/** 편지함 하나가 살아 있는 기본 시간. */
export const DEFAULT_TTL_MS = 10 * 60 * 1000;
/** 사람이 늘릴 수 있는 최대. */
export const MAX_TTL_MS = 60 * 60 * 1000;
/** 한 함에 담는 편지 수. 넘치면 **오래된 것부터** 밀려난다. */
export const MAX_LETTERS = 20;
/** 편지 하나의 최대 크기(글자). */
export const MAX_LETTER = 256 * 1024;
/** 살아 있는 편지함 수 상한. */
export const MAX_BOXES = 5000;

export interface Letter {
  id: string;
  from: string;
  subject: string;
  /** 본문. **글자만**. HTML 은 글로 눌러서 받는다(아래 `plainOf`). */
  text: string;
  at: number;
}

export interface Box {
  /** 주소의 앞부분. 전체 주소는 `${name}@${도메인}`. */
  name: string;
  /** 읽는 열쇠. **이걸 아는 쪽만** 편지를 본다. */
  token: string;
  createdAt: number;
  expiresAt: number;
  letters: Letter[];
}

/** 밖으로 내줄 때의 모양. **열쇠는 절대 안 실린다.** */
export interface BoxView {
  name: string;
  expiresAt: number;
  letters: Letter[];
}

/**
 * 주소에 쓸 이름. 헷갈리는 글자(0, o, 1, l, i)를 뺀다. 사람이 손으로 옮겨 적는 물건이라
 * 0 인지 o 인지에서 실제로 틀린다.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function makeName(len = 10, rand: (n: number) => Buffer = crypto.randomBytes): string {
  const bytes = rand(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/**
 * HTML 편지를 글자로 누른다.
 *
 * 왜 여기서 하나: 편지 대부분은 HTML 로 온다. 그걸 그대로 들고 있다가 화면에 넣으면
 * **남이 보낸 HTML 을 우리 화면에서 실행**하게 된다. 받는 자리에서 글자로 눌러 두면
 * 그 위험이 곳간에 들어오지조차 않는다. 화면 쪽 실수 하나로 뚫리는 일이 없다.
 */
export function plainOf(raw: string): string {
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** `"욘 <yon@example.com>"` → `yon@example.com` 은 그대로 두고, 이름만 있으면 그대로. */
export function tidyFrom(raw: string): string {
  const m = String(raw || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(raw || '')).trim().slice(0, 200);
}

export class TempMailStore {
  private boxes = new Map<string, Box>();

  constructor(private readonly now: () => number = Date.now) {}

  /** 새 편지함. 이름이 겹치면 다시 뽑는다(같은 이름 둘이면 남의 편지가 섞인다). */
  open(ttlMs = DEFAULT_TTL_MS): Box {
    this.sweep();
    if (this.boxes.size >= MAX_BOXES) {
      /* 꽉 찼으면 **가장 먼저 사라질 것**을 먼저 치운다. 새로 온 사람을 막는 것보다 낫다. */
      const oldest = [...this.boxes.values()].sort((a, b) => a.expiresAt - b.expiresAt)[0];
      if (oldest) this.boxes.delete(oldest.name);
    }
    const ttl = Math.max(60 * 1000, Math.min(MAX_TTL_MS, ttlMs));
    let name = makeName();
    while (this.boxes.has(name)) name = makeName();
    const box: Box = {
      name,
      token: crypto.randomBytes(24).toString('base64url'),
      createdAt: this.now(),
      expiresAt: this.now() + ttl,
      letters: [],
    };
    this.boxes.set(name, box);
    return box;
  }

  /**
   * 편지를 넣는다. **모르는 주소면 조용히 버린다**. 임시 주소로 오는 편지는 대부분
   * 이미 사라진 함으로 온다. 그걸 오류로 만들면 로그가 남의 스팸으로 찬다.
   *
   * @returns 넣었으면 `true`
   */
  deliver(name: string, letter: { from: string; subject: string; text: string }): boolean {
    this.sweep();
    const box = this.boxes.get(String(name || '').toLowerCase());
    if (!box) return false;
    const text = String(letter.text ?? '');
    box.letters.push({
      id: crypto.randomBytes(8).toString('hex'),
      from: tidyFrom(letter.from),
      subject: String(letter.subject ?? '').slice(0, 300),
      /* 상한을 넘으면 **자른다**(버리지 않는다). 긴 편지도 앞부분은 대개 쓸모가 있다. */
      text: text.length > MAX_LETTER ? text.slice(0, MAX_LETTER) : text,
      at: this.now(),
    });
    /* 넘치면 오래된 것부터. 새 편지를 못 받는 것보다 낫다. 사람이 기다리는 건 방금 온 것이다. */
    while (box.letters.length > MAX_LETTERS) box.letters.shift();
    return true;
  }

  /** 열쇠가 맞아야 본다. 틀리면 **없는 것과 같은 답**. 그 주소는 있다도 안 알려 준다. */
  read(name: string, token: string): BoxView | null {
    this.sweep();
    const box = this.boxes.get(String(name || '').toLowerCase());
    if (!box) return null;
    if (!safeEqual(box.token, String(token || ''))) return null;
    return { name: box.name, expiresAt: box.expiresAt, letters: box.letters };
  }

  /** 미리 버리기. 열쇠가 맞을 때만. */
  drop(name: string, token: string): boolean {
    const box = this.boxes.get(String(name || '').toLowerCase());
    if (!box || !safeEqual(box.token, String(token || ''))) return false;
    this.boxes.delete(box.name);
    return true;
  }

  /** 수명이 다한 함을 치운다. 부를 때마다 도므로 따로 타이머를 안 둔다. */
  sweep(): number {
    const t = this.now();
    let gone = 0;
    for (const [name, box] of this.boxes) {
      if (box.expiresAt <= t) {
        this.boxes.delete(name);
        gone++;
      }
    }
    return gone;
  }

  get size(): number {
    return this.boxes.size;
  }
}

/**
 * 길이를 흘리지 않고 견준다. 열쇠 비교에서 `===` 를 쓰면 **틀린 자리**가 시간으로 새어
 * 한 글자씩 맞춰 볼 수 있다.
 */
function safeEqual(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

let shared: TempMailStore | null = null;
export function getTempMailStore(): TempMailStore {
  shared ??= new TempMailStore();
  return shared;
}
