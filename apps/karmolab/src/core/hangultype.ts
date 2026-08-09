/**
 * 한글 타자 — 알맹이 (해자③ 데일리 첫 게임의 계산 쪽)
 *
 * 한국어 타자 속도를 **영어처럼 세면 틀린다.** 영어는 흔히 「낱말 수 × 5」로 재는데,
 * 한글은 글자 하나가 자소 둘~넷을 눌러야 나온다 — 「값」도 「왔」도 네 번이다.
 * 그래서 한국에서 쓰는 **타수(자소 기준)** 로 센다. 이걸 안 맞추면 우리 숫자만 남과 다르고,
 * 같은 사람이 영타·한타에서 전혀 다른 점수를 받는다.
 *
 * 이 계산은 원래 `ghosttype` 위젯 안에만 있었다. 데일리 게임도 같은 셈이 필요해서 꺼냈다 —
 * 두 벌이 되면 「연습에서는 400타인데 데일리에서는 250타」가 되고, 둘 중 무엇도 못 믿는다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'hangultype',
  ops: {
    count: {
      desc:
        'Count Korean keystrokes (타수) for a text — the measure actually used in Korea, not "words × 5".' +
        ' One Hangul syllable takes 2–4 key presses (값 = 4, 왔 = 4), so English-style WPM understates' +
        ' Korean typing by roughly half.' +
        ' / 한글 타수(자소 기준)를 센다. 「낱말 수 × 5」로 세면 절반쯤 낮게 나온다.',
      in: { text: 'string' },
      out: 'string'
    },
    speed: {
      desc:
        'Typing speed and accuracy from a text and the seconds it took. Returns 타/분 (Korean keystrokes' +
        ' per minute) and, when the typed text is given, how many characters differ.' +
        ' / 타수·정확도. 친 글을 같이 주면 몇 글자가 다른지도 낸다.',
      in: { text: 'string', seconds: 'number', typed: 'string?' },
      out: 'string'
    }
  }
};

/**
 * ★ 화면이 따로 없다 — 이건 **재는 자**이지 도구가 아니다.
 *
 * 쓰는 쪽은 `ghosttype`(타자 겨루기)과 데일리 게임이다. 둘이 같은 셈을 써야 하므로 여기 있고,
 * 그래서 `/karmolab/t/hangultype/` 같은 자기 주소는 필요 없다.
 * (MCP 로는 낸다 — 「이 문장 타수가 몇이야」는 에이전트가 자주 틀리는 계산이다.)
 */
export const SCREENLESS = true;

/** 한 번에 눌리는 겹모음·겹받침. 표에 없으면 한 번이다. */
export const 겹모음: Record<string, number> = { ㅘ: 2, ㅙ: 3, ㅚ: 2, ㅝ: 2, ㅞ: 3, ㅟ: 2, ㅢ: 2 };
export const 겹받침: Record<string, number> = { ㄳ: 2, ㄵ: 2, ㄶ: 2, ㄺ: 2, ㄻ: 2, ㄼ: 2, ㄽ: 2, ㄾ: 2, ㄿ: 2, ㅄ: 2 };

const 중성표 = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const 종성표 = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';

/**
 * 그 글을 치려면 몇 번 눌러야 하는가.
 *
 * 된소리(ㄲ)는 시프트를 같이 누르므로 **한 번**으로 센다 — 두 번으로 세면 「빨리」 같은 말이
 * 실제보다 무겁게 나온다. 한글이 아닌 글자(공백·숫자·영문)는 그냥 한 번이다.
 */
export function 타건수(s: string): number {
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

export interface TypeResult {
  /** 자소 기준 타수. */
  strokes: number;
  /** 타/분. 한국에서 쓰는 그 수치. */
  perMinute: number;
  /** 0~100. 친 글을 안 주면 100 (잰 적이 없다는 뜻이 아니라 「비교 대상이 없다」). */
  accuracy: number;
  /** 원문과 다른 글자 수. 친 글을 안 주면 0. */
  wrong: number;
}

/**
 * 정확도는 **글자 단위**로 센다.
 *
 * 자소로 세면 「받침 하나 틀림」이 「글자 하나 틀림」보다 가벼워지는데, 읽는 사람에게는 똑같이
 * 틀린 글자다. 길이가 다르면 모자란 만큼도 틀린 것으로 센다 — 중간에 그만둔 것을 100% 로
 * 내주면 그 점수는 아무 뜻이 없다.
 */
export function score(text: string, seconds: number, typed?: string): TypeResult {
  if (text === '') throw new Error('칠 글이 없습니다');
  if (Number.isFinite(seconds) === false || seconds <= 0) throw new Error('걸린 시간을 0보다 크게 주세요');

  const strokes = 타건수(text);
  const perMinute = Math.round((strokes / seconds) * 60);

  if (typed === undefined) return { strokes, perMinute, accuracy: 100, wrong: 0 };

  const len = Math.max(text.length, typed.length);
  let wrong = 0;
  for (let i = 0; i < len; i++) if (text[i] !== typed[i]) wrong++;
  const accuracy = len === 0 ? 100 : Math.max(0, Math.round(((len - wrong) / len) * 1000) / 10);
  return { strokes, perMinute, accuracy, wrong };
}

export const run: ToolRunner = (op, args) => {
  const text = String(args.text ?? '');

  if (op === 'count') {
    if (text === '') throw new Error('셀 글이 없습니다');
    const strokes = 타건수(text);
    return [
      `타수: ${strokes}`,
      `글자 수: ${[...text].length}`,
      `글자당 평균: ${(strokes / [...text].length).toFixed(2)}번`,
      '',
      '※ 한국에서 쓰는 자소 기준입니다. 「낱말 수 × 5」 방식보다 대략 두 배로 나옵니다.'
    ].join('\n');
  }

  if (op === 'speed') {
    const seconds = Number(args.seconds);
    const typed = args.typed === undefined || args.typed === '' ? undefined : String(args.typed);
    const r = score(text, seconds, typed);
    const lines = [`속도: ${r.perMinute}타/분`, `타수: ${r.strokes} · 걸린 시간: ${seconds}초`];
    if (typed !== undefined) lines.push(`정확도: ${r.accuracy}% (다른 글자 ${r.wrong}개)`);
    return lines.join('\n');
  }

  throw new Error(`hangultype 에 「${op}」 는 없습니다`);
};
