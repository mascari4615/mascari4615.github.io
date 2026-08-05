/**
 * 모스 부호 (TASK-KL-088) — 잡동사니에서 승격.
 *
 * 이전 판은 텍스트 → 부호 한 방향만 됐고 한글이 없었다. 실제 쓰임은 반대가 더 많다 —
 * 어디선가 본 점·선을 **읽어야** 한다. 그래서 양방향으로 만들고, 한글 모스(1926년 제정,
 * 자모 단위로 찍는다)도 넣는다. 소리·불빛 재생은 그대로 살린다.
 */
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

  const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
  const JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
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
      .map((word) =>
        word
          .split(/\s+/)
          .filter(Boolean)
          .map((sym) => rev[sym] ?? '?')
          .join('')
      )
      .join(' ');
  }

  Toolbox.register({
    id: 'morse',
    title: '모스 부호 변환',
    category: 'tool',
    desc: '글자를 모스 부호로 바꾸고 부호를 다시 글자로 읽습니다. 한글 모스와 소리·불빛 재생 지원',
    layout: 'form',
    icon: '<path d="M3 12h2M8 12h6M17 12h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M3 7h4M10 7h2M15 7h6M3 17h6M12 17h2M17 17h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.5"/>',
    tabs: [
      {
        id: 'app',
        label: '모스 부호',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '삐— 삐— 삐—' });
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-chips">
                <button type="button" class="tool-chip active" data-lang="en">영문·숫자</button>
                <button type="button" class="tool-chip" data-lang="ko">한글</button>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">글자</label>
              <textarea id="msText" rows="3" spellcheck="false" placeholder="SOS"></textarea>
            </div>

            <div class="field-group">
              <label class="field-label">모스 부호 — 글자 사이는 공백, 낱말 사이는 /</label>
              <textarea id="msCode" rows="3" spellcheck="false" placeholder="... --- ..."></textarea>
            </div>

            <div style="display:flex; align-items:center; gap:12px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="msPlay">소리로 듣기</button>
              <button class="btn btn-ghost" id="msCopy">부호 복사</button>
              <span style="display:flex; align-items:center; gap:6px;">
                <span id="msLed" class="ms-led"></span>
                <span style="font-size:var(--font-size-xs); color:var(--text-tertiary);">신호등</span>
              </span>
            </div>

            <div class="tool-status" id="msStatus">어느 칸에 적어도 반대쪽이 따라 바뀝니다.</div>
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
            setStatus(korean ? '한글은 자모 단위로 찍습니다.' : '변환됨', 'ok');
            Toolbox.trackUse?.('encode');
          });
          codeEl.addEventListener('input', () => {
            if (syncing) return;
            syncing = true;
            const out = decode(codeEl.value, korean);
            textEl.value = out;
            syncing = false;
            setStatus(out.includes('?') ? '표에 없는 부호가 섞여 있어 ? 로 뒀어요.' : '읽었습니다.', out.includes('?') ? '' : 'ok');
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
            await Toolbox.copyText?.(codeEl.value, { message: '모스 부호를 복사했어요' });
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
            btn.textContent = '재생 중…';
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
            btn.textContent = '소리로 듣기';
          };

          textEl.value = 'SOS';
          textEl.dispatchEvent(new Event('input'));
        }
      }
    ]
  });
})();
