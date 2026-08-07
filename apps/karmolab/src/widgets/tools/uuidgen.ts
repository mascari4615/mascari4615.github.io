/**
 * UUID / 랜덤 ID 생성기 (TASK-KL-088)
 * 난수는 crypto.getRandomValues 만 쓴다 (Math.random 은 예측 가능해 ID 용도로 부적격).
 */
(function (): void {
  function randomBytes(n: number): Uint8Array {
    const arr = new Uint8Array(n);
    crypto.getRandomValues(arr);
    return arr;
  }

  function uuidV4(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const b = randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  /** UUID v7 — 앞 48bit 가 밀리초 타임스탬프라 정렬하면 생성 순서가 된다 (DB PK 에 유리) */
  function uuidV7(): string {
    const ts = Date.now();
    const b = randomBytes(16);
    b[0] = (ts / 2 ** 40) & 0xff;
    b[1] = (ts / 2 ** 32) & 0xff;
    b[2] = (ts / 2 ** 24) & 0xff;
    b[3] = (ts / 2 ** 16) & 0xff;
    b[4] = (ts / 2 ** 8) & 0xff;
    b[5] = ts & 0xff;
    b[6] = (b[6] & 0x0f) | 0x70;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function nanoId(len: number): string {
    const alphabet = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';
    return [...randomBytes(len)].map((x) => alphabet[x % alphabet.length]).join('');
  }

  const ULID_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  function ulid(): string {
    let ts = Date.now();
    let time = '';
    for (let i = 0; i < 10; i++) {
      time = ULID_CHARS[ts % 32] + time;
      ts = Math.floor(ts / 32);
    }
    const rand = [...randomBytes(16)].map((x) => ULID_CHARS[x % 32]).join('').slice(0, 16);
    return time + rand;
  }

  function password(len: number, symbols: boolean): string {
    const base = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const pool = base + (symbols ? '!@#$%^&*()-_=+[]{}' : '');
    return [...randomBytes(len)].map((x) => pool[x % pool.length]).join('');
  }

  Toolbox.register({
    id: 'uuidgen',
    title: 'UUID 생성기',
    category: 'tool',
    desc: 'UUID v4·v7, ULID, NanoID, 안전한 비밀번호를 원하는 개수만큼 만듭니다',
    layout: 'form',
    icon: '<rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M7 12h2M11 12h2M15 12h2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: 'UUID',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '겹칠 리 없는 이름표, 찍어 드릴게요.' });
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">종류</label>
              <select id="uuKind" aria-label="종류">
                <option value="v4">UUID v4 — 완전 무작위 (가장 일반적)</option>
                <option value="v7">UUID v7 — 시간 정렬 가능 (DB 기본키 추천)</option>
                <option value="ulid">ULID — 26자, 시간 정렬 + 대소문자 혼동 없음</option>
                <option value="nano">NanoID — 짧은 URL 안전 ID</option>
                <option value="pw">비밀번호 — 헷갈리는 글자(0/O, l/1) 제외</option>
              </select>
            </div>
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">개수 <span id="uuCountVal" class="range-value">10개</span></div>
                  <input type="range" id="uuCount" aria-label="개수" min="1" max="100" value="10">
                </div>
                <div>
                  <div class="tool-sublabel">길이 <span id="uuLenVal" class="range-value">21자</span></div>
                  <input type="range" id="uuLen" aria-label="길이" min="6" max="64" value="21">
                </div>
              </div>
              <div style="display:flex; gap:14px; margin-top:10px; flex-wrap:wrap;">
                <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                  <input type="checkbox" id="uuUpper" style="width:auto;"> 대문자
                </label>
                <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                  <input type="checkbox" id="uuNoDash" style="width:auto;"> 하이픈 제거
                </label>
                <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                  <input type="checkbox" id="uuSymbols" style="width:auto;" checked> 비밀번호에 기호 포함
                </label>
              </div>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:var(--space-lg);">
              <button class="btn btn-primary" id="uuGen">생성</button>
              <button class="btn btn-ghost" id="uuCopy">전체 복사</button>
            </div>
            <textarea id="uuOut" aria-label="만들어진 값" class="mono-input" readonly style="min-height:240px;"></textarea>
            <div class="tool-status">모두 브라우저의 암호학적 난수(crypto.getRandomValues)로 만들며 서버로 전송하지 않습니다.</div>
          `;
          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const kind = $<HTMLSelectElement>('#uuKind');
          const count = $<HTMLInputElement>('#uuCount');
          const len = $<HTMLInputElement>('#uuLen');
          const out = $<HTMLTextAreaElement>('#uuOut');

          function render(): void {
            $<HTMLElement>('#uuCountVal').textContent = count.value + '개';
            $<HTMLElement>('#uuLenVal').textContent = len.value + '자';
            const n = parseInt(count.value, 10);
            const l = parseInt(len.value, 10);
            const upper = $<HTMLInputElement>('#uuUpper').checked;
            const noDash = $<HTMLInputElement>('#uuNoDash').checked;
            const symbols = $<HTMLInputElement>('#uuSymbols').checked;
            const rows: string[] = [];
            for (let i = 0; i < n; i++) {
              let v: string;
              switch (kind.value) {
                case 'v7':
                  v = uuidV7();
                  break;
                case 'ulid':
                  v = ulid();
                  break;
                case 'nano':
                  v = nanoId(l);
                  break;
                case 'pw':
                  v = password(l, symbols);
                  break;
                default:
                  v = uuidV4();
              }
              if (noDash) v = v.replace(/-/g, '');
              if (upper) v = v.toUpperCase();
              rows.push(v);
            }
            out.value = rows.join('\n');
          }

          [kind, count, len].forEach((el) => {
            el.addEventListener('input', render);
            el.addEventListener('change', render);
          });
          container.querySelectorAll('input[type="checkbox"]').forEach((el) => el.addEventListener('change', render));
          $<HTMLButtonElement>('#uuGen').onclick = render;
          $<HTMLButtonElement>('#uuCopy').onclick = async () => {
            if (!out.value) return;
            await Toolbox.copyText?.(out.value, { message: `${out.value.split('\n').length}개를 복사했어요` });
          };

          render();
        }
      }
    ]
  });
})();
