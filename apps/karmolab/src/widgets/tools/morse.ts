/**
 * 모스 부호 (TASK-KL-088) — 잡동사니에서 승격.
 *
 * 이전 판은 텍스트 → 부호 한 방향만 됐고 한글이 없었다. 실제 쓰임은 반대가 더 많다 —
 * 어디선가 본 점·선을 **읽어야** 한다. 그래서 양방향으로 만들고, 한글 모스(1926년 제정,
 * 자모 단위로 찍는다)도 넣는다. 소리·불빛 재생은 그대로 살린다.
 */
import { CHO, JONG, JUNG } from '../../core/jamo';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const EN: Record<string, string> = {
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
    I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
    Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
    Y: '-.--', Z: '--..',
    '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....',
    '6': '-....', '7': '--...', '8': '---..', '9': '----.', '0': '-----',
    '.': '.-.-.-', ',': '--..--', '?': '..--..', '!': '-.-.--', '/': '-..-.',
    '-': '-....-', '(': '-.--.', ')': '-.--.-', ':': '---...', "'": '.----.',
    '=': '-...-', '+': '.-.-.', '@': '.--.-.'
  };

  /** 한글 모스 부호 — 자모 단위. 겹자음·겹모음은 자모를 나눠 찍는다. */
  const KO: Record<string, string> = {
    ㄱ: '.-..', ㄴ: '..-.', ㄷ: '-...', ㄹ: '...-', ㅁ: '--', ㅂ: '.--',
    ㅅ: '--.', ㅇ: '-.-', ㅈ: '.--.', ㅊ: '-.-.', ㅋ: '-..-', ㅌ: '--..',
    ㅍ: '---', ㅎ: '.---',
    ㅏ: '.', ㅑ: '..', ㅓ: '-', ㅕ: '...', ㅗ: '.-', ㅛ: '-.',
    ㅜ: '....', ㅠ: '.-.', ㅡ: '-..', ㅣ: '..-', ㅔ: '-.--', ㅐ: '--.-'
  };

  /* 자모 표는 `core/jamo.ts` 하나뿐이다 (아래 SPLIT 만 모스 고유다). */
  /** 겹자모 → 기본 자모 나열 (모스에는 겹자모가 없다) */
  const SPLIT: Record<string, string> = {
    ㄲ: 'ㄱㄱ', ㄸ: 'ㄷㄷ', ㅃ: 'ㅂㅂ', ㅆ: 'ㅅㅅ', ㅉ: 'ㅈㅈ',
    ㄳ: 'ㄱㅅ', ㄵ: 'ㄴㅈ', ㄶ: 'ㄴㅎ', ㄺ: 'ㄹㄱ', ㄻ: 'ㄹㅁ', ㄼ: 'ㄹㅂ',
    ㄽ: 'ㄹㅅ', ㄾ: 'ㄹㅌ', ㄿ: 'ㄹㅍ', ㅀ: 'ㄹㅎ', ㅄ: 'ㅂㅅ',
    ㅒ: 'ㅑㅣ', ㅖ: 'ㅕㅣ', ㅘ: 'ㅗㅏ', ㅙ: 'ㅗㅐ', ㅚ: 'ㅗㅣ',
    ㅝ: 'ㅜㅓ', ㅞ: 'ㅜㅔ', ㅟ: 'ㅜㅣ', ㅢ: 'ㅡㅣ'
  };

  /** 완성형 한글 한 글자 → 기본 자모 배열 */
  function decompose(ch: string): string[] {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code < 0 || code > 11171) return [ch];
    const jamo = [CHO[Math.floor(code / 588)], JUNG[Math.floor((code % 588) / 28)], JONG[code % 28]];
    return jamo
      .filter(Boolean)
      .flatMap((j) => (SPLIT[j] ? SPLIT[j].split('') : [j]));
  }

  function encode(text: string, korean: boolean): string {
    const out: string[] = [];
    for (const raw of text) {
      if (raw === ' ') {
        out.push('/');
        continue;
      }
      if (korean && raw >= '가' && raw <= '힣') {
        decompose(raw).forEach((j) => {
          if (KO[j]) out.push(KO[j]);
        });
        continue;
      }
      if (korean && KO[raw]) {
        out.push(KO[raw]);
        continue;
      }
      const up = raw.toUpperCase();
      if (EN[up]) out.push(EN[up]);
    }
    return out.join(' ');
  }

  /** 겹모음·겹받침 합치기 — decompose 의 역방향 */
  const JOIN: Record<string, string> = {};
  Object.keys(SPLIT).forEach((k) => {
    if (SPLIT[k].length === 2) JOIN[SPLIT[k]] = k;
  });

  /**
   * 자모 나열 → 완성형 한글.
   *
   * 모스는 자모 단위라 풀면 「ㅇㅏㄴㄴㅕㅇ」 이 나온다 — 원리상 맞지만 읽히지 않는다.
   * 받침이 다음 글자의 첫소리가 될 수 있어서(안+녕), **다음 자모를 보고 나서** 확정한다.
   */
  function compose(jamo: string[]): string {
    const out: string[] = [];
    let cho = -1;
    let jung = -1;
    let jong = 0;

    const flush = (): void => {
      if (cho < 0) return;
      if (jung < 0) {
        out.push(CHO[cho]); // 홀소리 없이 끝난 닿소리는 그대로
      } else {
        out.push(String.fromCharCode(0xac00 + cho * 588 + jung * 28 + jong));
      }
      cho = -1;
      jung = -1;
      jong = 0;
    };

    for (let i = 0; i < jamo.length; i++) {
      const j = jamo[i];
      if (j === ' ') {
        flush();
        out.push(' ');
        continue;
      }
      const isVowel = JUNG.indexOf(j) >= 0;

      if (isVowel) {
        if (jung >= 0 && jong === 0) {
          // 겹모음 (ㅗ + ㅏ → ㅘ)
          const merged = JOIN[JUNG[jung] + j];
          if (merged && JUNG.indexOf(merged) >= 0) {
            jung = JUNG.indexOf(merged);
            continue;
          }
        }
        if (jong !== 0) {
          // 받침인 줄 알았던 게 실은 다음 글자의 첫소리였다 (안 + ㄴ + ㅕ → 안녕).
          // 겹받침이었다면 뒷자만 넘어간다 (학 + ㄲ + ㅛ → 학교, 앉 + ㅈ + ㅏ 아님).
          const tail = JONG[jong];
          const pair = SPLIT[tail];
          let moved = tail;
          if (pair) {
            jong = JONG.indexOf(pair[0]);
            moved = pair[1];
          } else {
            jong = 0;
          }
          flush();
          cho = CHO.indexOf(moved);
          jung = JUNG.indexOf(j);
          continue;
        }
        if (jung >= 0) flush();
        if (cho < 0) {
          out.push(j); // 첫소리 없는 홀소리
          continue;
        }
        jung = JUNG.indexOf(j);
        continue;
      }

      // 닿소리
      if (cho < 0) {
        cho = CHO.indexOf(j);
        if (cho < 0) out.push(j);
        continue;
      }
      if (jung < 0) {
        // 홀소리 없이 닿소리가 겹치면 된소리다 (ㄱ + ㄱ → ㄲ). 모스에는 된소리 부호가 없다.
        const twin = JOIN[CHO[cho] + j];
        if (twin && CHO.indexOf(twin) >= 0) {
          cho = CHO.indexOf(twin);
          continue;
        }
        flush();
        cho = CHO.indexOf(j);
        continue;
      }
      if (jong === 0) {
        const k = JONG.indexOf(j);
        if (k > 0) {
          jong = k;
          continue;
        }
        flush();
        cho = CHO.indexOf(j);
        continue;
      }
      // 겹받침 (ㄹ + ㄱ → ㄺ)
      const merged = JOIN[JONG[jong] + j];
      if (merged && JONG.indexOf(merged) > 0) {
        jong = JONG.indexOf(merged);
        continue;
      }
      flush();
      cho = CHO.indexOf(j);
    }
    flush();
    return out.join('');
  }

  function decode(code: string, korean: boolean): string {
    const table = korean ? KO : EN;
    const rev: Record<string, string> = {};
    Object.keys(table).forEach((k) => {
      // 같은 부호가 두 자모에 겹치면 먼저 등록된 쪽을 남긴다 (한글표는 중복이 없다).
      if (rev[table[k]] === undefined) rev[table[k]] = k;
    });
    return code
      .trim()
      .split(/\s*\/\s*/)
      .map((word) => {
        const letters = word
          .split(/\s+/)
          .filter(Boolean)
          .map((sym) => rev[sym] ?? '?');
        return korean ? compose(letters) : letters.join('');
      })
      .join(' ');
  }

  // 자모 조립·부호 표가 이 도구의 존재 이유라 값으로 검증한다 (scripts/smoke-tools.mjs).
  window.KarmoMorse = { encode, decode };

  Toolbox.register({
    id: 'morse',
    title: t('widgets.morse.title', undefined, '모스 부호 변환'),
    category: 'tool',
    desc: t(
      'widgets-desc.morse.desc',
      undefined,
      '글자를 모스 부호로 바꾸고 부호를 다시 글자로 읽습니다. 한글 모스와 소리·불빛 재생 지원'
    ),
    layout: 'form',
    icon: '<path d="M3 12h2M8 12h6M17 12h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M3 7h4M10 7h2M15 7h6M3 17h6M12 17h2M17 17h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.5"/>',
    tabs: [
      {
        id: 'app',
        label: t('morse.tab', undefined, '모스 부호'),
        build: function (container: HTMLElement): void {
          void loadNamespace('morse').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에. */
  function draw(container: HTMLElement): void {
          const esc = (v: string): string =>
            v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          Mdd.linePreset('tool_run', { msg: t('morse.mdd') });
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-chips">
                <button type="button" class="tool-chip active" data-lang="en">${esc(t('morse.lang.en'))}</button>
                <button type="button" class="tool-chip" data-lang="ko">${esc(t('morse.lang.ko'))}</button>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">${esc(t('morse.label.text'))}</label>
              <textarea id="msText" rows="3" spellcheck="false" placeholder="SOS"></textarea>
            </div>

            <div class="field-group">
              <label class="field-label">${esc(t('morse.label.code'))}</label>
              <textarea id="msCode" rows="3" spellcheck="false" placeholder="... --- ..."></textarea>
            </div>

            <div style="display:flex; align-items:center; gap:12px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="msPlay">${esc(t('morse.btn.play'))}</button>
              <button class="btn btn-ghost" id="msCopy">${esc(t('morse.btn.copy'))}</button>
              <span style="display:flex; align-items:center; gap:6px;">
                <span id="msLed" class="ms-led"></span>
                <span style="font-size:var(--font-size-xs); color:var(--text-tertiary);">${esc(t('morse.label.light'))}</span>
              </span>
            </div>

            <div class="tool-status" id="msStatus">${esc(t('morse.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const textEl = $<HTMLTextAreaElement>('#msText');
          const codeEl = $<HTMLTextAreaElement>('#msCode');
          const led = $<HTMLElement>('#msLed');
          const status = $<HTMLElement>('#msStatus');
          let korean = false;
          let syncing = false;

          function setStatus(msg: string, kind = ''): void {
            status.textContent = msg;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          }

          textEl.addEventListener('input', () => {
            if (syncing) return;
            syncing = true;
            codeEl.value = encode(textEl.value, korean);
            syncing = false;
            setStatus(t(korean ? 'morse.status.koNote' : 'morse.status.converted'), 'ok');
            Toolbox.trackUse?.('encode');
          });
          codeEl.addEventListener('input', () => {
            if (syncing) return;
            syncing = true;
            const out = decode(codeEl.value, korean);
            textEl.value = out;
            syncing = false;
            setStatus(
              out.includes('?')
                ? t('morse.status.unknown')
                : korean
                  ? t('morse.status.readKo')
                  : t('morse.status.read'),
              out.includes('?') ? '' : 'ok'
            );
            Toolbox.trackUse?.('decode');
          });

          container.querySelectorAll('[data-lang]').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              container.querySelectorAll('[data-lang]').forEach((c) => c.classList.remove('active'));
              chip.classList.add('active');
              korean = (chip as HTMLElement).dataset.lang === 'ko';
              textEl.placeholder = korean ? '안녕' : 'SOS';
              textEl.dispatchEvent(new Event('input'));
            };
          });

          $<HTMLButtonElement>('#msCopy').onclick = async () => {
            if (!codeEl.value) return;
            await Toolbox.copyText?.(codeEl.value, { message: t('morse.copy.done') });
          };

          // ── 소리·불빛 재생 (점 1 : 선 3 : 글자 사이 3 : 낱말 사이 7 — 국제 표준 비율)
          const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
          let playing = false;
          $<HTMLButtonElement>('#msPlay').onclick = async () => {
            const code = codeEl.value.trim();
            if (playing || !code) return;
            const btn = $<HTMLButtonElement>('#msPlay');
            playing = true;
            btn.disabled = true;
            btn.textContent = t('morse.btn.playing');
            const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            const ctx = AC ? new AC() : null;
            const unit = 100;
            const beep = (ms: number): void => {
              if (!ctx) return;
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.type = 'sine';
              osc.frequency.setValueAtTime(620, ctx.currentTime);
              gain.gain.setValueAtTime(0.15, ctx.currentTime);
              osc.start();
              osc.stop(ctx.currentTime + ms / 1000);
            };
            const lamp = (on: boolean): void => {
              led.classList.toggle('on', on);
            };

            for (const ch of code) {
              if (!container.isConnected) break;
              if (ch === '.' || ch === '-') {
                const ms = ch === '.' ? unit : unit * 3;
                lamp(true);
                beep(ms);
                await sleep(ms);
                lamp(false);
                await sleep(unit);
              } else if (ch === '/') {
                await sleep(unit * 7);
              } else if (ch === ' ') {
                await sleep(unit * 2);
              }
            }
            if (ctx) setTimeout(() => void ctx.close(), 120);
            playing = false;
            btn.disabled = false;
            btn.textContent = t('morse.btn.play');
          };

          textEl.value = 'SOS';
          textEl.dispatchEvent(new Event('input'));
  }
})();

