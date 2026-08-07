/**
 * 타임캡슐 — 정한 날 전에는 **아무도 못 여는** 편지 (TASK-KL-134)
 *
 * 이미 있는 것들과 무엇이 다른가 (2026-08-07 조사):
 *  - 국내 서비스는 전부 **맡겼다가 그날 보내 주는** 방식이다(백년의 편지·슬로레터·타임버블 류).
 *    회사가 문을 닫으면 편지도 사라지고, 관리자는 언제든 미리 볼 수 있다.
 *  - 여기서는 **잠긴 편지 자체가 주소**다. 우리 쪽에 아무것도 안 남는다.
 *
 * 그리고 진짜로 잠근다. 날짜로 열쇠를 만들면 시계만 바꿔도 열린다 — 그건 봉인이지 잠금이 아니다.
 * 여기서는 **공개 무작위 시계**(drand)를 쓴다. 그 시계는 정해진 시각이 되어야 그 회차의 값을
 * 세상에 내놓고, 그 값이 있어야만 열쇠가 맞춰진다. 그래서 편지를 가진 사람도, 만든 사람도,
 * 우리도 그 전에는 못 연다. 시계를 앞당겨도 소용없다 — 열쇠가 내 컴퓨터에 없기 때문이다.
 *
 * 대신 기댈 곳이 하나 생긴다: 그 공개 시계가 계속 돌아야 열린다. 그래서 화면에 그 사실을 적는다.
 */
import { timelockEncrypt, timelockDecrypt, mainnetClient, roundAt, Buffer } from 'tlock-js';

/* 이 라이브러리는 안쪽에서 Node 의 바이트 상자(Buffer)를 그대로 부른다 — 브라우저엔 없다.
 * 라이브러리가 같이 주는 대체품을 전역에 놓아 준다(없을 때만). */
if (!(globalThis as unknown as { Buffer?: unknown }).Buffer) {
  (globalThis as unknown as { Buffer: unknown }).Buffer = Buffer;
}

