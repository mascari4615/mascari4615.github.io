/**
 * files.mascari4615.com Cloudflare Worker 정본.
 * 화면 = Pages /files/ 프록시. 클라우드 암호문 = R2 바인딩 VAULT → /blob/<key>
 * VAULT 가 없으면 /blob 은 503. **없는 키는 404 다** — 딴 데서 가져와 채우지 않는다.
 *
 * ★ 예전에는 키가 비면 Pages `v/` 픽스처를 R2 에 **써 넣었다**(데모용). 그 한 줄이
 *   2026-08-28 사고를 냈다: 아직 hdr 이 안 올라간 사이에 화면이 `/blob/hdr` 을 한 번
 *   부르자, 픽스처의 hdr(딴 소금)이 R2 에 굳어 버렸다. 그 뒤 진짜 청크·색인이 다 채워져도
 *   **맞는 비밀번호로 영영 안 열렸다** — 소금이 다르면 열쇠가 딴 값으로 유도되기 때문이다.
 *   빈 칸을 남의 것으로 메우는 편의는, 그 자리가 열쇠 재료일 때 데이터를 통째로 잠근다.
 *
 * CF: 이 파일을 Worker `files` 에 붙이고 R2 버킷을 VAULT 로 바인딩.
 * img.mascari4615.com 공개 버킷에 클라우드를 넣지 마.
 */
const PAGES = 'https://blog.mascari4615.com/files';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/blob' || url.pathname.startsWith('/blob/')) {
      const key = decodeURIComponent(url.pathname.replace(/^\/blob\/?/, ''));
      if (!/^(hdr|idx|c\/[0-9a-f]+\/\d+)$/.test(key)) {
        return new Response('bad key', { status: 400 });
      }
      if (!env || !env.VAULT) return new Response('no vault', { status: 503 });
      const obj = await env.VAULT.get(key);
      if (!obj) return new Response('missing', { status: 404 });
      return new Response(obj.body, {
        headers: {
          'content-type': 'application/octet-stream',
          'cache-control': 'private, max-age=60',
          'x-content-type-options': 'nosniff',
        },
      });
    }
    const path = url.pathname === '/' ? '/' : url.pathname;
    return fetch(PAGES + path, {
      method: request.method,
      headers: request.headers,
    });
  },
};
