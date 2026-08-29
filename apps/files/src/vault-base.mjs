/**
 * 화면이 집을 암호문 뿌리. `/blob/hdr` 가 있으면 Worker, R2 정본, 없으면 Pages 픽스처.
 * 공개 CDN 에 사적 암호문을 올리지 않는다. 픽스처만 Pages `v/`.
 *
 * ★ **제 도메인도 한 번 물어본다** (2026-08-29). `/blob/` 은 Worker 가 사는
 *   `files.mascari4615.com` 에만 있다. 그런데 이 화면은 Pages 로도 서빙되므로
 *   (`blog.mascari4615.com/files/`), 거기서 열면 제 origin 에는 `/blob/` 이 없어
 *   **픽스처(시험용 금고)로 되떨어졌다**. 맞는 비밀번호를 쳐도 안 열린다.
 *   2026-08-28 에 실제로 그랬고, 사람은 비번을 잊었나로 한참을 봤다.
 *   껍데기가 어디든 암호문은 한 곳이므로, 제 자리에 없으면 그 한 곳을 마저 본다.
 */
const CANONICAL = 'https://files.mascari4615.com';

export async function pickVaultBase({ origin, fixture, fetchFn, canonical = CANONICAL }) {
  const root = String(origin || '').replace(/\/+$/, '');
  const get = fetchFn || fetch;
  const has = async (base) => {
    try {
      const r = await get(base + 'hdr');
      return !!(r && r.ok);
    } catch {
      return false;
    }
  };

  if (root && (await has(root + '/blob/'))) return root + '/blob/';
  /* 제 자리에 없을 때만 정본 도메인을 본다. 이미 그 도메인이면 같은 것을 두 번 묻지 않는다. */
  const away = String(canonical || '').replace(/\/+$/, '');
  if (away && away !== root && (await has(away + '/blob/'))) return away + '/blob/';
  return fixture;
}
