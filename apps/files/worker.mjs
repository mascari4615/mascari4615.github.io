/**
 * files.mascari4615.com Cloudflare Worker 정본.
 * 화면 = Pages /files/ 프록시. 금고 암호문 = R2 바인딩 VAULT → /blob/<key>
 * VAULT 가 없으면 /blob 은 503 — 화면은 픽스처 v/ 로 떨어진다.
 *
 * CF: 이 파일을 Worker `files` 에 붙이고 R2 버킷을 VAULT 로 바인딩.
 * img.mascari4615.com 공개 버킷에 금고를 넣지 마.
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