(function (): void {
  const MAX_LETTER = 1200; // 주소에 담아야 하므로 — 이보다 길면 링크가 메신저에서 잘린다

  function toBase64Url(bytes: Uint8Array): string {
    let bin = '';
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(code: string): Uint8Array {
    const norm = code.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(norm.padEnd(Math.ceil(norm.length / 4) * 4, '='));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }

  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** 남은 시간을 사람 말로. */
  function 남은말(ms: number): string {
    if (ms <= 0) return '지금';
    const 분 = Math.floor(ms / 60000);
    const 시 = Math.floor(분 / 60);
    const 일 = Math.floor(시 / 24);
    if (일 >= 1) return `${일}일 뒤`;
    if (시 >= 1) return `${시}시간 뒤`;
    if (분 >= 1) return `${분}분 뒤`;
    return '곧';
  }

  Toolbox.register({
    id: 'timecapsule',
    title: '타임캡슐 편지',
    category: 'tool',
    desc: '정한 날 전에는 아무도 못 여는 편지를 만듭니다. 맡아 두는 서버가 없어 잠긴 편지 자체가 주소가 됩니다',
    layout: 'wide',
    icon: '<rect x="4" y="9" width="16" height="12" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 9V6.5a4 4 0 0 1 8 0V9" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="12" cy="15" r="1.6" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: '타임캡슐',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '그날까지는 저도 못 봐요. 진짜로요.' });

          const 실린것 = location.hash.match(/c=([A-Za-z0-9_-]+)/);

          container.innerHTML = `
            <div class="tc-make" id="tcMake" style="${실린것 ? 'display:none;' : ''}">
              <div class="field-group">
                <label class="field-label" for="tcText">편지 (${MAX_LETTER}자까지)</label>
                <textarea id="tcText" rows="7" maxlength="${MAX_LETTER}"
                  placeholder="1년 뒤의 나에게. 그때쯤이면 이 걱정이 우스워졌으면 좋겠다."></textarea>
              </div>
              <div class="tool-grid-2">
                <div>
                  <label class="field-label" for="tcWhen">열리는 때</label>
                  <input type="datetime-local" id="tcWhen">
                </div>
                <div>
                  <label class="field-label" for="tcPreset">빠른 선택</label>
                  <select id="tcPreset" aria-label="빠른 선택">
                    <option value="">직접 고르기</option>
                    <option value="0.0035">5분 뒤 (시험용)</option>
                    <option value="1">내일</option>
                    <option value="7">일주일 뒤</option>
                    <option value="30">한 달 뒤</option>
                    <option value="365" selected>1년 뒤</option>
                    <option value="3650">10년 뒤</option>
                  </select>
                </div>
              </div>
              <div style="display:flex; gap:6px; flex-wrap:wrap; margin:var(--space-lg) 0;">
                <button class="btn btn-primary" id="tcSeal">잠그기</button>
              </div>
            </div>

            <div class="tc-out" id="tcOut" style="display:none;"></div>

            <div class="tool-status" id="tcStatus">${
              실린것
                ? '잠긴 편지를 여는 중…'
                : '편지를 적고 열릴 때를 고르면, 그 전에는 아무도 못 여는 주소가 나옵니다.'
            }</div>

            <div class="tc-note">
              열쇠는 <b>공개 무작위 시계</b>가 그날 내놓는 값으로만 맞춰집니다 — 만든 사람도, 받은 사람도,
              이 사이트도 그 전에는 못 엽니다. 컴퓨터 시계를 바꿔도 열리지 않습니다.
              대신 그 공개 시계가 계속 돌아야 열립니다.
            </div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const status = $<HTMLElement>('#tcStatus');
          const out = $<HTMLElement>('#tcOut');
          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };

          let client: ReturnType<typeof mainnetClient> | null = null;
          const 시계 = (): ReturnType<typeof mainnetClient> => {
            if (!client) client = mainnetClient();
            return client;
          };

          /* ── 만들기 ── */
          function 앞당긴날(일수: number): string {
            const d = new Date(Date.now() + 일수 * 86400000);
            const p = (n: number): string => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
          }

          if (!실린것) {
            const preset = $<HTMLSelectElement>('#tcPreset');
            const when = $<HTMLInputElement>('#tcWhen');
            when.value = 앞당긴날(365);
            preset.onchange = () => {
              if (preset.value) when.value = 앞당긴날(Number(preset.value));
            };
            when.oninput = () => {
              preset.value = '';
            };

            $<HTMLButtonElement>('#tcSeal').onclick = async () => {
              const 글 = $<HTMLTextAreaElement>('#tcText').value.trim();
              if (글.length < 2) {
                say('편지를 적어 주세요.', 'error');
                return;
              }
              const 열릴때 = new Date(when.value).getTime();
              if (!열릴때 ||열릴때 <= Date.now() + 60000) {
                say('열리는 때는 지금보다 1분 넘게 뒤여야 합니다.', 'error');
                return;
              }
              try {
                say('잠그는 중… 공개 시계에서 그날의 자리를 받아옵니다.');
                const info = await 시계().chain().info();
                const round = roundAt(열릴때, info);
                const 봉인 = await timelockEncrypt(round, Buffer.from(글, 'utf8') as never, 시계());
                const code = toBase64Url(new TextEncoder().encode(봉인));
                const url = `${location.origin}/karmolab/t/timecapsule/#c=${code}`;
                out.style.display = '';
                out.innerHTML = `
                  <div class="tc-when">${new Date(열릴때).toLocaleString('ko-KR')} 에 열립니다 (${남은말(열릴때 - Date.now())})</div>
                  <div class="tc-share">
                    <input type="text" id="tcUrl" readonly aria-label="잠긴 편지 주소" value="${esc(url)}">
                    <button class="btn btn-primary" id="tcCopy">주소 복사</button>
                  </div>
                  <div class="tc-hint">이 주소가 편지 그 자체입니다 — 잃어버리면 편지도 사라집니다. 우리 쪽에는 아무것도 안 남습니다.</div>
                `;
                $<HTMLButtonElement>('#tcCopy').onclick = () => {
                  void Toolbox.copyText?.(url, { message: '주소를 복사했어요' });
                  Toolbox.trackUse?.('share');
                };
                say('잠갔습니다. 그날까지는 아무도 못 엽니다.', 'ok');
                Toolbox.trackUse?.('seal');
              } catch (e) {
                say('잠그지 못했어요: ' + (e instanceof Error ? e.message : String(e)), 'error');
              }
            };
          }

          /* ── 열기 ── */
          if (실린것) {
            void (async () => {
              try {
                const 봉인 = new TextDecoder().decode(fromBase64Url(실린것[1]));
                const 글 = await timelockDecrypt(봉인, 시계());
                out.style.display = '';
                out.innerHTML = `<div class="tc-letter">${esc(글.toString('utf8'))}</div>`;
                say('열렸습니다.', 'ok');
                Toolbox.trackUse?.('open');
              } catch (e) {
                const 말 = e instanceof Error ? e.message : String(e);
                // 아직 때가 아니면 라이브러리가 「몇 회차에 열린다」를 말해 준다 — 그걸 날짜로 바꿔 보여 준다.
                const m = 말.match(/round\s*(\d+)/i);
                if (m) {
                  try {
                    const info = await 시계().chain().info();
                    const 열릴때 = (Number(info.genesis_time) + Number(m[1]) * Number(info.period)) * 1000;
                    out.style.display = '';
                    out.innerHTML = `<div class="tc-locked">🔒<div class="tc-when">${new Date(열릴때).toLocaleString('ko-KR')} 에 열립니다</div><div class="tc-remain">${남은말(열릴때 - Date.now())}</div></div>`;
                    say('아직 열 때가 아닙니다. 그때 이 주소를 다시 열면 됩니다.');
                    return;
                  } catch {
                    /* 회차를 날짜로 못 바꿔도 아래 안내로 충분하다 */
                  }
                }
                say('아직 열 때가 아니거나, 주소가 온전하지 않습니다. (' + 말.slice(0, 80) + ')', 'error');
              }
            })();
          }
        }
      }
    ]
  });
})();
