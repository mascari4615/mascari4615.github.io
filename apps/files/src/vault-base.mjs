/**
 * 화면이 집을 암호문 뿌리. /blob/hdr 가 있으면 Worker·R2 정본, 없으면 Pages 픽스처.
 * 공개 CDN 에 사적 암호문을 올리지 않는다 — 픽스처만 Pages v/.
 */
export async function pickVaultBase({ origin, fixture, fetchFn }) {
  const root = String(origin || '').replace(/\/+$/, '');
  const get = fetchFn || fetch;
  try {
    const r = await get(root + '/blob/hdr');
    if (r && r.ok) return root + '/blob/';
  } catch {
    /* 없으면 픽스처 */
  }
  return fixture;
}
