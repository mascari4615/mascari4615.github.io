/**
 * P2P(trystero) 는 방을 열 때만 받는다 (2026-09-02 감사 B2)
 *
 * 로비만 열어도 55KB(최소화 뒤) 가 딸려 와 위젯 천장(gzip 64KB) 초과. 게임 조각과
 * 같은 수법: `arcade/net.js` 가 `window.__ARCADE_NET` 에 `connect` 를 놓고, 여기서 그때 받음.
 * 타입은 `./net` 에서 type 으로만 들여오므로 묶음에 안 실림
 */
import type { connect as Connect } from './net';

type Bag = { __ARCADE_NET?: { connect: typeof Connect } };

let incoming: Promise<typeof Connect> | null = null;

export function ensureNet(): Promise<typeof Connect> {
  const got = (window as unknown as Bag).__ARCADE_NET;
  if (got) return Promise.resolve(got.connect);
  if (incoming) return incoming;
  incoming = new Promise<typeof Connect>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/apps/karmolab/arcade/net.js';
    s.onload = () => {
      const bag = (window as unknown as Bag).__ARCADE_NET;
      if (bag) resolve(bag.connect);
      else {
        incoming = null;
        reject(new Error('[arcade-net] net.js 는 떴는데 connect 가 없다'));
      }
    };
    s.onerror = () => {
      incoming = null;
      reject(new Error('[arcade-net] net.js 를 못 받았다'));
    };
    document.head.appendChild(s);
  });
  return incoming;
}
