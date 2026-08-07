/**
 * 한/영 타자 변환 (TASK-KL-088) — 「dkssud」 ↔ 「안녕」.
 * 두벌식 자판 기준. 영→한은 조합 오토마타(초/중/종 + 겹자모)로 실제 타이핑을 재현한다.
 */
(function (): void {
  const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
  const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

  /** 두벌식: 영문 키 → 자모 */
  const KEY_TO_JAMO: Record<string, string> = {
    q: 'ㅂ', w: 'ㅈ', e: 'ㄷ', r: 'ㄱ', t: 'ㅅ', y: 'ㅛ', u: 'ㅕ', i: 'ㅑ', o: 'ㅐ', p: 'ㅔ',
    a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ', h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ',
    z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ', b: 'ㅠ', n: 'ㅜ', m: 'ㅡ',
    Q: 'ㅃ', W: 'ㅉ', E: 'ㄸ', R: 'ㄲ', T: 'ㅆ', O: 'ㅒ', P: 'ㅖ',
    A: 'ㅁ', S: 'ㄴ', D: 'ㅇ', F: 'ㄹ', G: 'ㅎ', H: 'ㅗ', J: 'ㅓ', K: 'ㅏ', L: 'ㅣ',
    Z: 'ㅋ', X: 'ㅌ', C: 'ㅊ', V: 'ㅍ', B: 'ㅠ', N: 'ㅜ', M: 'ㅡ',
    Y: 'ㅛ', U: 'ㅕ', I: 'ㅑ'
  };

  const JAMO_TO_KEY: Record<string, string> = (function () {
    const m: Record<string, string> = {};
    // 소문자 우선. 대문자 전용 자모(ㅃㅉㄸㄲㅆㅒㅖ)만 뒤에 채운다.
    'qwertyuiopasdfghjklzxcvbnm'.split('').forEach((k) => {
      m[KEY_TO_JAMO[k]] = k;
    });
    'QWERTOP'.split('').forEach((k) => {
      const j = KEY_TO_JAMO[k];
      if (!(j in m)) m[j] = k;
    });
    return m;
  })();

  const VOWEL_COMBO: Record<string, string> = {
    'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ',
    'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ',
    'ㅡㅣ': 'ㅢ'
  };
  const VOWEL_SPLIT: Record<string, string> = {};
  Object.keys(VOWEL_COMBO).forEach((k) => {
    VOWEL_SPLIT[VOWEL_COMBO[k]] = k;
  });

  const JONG_COMBO: Record<string, string> = {
    'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄵ', 'ㄴㅎ': 'ㄶ',
    'ㄹㄱ': 'ㄺ', 'ㄹㅁ': 'ㄻ', 'ㄹㅂ': 'ㄼ', 'ㄹㅅ': 'ㄽ', 'ㄹㅌ': 'ㄾ', 'ㄹㅍ': 'ㄿ', 'ㄹㅎ': 'ㅀ',
    'ㅂㅅ': 'ㅄ'
  };
  const JONG_SPLIT: Record<string, string> = {};
  Object.keys(JONG_COMBO).forEach((k) => {
    JONG_SPLIT[JONG_COMBO[k]] = k;
  });

  const isVowel = (j: string): boolean => JUNG.indexOf(j) >= 0;

  /** 영문(두벌식 키) → 한글 */
  function engToKor(src: string): string {
    let out = '';
    let cho = -1;
    let jung = -1;
    let jong = 0;

    const flush = (): void => {
      if (cho >= 0 && jung >= 0) {
        out += String.fromCharCode(0xac00 + (cho * 21 + jung) * 28 + jong);
      } else if (cho >= 0) {
        out += CHO[cho];
      } else if (jung >= 0) {
        out += JUNG[jung];
      }
      cho = -1;
      jung = -1;
      jong = 0;
    };

    for (const ch of src) {
      const jamo = KEY_TO_JAMO[ch];
      if (!jamo) {
        flush();
        out += ch;
        continue;
      }

      if (isVowel(jamo)) {
        const vi = JUNG.indexOf(jamo);
        if (jong > 0) {
          // 받침이 다음 글자 초성으로 넘어간다 (겹받침이면 뒷자음만)
          const jongChar = JONG[jong];
          const split = JONG_SPLIT[jongChar];
          const moved = split ? split[1] : jongChar;
          jong = split ? JONG.indexOf(split[0]) : 0;
          flush();
          cho = CHO.indexOf(moved);
          jung = vi;
        } else if (cho >= 0 && jung < 0) {
          jung = vi;
        } else if (jung >= 0) {
          const combo = VOWEL_COMBO[JUNG[jung] + jamo];
          if (combo) {
            jung = JUNG.indexOf(combo);
          } else {
            flush();
            jung = vi;
          }
        } else {
          jung = vi;
        }
        continue;
      }

      // 자음
      if (cho < 0 && jung < 0) {
        cho = CHO.indexOf(jamo);
        if (cho < 0) out += jamo;
      } else if (jung < 0 || cho < 0) {
        flush();
        cho = CHO.indexOf(jamo);
        if (cho < 0) {
          out += jamo;
        }
      } else if (jong === 0) {
        const ji = JONG.indexOf(jamo);
        if (ji > 0) {
          jong = ji;
        } else {
          flush();
          cho = CHO.indexOf(jamo);
        }
      } else {
        const combo = JONG_COMBO[JONG[jong] + jamo];
        if (combo) {
          jong = JONG.indexOf(combo);
        } else {
          flush();
          cho = CHO.indexOf(jamo);
        }
      }
    }
    flush();
    return out;
  }

  /** 한글 → 영문(두벌식 키) */
  function korToEng(src: string): string {
    let out = '';
    for (const ch of src) {
      const code = ch.charCodeAt(0);
      if (code >= 0xac00 && code <= 0xd7a3) {
        const idx = code - 0xac00;
        const jamos = [CHO[Math.floor(idx / 588)], JUNG[Math.floor((idx % 588) / 28)], JONG[idx % 28]];
        for (const j of jamos) {
          if (!j) continue;
          const parts = VOWEL_SPLIT[j] || JONG_SPLIT[j] || j;
          for (const p of parts) out += JAMO_TO_KEY[p] ?? p;
        }
      } else if (JAMO_TO_KEY[ch] || VOWEL_SPLIT[ch] || JONG_SPLIT[ch]) {
        const parts = VOWEL_SPLIT[ch] || JONG_SPLIT[ch] || ch;
        for (const p of parts) out += JAMO_TO_KEY[p] ?? p;
      } else {
        out += ch;
      }
    }
    return out;
  }

  window.KarmoHangulKey = { engToKor, korToEng };

  Toolbox.register({
    id: 'hangulkey',
    title: '한영타 변환',
    category: 'tool',
    desc: '한영키를 안 누르고 친 글자를 되돌립니다. dkssudgktpdy ↔ 안녕하세요 (두벌식)',
    layout: 'form',
    icon: '<rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 10h2M11 10h2M16 10h2M7 14h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '한영타',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '한영키 안 누르고 치셨죠? 제가 되돌려 드릴게요.' });
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">입력 (영문 → 한글 / 한글 → 영문 자동 판별)</label>
              <textarea id="hkInput" placeholder="예) dkssudgktpdy  또는  안녕하세요" style="min-height:120px;"></textarea>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:var(--space-lg);">
              <button class="btn btn-primary" id="hkAuto">자동 변환</button>
              <button class="btn btn-secondary" id="hkE2K">영문 → 한글</button>
              <button class="btn btn-secondary" id="hkK2E">한글 → 영문</button>
              <button class="btn btn-ghost" id="hkSwap">결과를 입력으로</button>
              <button class="btn btn-ghost" id="hkClear">지우기</button>
            </div>
            <div class="field-group">
              <div class="field-row" style="margin-bottom:8px;">
                <label class="field-label" style="margin:0;">결과</label>
                <button class="btn btn-ghost" id="hkCopy">복사</button>
              </div>
              <textarea id="hkOutput" aria-label="바뀐 결과" readonly style="min-height:120px;"></textarea>
            </div>
            <div class="tool-status" id="hkNote">두벌식 자판 기준입니다. 숫자·특수문자는 그대로 둡니다.</div>
          `;

          const input = container.querySelector('#hkInput') as HTMLTextAreaElement;
          const output = container.querySelector('#hkOutput') as HTMLTextAreaElement;
          const note = container.querySelector('#hkNote') as HTMLElement;

          function looksKorean(s: string): boolean {
            const kor = (s.match(/[가-힣ㄱ-ㅣ]/g) || []).length;
            const eng = (s.match(/[a-zA-Z]/g) || []).length;
            return kor >= eng;
          }
          function run(mode: 'auto' | 'e2k' | 'k2e'): void {
            const src = input.value;
            if (!src) {
              output.value = '';
              return;
            }
            const dir = mode === 'auto' ? (looksKorean(src) ? 'k2e' : 'e2k') : mode;
            output.value = dir === 'k2e' ? korToEng(src) : engToKor(src);
            note.textContent = dir === 'k2e' ? '한글 → 영문으로 변환했어요.' : '영문 → 한글로 변환했어요.';
          }

          (container.querySelector('#hkAuto') as HTMLButtonElement).onclick = () => run('auto');
          (container.querySelector('#hkE2K') as HTMLButtonElement).onclick = () => run('e2k');
          (container.querySelector('#hkK2E') as HTMLButtonElement).onclick = () => run('k2e');
          (container.querySelector('#hkSwap') as HTMLButtonElement).onclick = () => {
            input.value = output.value;
            run('auto');
          };
          (container.querySelector('#hkClear') as HTMLButtonElement).onclick = () => {
            input.value = '';
            output.value = '';
            input.focus();
          };
          (container.querySelector('#hkCopy') as HTMLButtonElement).onclick = async () => {
            if (!output.value) return;
            await Toolbox.copyText?.(output.value, { message: '결과를 복사했어요' });
          };
          input.addEventListener('input', () => run('auto'));
        }
      }
    ]
  });
})();
