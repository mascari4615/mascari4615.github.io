/**
 * 잠깐 쓰는 메일. 이음새 (TASK-KL-339 / 흡혈 원장 3, 50)
 *
 * 화면이 없다. 어디에 묻고, 무엇을 들고 있고, 사람에게 어떻게 말할지만 담는다.
 *
 * ★ 열쇠는 **브라우저에만** 산다. 주소는 남에게 줘야 쓸모가 있는 물건이라, 읽는 권한을
 * 주소가 아니라 열쇠에 뒀다(`burnnote` 와 같은 정신). 그래서 이 파일이 열쇠를 어디에
 * 두느냐가 곧 사생활이다. `sessionStorage` 에 둔다: 탭을 닫으면 같이 사라진다.
 *
 * ★ 아직 안 켜졌을 수 있다. 편지를 받는 문(Cloudflare Email Routing)은 사람이 대시보드에서
 * 켜야 한다. 그때까지 도구는 **거짓말 대신 그 사실을 말한다**. 주소만 그럴듯하게 내주고
 * 편지가 영영 안 오는 게 제일 나쁘다.
 */
import { t } from './i18n';

const RELAY = 'https://yawnbot.mascari4615.com/kl/mail';
const KEEP = 'karmolab_tempmail_v1';

export interface Letter {
  id: string;
  from: string;
  subject: string;
  text: string;
  at: number;
}

export interface Mailbox {
  address: string;
  name: string;
  token: string;
  expiresAt: number;
}

export interface Ready {
  ready: boolean;
  domain: string;
  defaultTtlMs: number;
  maxTtlMs: number;
}

/** 고를 수 있는 수명. 분으로 말한다. 사람이 세는 단위다. */
export const TTL_CHOICES = [10, 30, 60];

/** 뒷단이 편지를 받을 준비가 됐나. 못 물으면 `null`. 안 켜졌다와 못 물었다는 다르다. */
export async function askReady(): Promise<Ready | null> {
  try {
    const res = await fetch(`${RELAY}/ready`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as Ready;
  } catch (_) {
    return null;
  }
}

/** 새 주소. 열쇠는 이 답에서 **한 번만** 온다. 그래서 받자마자 챙겨 둔다. */
export async function openBox(minutes: number): Promise<Mailbox | null> {
  try {
    const res = await fetch(`${RELAY}/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttlMs: Math.round(minutes * 60 * 1000) })
    });
    if (!res.ok) return null;
    const got = (await res.json()) as Mailbox;
    if (typeof got.address !== 'string' || typeof got.token !== 'string') return null;
    keep(got);
    return got;
  } catch (_) {
    return null;
  }
}

/**
 * 편지 보기. 열쇠는 **헤더로** 보낸다. 주소줄에 실으면 기록, 로그에 남는다.
 * 못 읽으면 `null`(사라졌거나 열쇠가 틀림. 뒷단이 둘을 구별해 주지 않는다. 그게 맞다).
 */
export async function readBox(box: Mailbox): Promise<Letter[] | null> {
  try {
    const res = await fetch(`${RELAY}/box/${encodeURIComponent(box.name)}`, {
      headers: { 'X-KL-Mail-Token': box.token },
      cache: 'no-store'
    });
    if (!res.ok) return null;
    const got = (await res.json()) as { letters?: Letter[] };
    return Array.isArray(got.letters) ? got.letters : [];
  } catch (_) {
    return null;
  }
}

/** 미리 버리기. 실패해도 화면에서는 놓는다. 어차피 수명이 지나면 사라진다. */
export async function dropBox(box: Mailbox): Promise<void> {
  try {
    await fetch(`${RELAY}/box/${encodeURIComponent(box.name)}`, {
      method: 'DELETE',
      headers: { 'X-KL-Mail-Token': box.token }
    });
  } catch (_) {
    /* 못 버려도 수명이 치운다 */
  }
  forget();
}

/**
 * 열쇠를 챙겨 두는 자리. **`sessionStorage`** 다. 탭을 닫으면 같이 사라진다.
 * `localStorage` 에 두면 임시 주소의 열쇠가 몇 달 뒤에도 그 기계에 남는다.
 */
export function keep(box: Mailbox): void {
  try {
    sessionStorage.setItem(KEEP, JSON.stringify(box));
  } catch (_) {
    /* 못 챙겨도 도구는 돈다. 새로고침하면 주소를 다시 만들 뿐이다 */
  }
}

export function recall(now = Date.now()): Mailbox | null {
  try {
    const raw = sessionStorage.getItem(KEEP);
    if (raw === null) return null;
    const box = JSON.parse(raw) as Mailbox;
    /* 이미 지난 주소를 되살리면 편지가 안 온다로 보인다. 지난 건 없는 것과 같다. */
    if (typeof box.expiresAt !== 'number' || box.expiresAt <= now) return null;
    return box;
  } catch (_) {
    return null;
  }
}

export function forget(): void {
  try {
    sessionStorage.removeItem(KEEP);
  } catch (_) {
    /* 없으면 없는 대로 */
  }
}

/**
 * 남은 시간을 사람 말로. **0 초는 곧이 아니라 끝**이라고 말해야 한다 . 
 * 곧 사라집니다가 몇 분째 떠 있으면 그건 시계가 아니라 장식이다.
 */
export function leftSay(expiresAt: number, now = Date.now()): string {
  const ms = expiresAt - now;
  if (ms <= 0) return t('tempmail.left.gone', undefined, '사라졌습니다');
  const sec = Math.round(ms / 1000);
  if (sec < 60) return t('tempmail.left.sec', { n: sec }, `${sec}초 남음`);
  return t('tempmail.left.min', { n: Math.ceil(sec / 60) }, `${Math.ceil(sec / 60)}분 남음`);
}

/** 편지 한 줄 미리보기. 줄바꿈을 눌러 한 줄로. 길면 자른다. */
export function preview(text: string, max = 90): string {
  const one = String(text ?? '').replace(/\s+/g, ' ').trim();
  return one.length > max ? one.slice(0, max) + '...' : one;
}

/**
 * 편지에서 **확인 코드**를 뽑는다.
 *
 * 이 도구를 쓰는 이유의 열에 아홉이 그거다. 6자리 언저리 숫자, 영숫자 덩어리를 찾아
 * 맨 위에 크게 보여 주면, 사람이 편지를 읽을 일조차 없다.
 * 못 찾으면 `null`. **아무거나 골라 주는 게 제일 나쁘다**(틀린 코드를 붙여 넣게 된다).
 */
export function codeIn(text: string): string | null {
  const body = String(text ?? '');
  /* 코드 같아 보이는 것: 4~8자리 숫자, 또는 대문자, 숫자가 섞인 5~8자 덩어리. */
  const hits = body.match(/\b\d{4,8}\b|\b(?=[A-Z0-9]{5,8}\b)(?=.*\d)[A-Z0-9]{5,8}\b/g);
  if (hits === null || hits.length === 0) return null;
  /* 여럿이면 **가장 긴 것**. 짧은 쪽은 연도, 시각일 때가 많다. */
  return hits.slice().sort((a, b) => b.length - a.length)[0];
}
