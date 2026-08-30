/**
 * Cloudflare Email Worker. 온 편지를 우리 뒷단으로 넘긴다 (TASK-KL-339).
 *
 * Cloudflare 가 `*@mail.mascari4615.com` 으로 온 편지를 이 함수에 준다. 여기가 하는 일은
 * **읽어서 넘기는 것뿐**이다. 보관도, 판단도, 답장도 안 한다. 그래야 이 자리에서 틀릴 수
 * 있는 게 못 넘겼다 하나로 줄어든다.
 *
 * ★ 첨부는 안 넘긴다. 임시 주소로 오는 파일을 우리가 보관할 이유가 없고, 넘기는 순간
 * 그건 우리 곳간의 문제가 된다.
 *
 * ── 사용자가 할 것 (대시보드, 한 번) ────────────────────────────────────────
 *  1. Cloudflare → 도메인 `mascari4615.com` → **Email** → Email Routing **활성화**
 *     (MX, SPF 레코드는 Cloudflare 가 자동으로 넣는다)
 *  2. **Workers & Pages → Create → Worker** 로 이 파일 내용을 붙여 넣고 배포
 *     (이름 예: `kl-mail-in`)
 *  3. 그 Worker → **Settings → Variables** 에 둘을 넣는다
 *       KL_MAIL_ENDPOINT = https://yawnbot.mascari4615.com/kl/mail/in
 *       KL_MAIL_HOOK     = (아무 긴 임의 문자열. 노트북 yawnbot 의 KL_MAIL_HOOK_TOKEN 과 같은 값)
 *  4. Email → **Routing rules → Catch-all address** → Action = **Send to a Worker** → `kl-mail-in`
 *  5. 노트북 yawnbot 의 `.env` 에 같은 값을 넣는다
 *       KL_MAIL_HOOK_TOKEN=...
 *       KL_MAIL_DOMAIN=mail.mascari4615.com
 *
 *  확인: `curl https://yawnbot.mascari4615.com/kl/mail/ready` 가 `{"ready":true,...}` 면 켜진 것이다.
 *  (도구 화면도 그 값을 보고 아직 안 켜졌다를 정직하게 말한다.)
 * ────────────────────────────────────────────────────────────────────────────
 */

/** 본문에서 이만큼만 넘긴다. 뒷단도 같은 상한을 다시 본다. */
const MAX_TEXT = 256 * 1024;

export default {
  /**
   * @param {{ from: string, to: string, headers: Headers, raw: ReadableStream, setReject: (r: string) => void }} message
   * @param {{ KL_MAIL_ENDPOINT?: string, KL_MAIL_HOOK?: string }} env
   */
  async email(message, env) {
    const endpoint = env.KL_MAIL_ENDPOINT;
    const hook = env.KL_MAIL_HOOK;
    /* 설정이 없으면 **아무 것도 안 한다.** 반쯤 붙은 상태에서 편지를 흘리는 것보다,
       안 켜진 채로 조용한 편이 낫다(화면은 `/kl/mail/ready` 로 그 사실을 안다). */
    if (!endpoint || !hook) return;

    const raw = await streamText(message.raw, MAX_TEXT * 2);
    const { subject, text } = parseMail(raw, message.headers);

    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-KL-Mail-Hook': hook },
        body: JSON.stringify({
          to: message.to,
          from: message.from,
          subject,
          text: text.slice(0, MAX_TEXT),
        }),
      });
    } catch (_) {
      /* 못 넘겼으면 그걸로 끝이다. 되돌려 보내기(reject)를 부르지 않는다. 임시 주소는
         이미 사라진 함이 대부분이라, 되돌리기가 남의 메일 서버에 반복해서 부딪힌다. */
    }
  },
};

/** 스트림을 글자로. 상한을 넘으면 거기서 끊는다. 무제한으로 읽으면 워커가 죽는다. */
async function streamText(stream, limit) {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * 아주 작은 편지 뜯개. 제목과 **글자 본문**만 꺼낸다.
 *
 * 온전한 MIME 파서를 안 쓰는 이유: 여기서 필요한 것은 사람이 눈으로 확인 코드를 읽는 것
 * 뿐이다. 다중 파트 편지면 첫 번째 글자 파트를 쓰고, 없으면 HTML 파트를 글자로 눌러 쓴다.
 * 그것도 없으면 통째로 넘긴다. **빈 편지보다 지저분한 편지가 낫다.**
 */
export function parseMail(raw, headers) {
  const subject = decodeHeader(headers?.get?.('subject') ?? matchHeader(raw, 'subject'));
  const split = raw.indexOf('\r\n\r\n') >= 0 ? raw.indexOf('\r\n\r\n') + 4 : raw.indexOf('\n\n') + 2;
  const body = split > 1 ? raw.slice(split) : raw;

  const boundary = (matchHeader(raw, 'content-type') || '').match(/boundary="?([^";\r\n]+)"?/i)?.[1];
  if (boundary) {
    const parts = body.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    const plain = parts.find((p) => /content-type:\s*text\/plain/i.test(p));
    if (plain) return { subject, text: decodePart(plain) };
    const html = parts.find((p) => /content-type:\s*text\/html/i.test(p));
    if (html) return { subject, text: stripHtml(decodePart(html)) };
  }
  if (/content-type:\s*text\/html/i.test(raw)) return { subject, text: stripHtml(body) };
  return { subject, text: body };
}

function matchHeader(raw, name) {
  const re = new RegExp(`^${name}:\\s*(.*)$`, 'im');
  return raw.match(re)?.[1]?.trim() ?? '';
}

/** 파트에서 머리말을 떼고, quoted-printable 이면 푼다. */
function decodePart(part) {
  const at = part.indexOf('\r\n\r\n') >= 0 ? part.indexOf('\r\n\r\n') + 4 : part.indexOf('\n\n') + 2;
  let text = at > 1 ? part.slice(at) : part;
  if (/content-transfer-encoding:\s*quoted-printable/i.test(part)) {
    text = text
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }
  return text.trim();
}

/** `=?UTF-8?B?...?=` 꼴 머리말을 푼다. 한국어 제목이 그대로 온다. */
function decodeHeader(value) {
  const v = String(value || '');
  return v.replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_, _cs, kind, data) => {
    try {
      if (kind.toUpperCase() === 'B') return new TextDecoder().decode(base64Bytes(data));
      return data.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (__, h) => String.fromCharCode(parseInt(h, 16)));
    } catch (_) {
      return data;
    }
  });
}

function base64Bytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
