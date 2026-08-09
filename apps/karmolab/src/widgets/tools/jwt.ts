/**
 * JWT 디코더 (TASK-KL-088)
 *
 * JWT 는 암호화가 아니라 **서명된 평문**이라 누구나 읽을 수 있다 — 그 사실 자체가
 * 이 도구의 핵심 교육 포인트라서 화면에 적어 둔다. 만료 시각은 숫자(epoch)로 오기 때문에
 * 사람이 읽을 시각과 「지금 유효한가」 판정까지 붙여야 실제로 쓸모가 있다.
 * 서명 검증은 비밀키가 필요해 브라우저에서 하지 않는다 (키를 웹에 붙여 넣게 하면 안 된다).
 */
import { t, loadNamespace, locale } from '../../lib/i18n';

(function (): void {
  /** JWT 는 URL-safe base64 라 표준 base64 로 되돌린 뒤 디코딩한다. */
  function b64urlDecode(part: string): string {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const bin = atob(b64);
    // atob 은 바이트열을 주므로 UTF-8 로 다시 해석해야 한글이 안 깨진다.
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  /* 이름표는 **쓸 때** 붙인다 — 표로 굳히면 그 시점엔 말 묶음이 아직 안 와서 한국어로 박힌다. */
  const TIME_CLAIMS = ['exp', 'iat', 'nbf'];
  const CLAIMS = ['iss', 'sub', 'aud', 'jti', 'scope', 'alg', 'typ', 'kid'];

  /** 남은 시간은 **Intl 이 그 언어로 적어 준다** — 「분/시간/일」을 언어마다 적을 필요가 없다. */
  function humanGap(ms: number): string {
    const mins = Math.round(Math.abs(ms) / 60000);
    const [n, unit]: [number, Intl.NumberFormatOptions['unit']] =
      mins < 60 ? [mins, 'minute'] : mins < 1440 ? [Math.round(mins / 60), 'hour'] : [Math.round(mins / 1440), 'day'];
    return new Intl.NumberFormat(locale(), { style: 'unit', unit, unitDisplay: 'long' }).format(n);
  }

  Toolbox.register({
    id: 'jwt',
    title: t('widgets.jwt.title', undefined, 'JWT 디코더'),
    category: 'tool',
    desc: t(
      'widgets-desc.jwt.desc',
      undefined,
      'JWT 토큰의 헤더·페이로드를 풀어 보고 만료 시각과 남은 시간을 확인합니다'
    ),
    layout: 'wide',
    icon: '<path d="M12 3v18M12 7 5.5 9.5M12 7l6.5 2.5M12 15l-6.5-2.5M12 15l6.5-2.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: t('jwt.tab', undefined, '디코드'),
        build: function (container: HTMLElement): void {
          void loadNamespace('jwt').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에 — 이름표도 남은 시간도 전부 그때 정해진다. */
  function draw(container: HTMLElement): void {
          const esc = (v: string): string =>
            v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('jwt.label.input'))}</label>
              <textarea id="jwIn" rows="4" spellcheck="false" placeholder="${esc(t('jwt.ph.input'))}"></textarea>
            </div>

            <div id="jwHeadWrap" style="display:none;">
              <label class="field-label">${esc(t('jwt.label.head'))}</label>
              <div class="tool-list" id="jwHead"></div>
            </div>

            <div id="jwBodyWrap" style="display:none; margin-top:var(--space-lg);">
              <label class="field-label">${esc(t('jwt.label.body'))}</label>
              <div class="tool-list" id="jwBody"></div>
            </div>

            <div id="jwRawWrap" style="display:none; margin-top:var(--space-lg);">
              <label class="field-label">${esc(t('jwt.label.raw'))}</label>
              <textarea id="jwRaw" aria-label="${esc(t('jwt.aria.raw'))}" rows="8" spellcheck="false" readonly></textarea>
            </div>

            <div class="tool-status" id="jwStatus">${esc(t('jwt.status.plain'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLTextAreaElement>('#jwIn');
          const status = $<HTMLElement>('#jwStatus');

          function row(k: string, v: string, note = ''): string {
            return `<div class="tool-list-row"><span class="tool-list-key">${esc(k)}${
              note ? `<span class="tool-list-dim" style="display:block;">${esc(note)}</span>` : ''
            }</span><span class="tool-list-val" style="word-break:break-all;">${esc(v)}</span></div>`;
          }

          function renderClaims(obj: Record<string, unknown>, el: HTMLElement): void {
            el.innerHTML = Object.keys(obj)
              .map((k) => {
                const v = obj[k];
                if (TIME_CLAIMS.includes(k) && typeof v === 'number') {
                  const d = new Date(v * 1000);
                  const diff = v * 1000 - Date.now();
                  const human = humanGap(diff);
                  const tail =
                    k === 'exp'
                      ? t(diff > 0 ? 'jwt.exp.left' : 'jwt.exp.gone', { d: human })
                      : t(diff > 0 ? 'jwt.time.after' : 'jwt.time.before', { d: human });
                  return row(k, d.toLocaleString(locale()) + tail, t(`jwt.time.${k}`));
                }
                return row(
                  k,
                  typeof v === 'object' ? JSON.stringify(v) : String(v),
                  CLAIMS.includes(k) ? t(`jwt.claim.${k}`) : ''
                );
              })
              .join('');
          }

          function run(): void {
            const raw = input.value.trim().replace(/^Bearer\s+/i, '');
            const wraps = ['#jwHeadWrap', '#jwBodyWrap', '#jwRawWrap'];
            if (!raw) {
              wraps.forEach((s) => ($<HTMLElement>(s).style.display = 'none'));
              status.textContent = t('jwt.status.plain');
              status.className = 'tool-status';
              return;
            }
            const parts = raw.split('.');
            if (parts.length < 2) {
              wraps.forEach((s) => ($<HTMLElement>(s).style.display = 'none'));
              status.textContent = t('jwt.err.shape');
              status.className = 'tool-status error';
              return;
            }
            let head: Record<string, unknown>;
            let body: Record<string, unknown>;
            try {
              head = JSON.parse(b64urlDecode(parts[0]));
              body = JSON.parse(b64urlDecode(parts[1]));
            } catch {
              wraps.forEach((s) => ($<HTMLElement>(s).style.display = 'none'));
              status.textContent = t('jwt.err.decode');
              status.className = 'tool-status error';
              return;
            }

            wraps.forEach((s) => ($<HTMLElement>(s).style.display = ''));
            renderClaims(head, $<HTMLElement>('#jwHead'));
            renderClaims(body, $<HTMLElement>('#jwBody'));
            $<HTMLTextAreaElement>('#jwRaw').value =
              JSON.stringify(head, null, 2) + '\n\n' + JSON.stringify(body, null, 2);

            const exp = typeof body.exp === 'number' ? body.exp * 1000 : null;
            if (exp === null) {
              status.textContent = t('jwt.status.noExp');
              status.className = 'tool-status';
            } else if (exp < Date.now()) {
              status.textContent = t('jwt.status.expired');
              status.className = 'tool-status error';
            } else {
              status.textContent = t('jwt.status.valid');
              status.className = 'tool-status ok';
            }
            Toolbox.trackUse?.('decode');
          }

          input.addEventListener('input', run);
  }
})();
