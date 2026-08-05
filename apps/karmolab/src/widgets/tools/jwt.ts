/**
 * JWT 디코더 (TASK-KL-088)
 *
 * JWT 는 암호화가 아니라 **서명된 평문**이라 누구나 읽을 수 있다 — 그 사실 자체가
 * 이 도구의 핵심 교육 포인트라서 화면에 적어 둔다. 만료 시각은 숫자(epoch)로 오기 때문에
 * 사람이 읽을 시각과 「지금 유효한가」 판정까지 붙여야 실제로 쓸모가 있다.
 * 서명 검증은 비밀키가 필요해 브라우저에서 하지 않는다 (키를 웹에 붙여 넣게 하면 안 된다).
 */
(function (): void {
  /** JWT 는 URL-safe base64 라 표준 base64 로 되돌린 뒤 디코딩한다. */
  function b64urlDecode(part: string): string {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const bin = atob(b64);
    // atob 은 바이트열을 주므로 UTF-8 로 다시 해석해야 한글이 안 깨진다.
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  const TIME_CLAIMS: Record<string, string> = {
    exp: '만료 시각',
    iat: '발급 시각',
    nbf: '이 시각 전에는 무효'
  };
  const CLAIMS: Record<string, string> = {
    iss: '발급자',
    sub: '주체 (보통 사용자 ID)',
    aud: '대상',
    jti: '토큰 고유 ID',
    scope: '권한 범위',
    alg: '서명 알고리즘',
    typ: '토큰 종류',
    kid: '서명에 쓴 키 ID'
  };

  Toolbox.register({
    id: 'jwt',
    title: 'JWT 디코더',
    category: 'tool',
    desc: 'JWT 토큰의 헤더·페이로드를 풀어 보고 만료 시각과 남은 시간을 확인합니다',
    layout: 'wide',
    icon: '<path d="M12 3v18M12 7 5.5 9.5M12 7l6.5 2.5M12 15l-6.5-2.5M12 15l6.5-2.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: '디코드',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">JWT 토큰</label>
              <textarea id="jwIn" rows="4" spellcheck="false" placeholder="eyJhbGciOi... 형태의 토큰을 붙여 넣으세요"></textarea>
            </div>

            <div id="jwHeadWrap" style="display:none;">
              <label class="field-label">헤더 — 어떻게 서명했는가</label>
              <div class="tool-list" id="jwHead"></div>
            </div>

            <div id="jwBodyWrap" style="display:none; margin-top:var(--space-lg);">
              <label class="field-label">페이로드 — 담긴 내용</label>
              <div class="tool-list" id="jwBody"></div>
            </div>

            <div id="jwRawWrap" style="display:none; margin-top:var(--space-lg);">
              <label class="field-label">원본 JSON</label>
              <textarea id="jwRaw" rows="8" spellcheck="false" readonly></textarea>
            </div>

            <div class="tool-status" id="jwStatus">JWT 는 암호화가 아니라 서명된 평문입니다 — 토큰을 가진 사람은 누구나 내용을 읽을 수 있습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLTextAreaElement>('#jwIn');
          const status = $<HTMLElement>('#jwStatus');
          const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

          function row(k: string, v: string, note = ''): string {
            return `<div class="tool-list-row"><span class="tool-list-key">${esc(k)}${
              note ? `<span class="tool-list-dim" style="display:block;">${esc(note)}</span>` : ''
            }</span><span class="tool-list-val" style="word-break:break-all;">${esc(v)}</span></div>`;
          }

          function renderClaims(obj: Record<string, unknown>, el: HTMLElement): void {
            el.innerHTML = Object.keys(obj)
              .map((k) => {
                const v = obj[k];
                if (TIME_CLAIMS[k] && typeof v === 'number') {
                  const d = new Date(v * 1000);
                  const diff = v * 1000 - Date.now();
                  const mins = Math.round(Math.abs(diff) / 60000);
                  const human =
                    mins < 60 ? `${mins}분` : mins < 1440 ? `${Math.round(mins / 60)}시간` : `${Math.round(mins / 1440)}일`;
                  const tail = k === 'exp' ? (diff > 0 ? ` · ${human} 남음` : ` · ${human} 전에 만료됨`) : ` · ${human} ${diff > 0 ? '후' : '전'}`;
                  return row(k, d.toLocaleString('ko-KR') + tail, TIME_CLAIMS[k]);
                }
                return row(k, typeof v === 'object' ? JSON.stringify(v) : String(v), CLAIMS[k] || '');
              })
              .join('');
          }

          function run(): void {
            const raw = input.value.trim().replace(/^Bearer\s+/i, '');
            const wraps = ['#jwHeadWrap', '#jwBodyWrap', '#jwRawWrap'];
            if (!raw) {
              wraps.forEach((s) => ($<HTMLElement>(s).style.display = 'none'));
              status.textContent = 'JWT 는 암호화가 아니라 서명된 평문입니다 — 토큰을 가진 사람은 누구나 내용을 읽을 수 있습니다.';
              status.className = 'tool-status';
              return;
            }
            const parts = raw.split('.');
            if (parts.length < 2) {
              wraps.forEach((s) => ($<HTMLElement>(s).style.display = 'none'));
              status.textContent = 'JWT 형태가 아니에요. 점(.)으로 나뉜 세 조각이어야 합니다.';
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
              status.textContent = '조각을 풀지 못했어요. 토큰이 잘렸거나 형식이 다릅니다.';
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
              status.textContent = '만료 시각(exp)이 없는 토큰입니다. 서명 검증은 비밀키가 필요해 여기서 하지 않습니다.';
              status.className = 'tool-status';
            } else if (exp < Date.now()) {
              status.textContent = '이미 만료된 토큰입니다.';
              status.className = 'tool-status error';
            } else {
              status.textContent = '아직 유효한 토큰입니다 (서명은 검증하지 않았습니다).';
              status.className = 'tool-status ok';
            }
            Toolbox.trackUse?.('decode');
          }

          input.addEventListener('input', run);
        }
      }
    ]
  });
})();
