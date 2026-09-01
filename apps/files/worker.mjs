/**
 * files.mascari4615.com Cloudflare Worker 정본.
 * 화면 = Pages /files/ 프록시. 클라우드 암호문 = R2 바인딩 VAULT → /blob/<key>
 *
 * 내줄 키의 규칙은 `src/blob-key.mjs` 다. 여기 정규식으로 박혀 있던 것을 옮겼다.
 * 미리보기(`t/<id>`)를 새로 담은 날 그 줄을 같이 안 고쳐 전부 400 이 될 뻔했다 (2026-08-29).
 *
 * 캐시: 청크(`c/<id>/<n>`)와 미리보기(`t/<id>`)는 **한 번 쓰이면 안 바뀐다**. 같은 자리에 다른 내용이 오지 않는다
 * (내용이 달라지면 새 id 를 받는다). 그래서 오래 잡아 둔다. 반대로 `hdr`, `idx` 는 파일이
 * 늘 때마다 바뀌므로 매번 물어본다. 전에는 셋 다 60초여서, 액자를 다시 열 때마다 그림을
 * 통째로 다시 받아 왔다 (2026-08-29 사용자 관측: 매번 새로 받는 것 같다).
 * 어느 쪽이든 `private` 이다. 중간 캐시(CDN, 프록시)가 남의 암호문을 들고 있으면 안 된다.
 * VAULT 가 없으면 /blob 은 503. **없는 키는 404 다**. 딴 데서 가져와 채우지 않는다.
 *
 * ★ 예전에는 키가 비면 Pages `v/` 픽스처를 R2 에 **써 넣었다**(데모용). 그 한 줄이
 *   2026-08-28 사고를 냈다: 아직 hdr 이 안 올라간 사이에 화면이 `/blob/hdr` 을 한 번
 *   부르자, 픽스처의 hdr(딴 소금)이 R2 에 굳어 버렸다. 그 뒤 진짜 청크, 색인이 다 채워져도
 *   **맞는 비밀번호로 영영 안 열렸다**. 소금이 다르면 열쇠가 딴 값으로 유도되기 때문이다.
 *   빈 칸을 남의 것으로 메우는 편의는, 그 자리가 열쇠 재료일 때 데이터를 통째로 잠근다.
 *
 * CF: 이 파일을 Worker `files` 에 붙이고 R2 버킷을 VAULT 로 바인딩.
 * img.mascari4615.com 공개 버킷에 클라우드를 넣지 마.
 */
import { allowedKey, immutableKey, writableKey } from './src/blob-key.mjs';

const PAGES = 'https://blog.mascari4615.com/files';
const LAPTOP = 'https://laptop.mascari4615.com';

/** 휴지통은 경로 목록뿐이다. 이보다 크면 뭔가 잘못된 것이다 */
const TRASH_MAX = 2 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/pc-api' || url.pathname.startsWith('/pc-api/')) {
      const path = url.pathname.replace(/^\/pc-api/, '') || '/';
      const upstream = new URL(path + url.search, LAPTOP);
      return fetch(upstream, {
        method: request.method,
        headers: request.headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? null : request.body,
        redirect: 'manual',
      });
    }
    if (url.pathname === '/blob' || url.pathname.startsWith('/blob/')) {
      const key = decodeURIComponent(url.pathname.replace(/^\/blob\/?/, ''));
      if (!allowedKey(key)) {
        return new Response('bad key', { status: 400 });
      }
      if (!env || !env.VAULT) return new Response('no vault', { status: 503 });

      /* 화면에서 오는 유일한 쓰기. 휴지통 표시뿐이다.
         Access 뒤라 인증은 이미 걸려 있고, 여기서는 **무엇을** 쓸 수 있나만 좁힌다. */
      if (request.method === 'PUT') {
        if (!writableKey(key)) return new Response('read only', { status: 405 });
        const len = Number(request.headers.get('content-length') || 0);
        if (len > TRASH_MAX) return new Response('too big', { status: 413 });
        /* 덮기 전에 이전 판을 남긴다. 잘못 쓰면 이것으로 되돌린다 */
        const cur = await env.VAULT.get(key);
        if (cur) await env.VAULT.put(key + '.bak', cur.body);
        await env.VAULT.put(key, request.body);
        return new Response(null, { status: 204 });
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('read only', { status: 405 });
      }

      const obj = await env.VAULT.get(key);
      if (!obj) return new Response('missing', { status: 404 });
      const immutable = immutableKey(key);
      return new Response(obj.body, {
        headers: {
          'content-type': 'application/octet-stream',
          'cache-control': immutable
            ? 'private, max-age=31536000, immutable'
            : 'private, no-cache',
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
