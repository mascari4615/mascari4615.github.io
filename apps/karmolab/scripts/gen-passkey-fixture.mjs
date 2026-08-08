/**
 * 진짜 브라우저가 만든 패스키를 **떠 온다** (TASK-KL-191 축5).
 *
 * 패스키 검증은 우리가 직접 짰다(CBOR 해독 · COSE→DER · ES256 확인). 그런데 지금까지의 시험은
 * **우리가 노드에서 만든 자료**로 우리 코드를 검사했다 — 만드는 쪽과 읽는 쪽이 같은 가정을
 * 공유하면 둘 다 틀려도 초록이다. 실제로 그 부류의 사고를 여러 번 봤다.
 *
 * 사람 손가락은 자동화할 수 없다. 대신 **크롬의 가상 인증기**(CDP `WebAuthn` 도메인)를 쓴다 —
 * 이건 흉내가 아니라 크롬이 진짜 WebAuthn 규격대로 만들어 주는 자료다. 브라우저가 만든 것을
 * 떠 두고, 서버 시험이 그걸 읽는다.
 *
 * 여기서 이미 하나 배웠다: 127.0.0.1 에서는 rpId 가 `127.0.0.1` 이어야 한다. 우리 기본값
 * (`blog.mascari4615.com`)으로는 로컬에서 **절대 통과하지 못한다** — 배포해야만 확인되는
 * 기능이었다는 뜻이다.
 *
 * 사용: URL=http://127.0.0.1:8813/apps/karmolab/index.html node scripts/gen-passkey-fixture.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(
  ROOT,
  '../discord-bots/apps/yawnbot/src/services/__fixtures__/passkey-chrome.json',
);
const TARGET = process.env.URL || 'http://127.0.0.1:8813/apps/karmolab/index.html';
const origin = new URL(TARGET).origin;
const rpId = new URL(TARGET).hostname;

const b64url = (buf) => Buffer.from(buf).toString('base64url');

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30000 });

const cdp = await context.newCDPSession(page);
await cdp.send('WebAuthn.enable');
const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: {
    protocol: 'ctap2',
    transport: 'internal',
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
});

const registerChallenge = b64url(crypto.randomBytes(32));
const register = await page.evaluate(
  async ([challenge, rp, name]) => {
    const dec = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const enc = (b) =>
      btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: dec(challenge),
        rp: { id: rp, name },
        user: { id: new Uint8Array([1, 2, 3, 4]), name: 'probe', displayName: '검사' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: { userVerification: 'required' },
        timeout: 20000,
      },
    });
    return {
      id: cred.id,
      clientDataJSON: enc(cred.response.clientDataJSON),
      attestationObject: enc(cred.response.attestationObject),
    };
  },
  [registerChallenge, rpId, 'KarmoLab'],
);

const assertChallenge = b64url(crypto.randomBytes(32));
const assertion = await page.evaluate(
  async ([challenge, rp, credentialId]) => {
    const dec = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const enc = (b) =>
      btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const cred = await navigator.credentials.get({
      publicKey: {
        challenge: dec(challenge),
        rpId: rp,
        allowCredentials: [{ type: 'public-key', id: dec(credentialId) }],
        userVerification: 'required',
        timeout: 20000,
      },
    });
    return {
      id: cred.id,
      clientDataJSON: enc(cred.response.clientDataJSON),
      authenticatorData: enc(cred.response.authenticatorData),
      signature: enc(cred.response.signature),
    };
  },
  [assertChallenge, rpId, register.id],
);

await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
await browser.close();

const fixture = {
  note: '크롬 가상 인증기(CDP WebAuthn)가 만든 것. 손으로 지어낸 값이 아니다 — scripts/gen-passkey-fixture.mjs 로 다시 뜬다.',
  madeAt: new Date().toISOString(),
  rpId,
  origin,
  register: { challenge: registerChallenge, ...register },
  assert: { challenge: assertChallenge, ...assertion },
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(fixture, null, 2) + '\n', 'utf-8');
console.log(`✅ 진짜 브라우저가 만든 패스키를 떴다 → ${path.relative(ROOT, OUT)}`);
console.log(`   rpId ${rpId} · origin ${origin} · 자격증명 ${register.id.slice(0, 12)}…`);
