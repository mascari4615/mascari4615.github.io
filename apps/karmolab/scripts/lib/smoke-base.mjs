/**
 * **화면 검사가 잴 자리 — 한 곳** (2026-08-14)
 *
 * 오락실 검사 여덟이 저마다 같은 여섯 줄을 복사해 갖고 있었다:
 *
 * ```js
 * let BASE = process.env.ARCADE_BASE || 'http://127.0.0.1:8813';
 * if (!(await fetch(`${BASE}/…`).then(r => r.ok).catch(() => false))) { … serveRepo() … }
 * ```
 *
 * 「사람이 켠 dev 서버가 있으면 그걸 쓴다」는 편의였는데, 이것이 **로컬 통과의 뜻을 없앴다.**
 * dev 서버는 `/karmolab/…` 을 앱으로 이어 주고 검사용 서버는 저장소 파일을 그대로 내준다 —
 * 그래서 내 자리와 CI 가 **다른 것을 재고** 있었다. 편지 검사가 CI 에서만 60초씩 서던 날,
 * 나는 그 차이를 모르고 맞는 가설을 「로컬에서 통과하니까」로 버렸다(2026-08-14).
 *
 * 그래서 규칙을 하나로 못 박는다: **시키지 않으면 언제나 자기 서버를 띄운다.**
 * dev 서버에 대고 재고 싶으면 그렇게 *말해야* 한다 — `ARCADE_BASE=http://127.0.0.1:8813`.
 *
 * 쓰는 법:
 *   const { base, close } = await smokeBase();
 *   …
 *   await close();
 */
import { serveRepo } from './serve-static.mjs';

export async function smokeBase(envName = 'ARCADE_BASE') {
  const told = process.env[envName];
  if (told) return { base: told.replace(/\/$/, ''), close: async () => {} };
  const s = await serveRepo();
  return { base: s.base, close: async () => s.close() };
}
