/** 영문 QWERTY로 잘못 입력한 두벌식 한글을 복원한다. 다른 검색창에서도 재사용 가능한 순수 모듈이다. */
const KEY: Record<string, string> = {
  r: 'ㄱ', R: 'ㄲ', s: 'ㄴ', e: 'ㄷ', E: 'ㄸ', f: 'ㄹ', a: 'ㅁ', q: 'ㅂ', Q: 'ㅃ',
  t: 'ㅅ', T: 'ㅆ', d: 'ㅇ', w: 'ㅈ', W: 'ㅉ', c: 'ㅊ', z: 'ㅋ', x: 'ㅌ', v: 'ㅍ', g: 'ㅎ',
  k: 'ㅏ', o: 'ㅐ', O: 'ㅒ', i: 'ㅑ', j: 'ㅓ', p: 'ㅔ', P: 'ㅖ', u: 'ㅕ', h: 'ㅗ',
  y: 'ㅛ', n: 'ㅜ', b: 'ㅠ', m: 'ㅡ', l: 'ㅣ',
};
const LEADS = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const VOWELS = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'];
const TAILS = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];
const VOWEL_PAIR: Record<string, string> = { 'ㅗㅏ':'ㅘ', 'ㅗㅐ':'ㅙ', 'ㅗㅣ':'ㅚ', 'ㅜㅓ':'ㅝ', 'ㅜㅔ':'ㅞ', 'ㅜㅣ':'ㅟ', 'ㅡㅣ':'ㅢ' };
const TAIL_PAIR: Record<string, string> = { 'ㄱㅅ':'ㄳ', 'ㄴㅈ':'ㄵ', 'ㄴㅎ':'ㄶ', 'ㄹㄱ':'ㄺ', 'ㄹㅁ':'ㄻ', 'ㄹㅂ':'ㄼ', 'ㄹㅅ':'ㄽ', 'ㄹㅌ':'ㄾ', 'ㄹㅍ':'ㄿ', 'ㄹㅎ':'ㅀ', 'ㅂㅅ':'ㅄ' };
const SPLIT_TAIL = Object.fromEntries(Object.entries(TAIL_PAIR).map(([pair, tail]) => [tail, [...pair]]));
const DOUBLE_LEAD: Record<string, string> = { 'ㄱㄱ':'ㄲ', 'ㄷㄷ':'ㄸ', 'ㅂㅂ':'ㅃ', 'ㅅㅅ':'ㅆ', 'ㅈㅈ':'ㅉ' };

export function englishKeysToKorean(input: string): string {
  let out = '';
  let lead = '';
  let vowel = '';
  let tail = '';
  const flush = () => {
    if (lead && vowel) out += String.fromCharCode(0xac00 + LEADS.indexOf(lead) * 588 + VOWELS.indexOf(vowel) * 28 + TAILS.indexOf(tail));
    else out += lead + vowel + tail;
    lead = vowel = tail = '';
  };

  for (const raw of input) {
    const jamo = KEY[raw];
    if (!jamo) { flush(); out += raw; continue; }
    const isVowel = VOWELS.includes(jamo);
    if (isVowel) {
      if (!lead) { flush(); out += jamo; continue; }
      if (!vowel) { vowel = jamo; continue; }
      if (!tail) {
        const combined = VOWEL_PAIR[vowel + jamo];
        if (combined) { vowel = combined; continue; }
        flush(); out += jamo; continue;
      }
      const split = SPLIT_TAIL[tail] as string[] | undefined;
      const nextLead = split ? split[1] : tail;
      if (split) tail = split[0]; else tail = '';
      flush();
      lead = nextLead;
      vowel = jamo;
      continue;
    }

    if (!lead) { lead = jamo; continue; }
    if (!vowel) {
      const doubled = DOUBLE_LEAD[lead + jamo];
      if (doubled) lead = doubled;
      else { flush(); lead = jamo; }
      continue;
    }
    if (!tail && TAILS.includes(jamo)) { tail = jamo; continue; }
    if (tail) {
      const combined = TAIL_PAIR[tail + jamo];
      if (combined) { tail = combined; continue; }
    }
    flush();
    lead = jamo;
  }
  flush();
  return out;
}

export function looksLikeMistypedKorean(input: string): boolean {
  return /[a-z]/i.test(input) && /^[a-z\s.,!?\-_/]+$/i.test(input);
}
