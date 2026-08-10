/**
 * 유령 타자 대결 (TASK-KL-131)
 *
 * 타자 연습은 어디에나 있다. 없는 것은 **상대**다 — 혼자 치고 점수만 보면 한 번 하고 끝난다.
 * 여기서는 친 기록이 그대로 **유령**이 되어 주소 하나에 담긴다. 그 주소를 받은 사람은
 * 같은 글을 치면서 내 유령과 나란히 달리고, 이기면 자기 유령이 담긴 새 주소가 나온다.
 * 쓴 사람이 다음 사람을 데려오는 구조 — 계정도 서버도 없이, 주소만으로.
 *
 * 레퍼런스에서 가져온 것 (2026-08 조사):
 *  - **타입레이서**의 유령(지난 판 재생과 겨루기)이 이 놀이의 원형이다. 다만 그쪽 유령 주소는
 *    만료돼서 2025년에야 안 사라지는 주소를 따로 붙였다. 여기는 **기록이 주소 안에** 들어
 *    있으므로 애초에 만료가 없다 — 서버가 없다는 게 약점이 아니라 그 반대다.
 *  - 같은 곳의 2025년 간판 기능이 「**아무 글이나 걸고 겨루기**」였다. 그래서 고정 지문만
 *    두지 않고, 자기 글을 붙여 넣으면 그 글이 주소에 함께 담기게 했다.
 *  - **몽키타입**의 철학은 군더더기 0 — 가입도 안내 창도 없고 치면 바로 시작한다. 여기도
 *    첫 글자를 치는 순간 시작하고, 시작 단추가 없다.
 *
 * 타수는 **자소 단위**로 센다 — 한국에서 말하는 「타」는 글자 수가 아니라 누른 횟수다
 * (값 = ㄱ+ㅏ+ㅄ = 4타). 글자 수로 세면 실제보다 절반 아래로 나와 다른 데서 잰 값과 안 맞는다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /** 처음 온 사람에게 보여 줄 글. 겨룰 **글 자체가 내용**이라 언어마다 다시 썼다 —
   *  번역한 한국어 문장은 그 언어 사람에게 칠 맛이 없다. 자기 글을 넣으면 그 글이 주소에
   *  담기므로 순서는 상관없다. 미리 굳히지 않고 **쓸 때 만든다**(말 묶음이 온 뒤라야 한다). */
  const PRESET_COUNT = 5;
  const presets = (): string[] => Array.from({ length: PRESET_COUNT }, (_, i) => t(`ghosttype.preset.${i}`));

  const NAME_KEY = 'karmolab.ghosttype.name';
  const MAX_TEXT = 240; // 주소에 담아야 하므로 — 이보다 길면 링크가 메신저에서 잘린다
  const MAX_GAP = 4000; // 자리를 비운 구간까지 그대로 재생하면 상대는 멈춘 화면을 본다

  /* ── 한글 타수 (자소 단위) ────────────────────────────────────────── */
  const 겹모음: Record<string, number> = { ㅘ: 2, ㅙ: 3, ㅚ: 2, ㅝ: 2, ㅞ: 3, ㅟ: 2, ㅢ: 2 };
  const 겹받침: Record<string, number> = { ㄳ: 2, ㄵ: 2, ㄶ: 2, ㄺ: 2, ㄻ: 2, ㄼ: 2, ㄽ: 2, ㄾ: 2, ㄿ: 2, ㅄ: 2 };
  const 중성표 = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  const 종성표 = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';

  /** 그 글을 치려면 몇 번 눌러야 하는가. 된소리(ㄲ)는 시프트 조합이라 한 번으로 센다. */
  function 타건수(s: string): number {
    let n = 0;
    for (const ch of s) {
      const code = ch.charCodeAt(0);
      if (code >= 0xac00 && code <= 0xd7a3) {
        const i = code - 0xac00;
        const 중성 = 중성표[Math.floor(i / 28) % 21];
        const 종성 = 종성표[i % 28];
        n += 1; // 초성
        n += 겹모음[중성] || 1;
        if (종성 !== ' ') n += 겹받침[종성] || 1;
      } else {
        n += 1;
      }
    }
    return n;
  }

  /* ── 주소에 담고 꺼내기 ───────────────────────────────────────────
   * 글자마다 걸린 시간은 대개 100~400ms 라 작은 수 부호화로 눌러 담는다. */
  function packVarints(values: number[]): Uint8Array {
    const out: number[] = [];
    for (const raw of values) {
      let v = Math.max(0, Math.min(MAX_GAP, Math.round(raw)));
      while (v >= 0x80) {
        out.push((v & 0x7f) | 0x80);
        v >>>= 7;
      }
      out.push(v);
    }
    return Uint8Array.from(out);
  }

  function unpackVarints(bytes: Uint8Array): number[] {
    const out: number[] = [];
    let v = 0;
    let shift = 0;
    for (const b of bytes) {
      v |= (b & 0x7f) << shift;
      if (b & 0x80) {
        shift += 7;
      } else {
        out.push(v);
        v = 0;
        shift = 0;
      }
    }
    return out;
  }

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

  interface Ghost {
    text: string;
    name: string;
    gaps: number[]; // 글자마다 앞 글자로부터 걸린 시간
  }

  /** 글까지 주소에 담는다 — 목록 번호를 담으면 나중에 목록이 바뀔 때 옛 주소가 딴 글을 가리킨다. */
  function encodeGhost(g: Ghost): string {
    const text = toBase64Url(new TextEncoder().encode(g.text.slice(0, MAX_TEXT)));
    return `1.${toBase64Url(packVarints(g.gaps))}.${encodeURIComponent(g.name.slice(0, 12))}.${text}`;
  }

  function decodeGhost(code: string): Ghost | null {
    try {
      const [ver, gapsPart, namePart, textPart] = code.split('.');
      if (ver !== '1' || !gapsPart || !textPart) return null;
      const gaps = unpackVarints(fromBase64Url(gapsPart));
      const text = new TextDecoder().decode(fromBase64Url(textPart));
      if (gaps.length === 0 || !text) return null;
      return {
        text,
        gaps,
        name: namePart ? decodeURIComponent(namePart).slice(0, 12) : t('ghosttype.name.default')
      };
    } catch {
      return null;
    }
  }

  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  Toolbox.register({
    id: 'ghosttype',
    title: t('widgets.ghosttype.title', undefined, '유령 타자 대결'),
    category: 'tool',
    desc: t(
      'widgets-desc.ghosttype.desc',
      undefined,
      '타자 기록이 주소 하나가 되고, 그 주소를 연 사람은 내 유령과 나란히 달립니다. 아무 글이나 걸 수 있고 주소는 만료되지 않습니다'
    ),
    layout: 'wide',
    icon: '<path d="M12 3a6 6 0 0 0-6 6v10l2-1.6 2 1.6 2-1.6 2 1.6 2-1.6 2 1.6V9a6 6 0 0 0-6-6z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M10 10h.01M14 10h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('ghosttype.tab', undefined, '대결'),
        build: function (container: HTMLElement): void {
          void loadNamespace('ghosttype').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에 — 지문도 단위 이름도 전부 말 묶음에서 나온다. */
  function draw(container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: t('ghosttype.mdd') });

          const ghost = (() => {
            const m = location.hash.match(/g=([^&]+)/);
            return m ? decodeGhost(m[1]) : null;
          })();

          const 지문 = presets();
          let target = ghost ? ghost.text : 지문[Math.floor(Math.random() * 지문.length)];

          container.innerHTML = `
            <div class="gt-banner" id="gtBanner" style="${ghost ? '' : 'display:none;'}">
              <b id="gtGhostName"></b>${esc(t('ghosttype.banner.rest'))}
            </div>

            <div class="gt-track">
              <div class="gt-lane">
                <div class="gt-lane-label">${esc(t('ghosttype.lane.me'))}</div>
                <div class="gt-rail"><div class="gt-runner" id="gtMe">🏃</div></div>
                <div class="gt-lane-stat" id="gtMeStat">${esc(t('ghosttype.value.cpm', { n: 0 }))}</div>
              </div>
              <div class="gt-lane${ghost ? '' : ' gt-lane-off'}" id="gtGhostLane">
                <div class="gt-lane-label" id="gtGhostLabel">${esc(t('ghosttype.lane.ghost'))}</div>
                <div class="gt-rail"><div class="gt-runner gt-ghost" id="gtGhost">👻</div></div>
                <div class="gt-lane-stat" id="gtGhostStat">${esc(
                  ghost ? t('ghosttype.stat.wait') : t('ghosttype.stat.none')
                )}</div>
              </div>
            </div>

            <div class="gt-text" id="gtText"></div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <label class="field-label" for="gtInput">${esc(t('ghosttype.label.input'))}</label>
              <textarea id="gtInput" class="mono-input" rows="3" spellcheck="false" autocomplete="off"
                placeholder="${esc(t('ghosttype.ph.input'))}"></textarea>
            </div>

            <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-bottom:var(--space-lg);">
              <button class="btn btn-ghost" id="gtRestart">${esc(t('ghosttype.btn.restart'))}</button>
              <button class="btn btn-ghost" id="gtNextText">${esc(t('ghosttype.btn.next'))}</button>
              <button class="btn btn-ghost" id="gtOwnToggle">${esc(t('ghosttype.btn.own'))}</button>
              <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                ${esc(t('ghosttype.label.name'))} <input type="text" id="gtName" maxlength="12" placeholder="${esc(
                  t('ghosttype.name.default')
                )}" style="width:110px;" aria-label="${esc(t('ghosttype.aria.name'))}">
              </label>
            </div>

            <div class="field-group" id="gtOwnWrap" style="display:none;">
              <label class="field-label" for="gtOwn">${esc(t('ghosttype.label.own', { max: MAX_TEXT }))}</label>
              <textarea id="gtOwn" rows="2" maxlength="${MAX_TEXT}" placeholder="${esc(t('ghosttype.ph.own'))}"></textarea>
              <button class="btn btn-primary" id="gtOwnApply" style="margin-top:8px;">${esc(t('ghosttype.btn.ownApply'))}</button>
            </div>

            <div class="tool-status" id="gtStatus">${esc(t('ghosttype.status.idle'))}</div>
            <div id="gtResult" class="gt-result" style="display:none;"></div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const textEl = $<HTMLElement>('#gtText');
          const input = $<HTMLTextAreaElement>('#gtInput');
          const status = $<HTMLElement>('#gtStatus');
          const result = $<HTMLElement>('#gtResult');
          const meRunner = $<HTMLElement>('#gtMe');
          const ghostRunner = $<HTMLElement>('#gtGhost');
          const meStat = $<HTMLElement>('#gtMeStat');
          const ghostStat = $<HTMLElement>('#gtGhostStat');
          const nameInput = $<HTMLInputElement>('#gtName');

          try {
            nameInput.value = localStorage.getItem(NAME_KEY) || '';
          } catch {
            /* 사생활 보호 모드면 이름을 기억하지 않는다 — 대결에는 지장 없다 */
          }
          if (ghost) {
            $<HTMLElement>('#gtGhostName').textContent = ghost.name;
            $<HTMLElement>('#gtGhostLabel').textContent = ghost.name;
          }

          let racing = ghost !== null; // 유령과 나란히 달리는 판인가 (글을 바꾸면 꺼진다)
          let startedAt = 0;
          let gaps: number[] = [];
          let lastAt = 0;
          let done = false;
          let raf = 0;

          /** 유령이 그 시각에 몇 글자까지 갔는지 — 기록 사이는 곧게 이어 준다(뚝뚝 끊기지 않게). */
          function ghostCharsAt(ms: number): number {
            if (!ghost) return 0;
            let acc = 0;
            for (let i = 0; i < ghost.gaps.length; i++) {
              const next = acc + ghost.gaps[i];
              if (ms < next) return i + (next > acc ? (ms - acc) / (next - acc) : 0);
              acc = next;
            }
            return ghost.gaps.length;
          }

          function ghostTotalMs(): number {
            return ghost ? ghost.gaps.reduce((s, g) => s + g, 0) : 0;
          }

          /** 앞에서부터 연속으로 맞은 글자 수 — 여기까지가 달려온 거리다. */
          function correctPrefix(): number {
            const typed = input.value;
            let n = 0;
            while (n < typed.length && n < target.length && typed[n] === target[n]) n++;
            return n;
          }

          function paint(ghostAt = -1): void {
            const typed = input.value;
            let html = '';
            for (let i = 0; i < target.length; i++) {
              const ch = esc(target[i]);
              // 유령이 지금 어디를 치고 있는지 글 안에도 표시한다 — 막대만으로는 「얼마나 뒤졌나」가 안 보인다
              const g = i === ghostAt ? ' gt-ghost-at' : '';
              if (i < typed.length) html += `<span class="${typed[i] === target[i] ? 'gt-ok' : 'gt-bad'}${g}">${ch}</span>`;
              else if (i === typed.length) html += `<span class="gt-cur${g}">${ch}</span>`;
              else if (g) html += `<span class="${g.trim()}">${ch}</span>`;
              else html += ch;
            }
            textEl.innerHTML = html;
          }

          function place(el: HTMLElement, ratio: number): void {
            const r = Math.max(0, Math.min(1, ratio));
            el.style.left = `calc(${r * 100}% - ${r * 26}px)`;
          }

          function loop(): void {
            if (done) return;
            const ms = startedAt ? performance.now() - startedAt : 0;
            const mine = correctPrefix();
            place(meRunner, mine / target.length);
            meStat.textContent = t('ghosttype.value.cpm', { n: 타수(mine, ms) });
            if (racing && ghost) {
              const g = ghostCharsAt(ms);
              place(ghostRunner, g / target.length);
              ghostStat.textContent = startedAt
                ? t('ghosttype.value.cpm', { n: 타수(Math.floor(g), ms) })
                : t('ghosttype.stat.wait');
              paint(Math.min(target.length - 1, Math.floor(g)));
            }
            raf = requestAnimationFrame(loop);
          }

          /** 앞에서부터 n 글자를 치는 데 든 타건 수 ÷ 걸린 시간 */
          function 타수(chars: number, ms: number): number {
            if (ms <= 0) return 0;
            return Math.round((타건수(target.slice(0, chars)) / ms) * 60000);
          }

          function finish(): void {
            done = true;
            cancelAnimationFrame(raf);
            const ms = performance.now() - startedAt;
            const myCpm = 타수(target.length, ms);
            const mine: Ghost = {
              text: target,
              name: nameInput.value.trim().slice(0, 12) || t('ghosttype.name.default'),
              gaps
            };
            try {
              localStorage.setItem(NAME_KEY, mine.name);
            } catch {
              /* 못 적어도 그만 */
            }
            const url = `${location.origin}/karmolab/t/ghosttype/#g=${encodeGhost(mine)}`;

            let verdict: string;
            if (racing && ghost) {
              const gMs = ghostTotalMs();
              const gap = Math.abs(ms - gMs) / 1000;
              const 이김 = ms < gMs;
              const 말 = { name: esc(ghost.name), sec: gap.toFixed(1) };
              verdict = `<b class="${이김 ? 'gt-win' : 'gt-lose'}">${esc(
                t(이김 ? 'ghosttype.win' : 'ghosttype.lose')
              )}</b> — ${t(이김 ? 'ghosttype.win.detail' : 'ghosttype.lose.detail', 말)}`;
            } else {
              verdict = `<b>${esc(t('ghosttype.record'))}</b> — ${esc(t('ghosttype.record.detail'))}`;
            }

            result.style.display = '';
            result.innerHTML = `
              <div class="gt-verdict">${verdict}</div>
              <div class="gt-score">${esc(
                t('ghosttype.score', {
                  cpm: t('ghosttype.value.cpm', { n: myCpm }),
                  sec: (ms / 1000).toFixed(1),
                  keys: 타건수(target)
                })
              )}</div>
              <div class="gt-share">
                <input type="text" id="gtUrl" readonly aria-label="${esc(t('ghosttype.aria.url'))}" value="${esc(url)}">
                <button class="btn btn-primary" id="gtCopy">${esc(t('ghosttype.btn.copy'))}</button>
              </div>
              <div class="gt-hint">${esc(t('ghosttype.hint'))}</div>
            `;
            $<HTMLButtonElement>('#gtCopy').onclick = () => {
              void Toolbox.copyText?.(url, { message: t('ghosttype.copy.done') });
              Toolbox.trackUse?.('share');
            };
            status.textContent = t('ghosttype.status.again');
            status.className = 'tool-status ok';
            Toolbox.trackUse?.('finish');
          }

          function reset(): void {
            cancelAnimationFrame(raf);
            done = false;
            startedAt = 0;
            lastAt = 0;
            gaps = [];
            input.value = '';
            input.disabled = false;
            result.style.display = 'none';
            status.textContent = t('ghosttype.status.idle');
            status.className = 'tool-status';
            place(meRunner, 0);
            place(ghostRunner, 0);
            meStat.textContent = t('ghosttype.value.cpm', { n: 0 });
            ghostStat.textContent = racing ? t('ghosttype.stat.wait') : t('ghosttype.stat.none');
            paint();
          }

          /** 글을 바꾸면 유령은 다른 글의 기록이라 나란히 놓을 수 없다 — 조용히 빼지 말고 말해 준다. */
          function setText(next: string): void {
            target = next;
            if (racing) {
              racing = false;
              $<HTMLElement>('#gtBanner').style.display = 'none';
              $<HTMLElement>('#gtGhostLane').classList.add('gt-lane-off');
              status.textContent = t('ghosttype.status.textChanged');
            }
            reset();
          }

          input.addEventListener('input', () => {
            if (done) return;
            const now = performance.now();
            if (!startedAt) {
              startedAt = now;
              lastAt = now;
              loop();
            }
            const mine = correctPrefix();
            // 맞은 글자가 늘어난 만큼만 시간을 적는다. 지웠다 다시 친 구간은 다시 안 적는다.
            while (gaps.length < mine) {
              gaps.push(now - lastAt);
              lastAt = now;
            }
            paint();
            if (mine >= target.length) {
              input.disabled = true;
              finish();
            }
          });

          $<HTMLButtonElement>('#gtRestart').onclick = () => reset();
          $<HTMLButtonElement>('#gtNextText').onclick = () => {
            let next = target;
            while (next === target && 지문.length > 1) next = 지문[Math.floor(Math.random() * 지문.length)];
            setText(next);
          };
          $<HTMLButtonElement>('#gtOwnToggle').onclick = () => {
            const wrap = $<HTMLElement>('#gtOwnWrap');
            wrap.style.display = wrap.style.display === 'none' ? '' : 'none';
          };
          $<HTMLButtonElement>('#gtOwnApply').onclick = () => {
            const own = $<HTMLTextAreaElement>('#gtOwn').value.replace(/\s+/g, ' ').trim();
            if (own.length < 10) {
              status.textContent = t('ghosttype.status.tooShort');
              status.className = 'tool-status error';
              return;
            }
            setText(own.slice(0, MAX_TEXT));
            $<HTMLElement>('#gtOwnWrap').style.display = 'none';
          };

          /* 이미 이 화면을 열어 둔 채로 남의 유령 주소를 열면 주소만 바뀌고 화면은 그대로다
           * (같은 문서 안 이동이라 다시 안 짜인다) — 유령이 없는 것처럼 보인다. 그때만 새로 연다. */
          const onHash = (): void => {
            const m = location.hash.match(/g=([^&]+)/);
            const now = m ? m[1] : '';
            const had = ghost ? encodeGhost(ghost) : '';
            if (now && now !== had) location.reload();
          };
          window.addEventListener('hashchange', onHash);

          Toolbox.onDispose?.(() => {
            cancelAnimationFrame(raf);
            window.removeEventListener('hashchange', onHash);
          });
          paint();
          place(meRunner, 0);
          place(ghostRunner, 0);
  }
})();
