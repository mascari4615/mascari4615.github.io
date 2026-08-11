/**
 * storage-health.ts — 저장 공간이 언제 터질지 미리 말해 주기 (TASK-KL-202 격차 Y).
 *
 * 이 도구는 전부 브라우저 안(localStorage)에 넣는다. 그런데 그 칸은 **한 출처에 5MB 남짓**이고,
 * 노드에 사진을 몇 장 붙이면 금세 찬다. 넘치는 순간 저장이 조용히 실패하면 사람은
 * **한참 그린 뒤에** 그 사실을 안다 — 이 도구에서 가장 나쁜 실패다.
 *
 * 그래서 두 가지를 한다:
 * - 지금 얼마나 쓰는지 **맵별로** 보여 준다(무엇이 무거운지 알아야 지울 수 있다).
 * - 위험선(80%)을 넘으면 **먼저 말한다**.
 *
 * `navigator.storage.estimate()` 는 IndexedDB·Cache 몫이라 localStorage 를 안 센다 —
 * 그래서 우리 열쇠들의 글자 수를 직접 잰다(대략 UTF-16 이라 글자당 2바이트로 본다).
 */
import { t } from '../../lib/i18n';


export const WEB_STORAGE_BUDGET = 5 * 1024 * 1024;
export const WARN_RATIO = 0.8;

export interface StorageReport {
  /** 우리 것만 합친 바이트(추정). */
  used: number;
  budget: number;
  ratio: number;
  warn: boolean;
  /** 무거운 순으로 정렬한 열쇠별 크기. */
  items: { key: string; bytes: number }[];
}

function bytesOf(value: string): number {
  return value.length * 2;   // UTF-16 기준 대략치
}

/** `prefix` 로 시작하는 열쇠들의 크기. 남의 도구 몫은 세지 않는다. */
export function measureStorage(prefix = 'karmograph.'): StorageReport {
  const items: { key: string; bytes: number }[] = [];
  let used = 0;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const v = localStorage.getItem(key) ?? '';
      const bytes = bytesOf(v) + bytesOf(key);
      used += bytes;
      items.push({ key, bytes });
    }
  } catch (e) {
    console.error(t('karmograph.t436'), e);
  }
  items.sort((a, b) => b.bytes - a.bytes);
  const ratio = used / WEB_STORAGE_BUDGET;
  return { used, budget: WEB_STORAGE_BUDGET, ratio, warn: ratio >= WARN_RATIO, items };
}

/** 사람이 읽는 크기. */
export function humanBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
