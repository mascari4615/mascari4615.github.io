/**
 * 그림 속 글자 읽기. 무엇을 어디로 보낼지부터 (TASK-KL-316 / 29)
 *
 * 사진에서 글자를 뽑아 줘는 사실 **세 갈래**다. 갈래를 안 가르고 한 길로 밀면 셋 다 나빠진다:
 *
 *   ① 글자가 들어 있는 PDF. 뽑기만 하면 된다. **이미 `pdf2text` 가 한다** (여기서 다시 안 만든다).
 *   ② 스캔 PDF, 사진. 진짜 읽기가 필요하다. 모형이 있어야 하고, 그건 켠 사람만 받는다(`lib/ai-engine`).
 *   ③ 삐뚤고 그림자 진 사진. 읽기 전에 **펴고 다듬어야** 한다 (`core/docscan`).
 *
 * 이 알맹이는 **가르고 다듬는 일**을 맡는다. 읽는 일은 모형이, 뽑는 일은 pdf2text 가 한다.
 * 그리고 못 하는 경우를 **못 한다고 말한다**. 조용히 빈 글을 주면 사람이 자기 사진을 의심한다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'ocr',
  ops: {
    route: {
      desc:
        'Say how a file should be handled: extract text (PDF with text), recognise text (image or scanned PDF), or fix it up first.',
      in: { kind: 'string', hasText: 'boolean?' },
      out: 'string'
    },
    tidy: {
      desc: 'Clean recognised text: join broken lines, drop stray line numbers, normalise spaces.',
      in: { text: 'string' },
      out: 'string'
    }
  }
};

export type Route = 'extract' | 'recognise' | 'unsupported';

export interface Plan {
  route: Route;
  /** 화면이 무엇으로 보낼지 아는 도구 id */
  tool?: 'pdf2text' | 'ocr';
  /** 읽기 전에 다듬으면 좋은가 */
  preprocess: boolean;
  /** 왜 이 길인지 (i18n 열쇠) */
  why: string;
}

/** 무엇이 왔나로 길을 고른다. **글자가 든 PDF 를 읽기 모형에 보내는 건 낭비이자 오답의 원인**이다. */
export function route(kind: string, hasText = false): Plan {
  const lower = kind.toLowerCase();
  if (lower.includes('pdf')) {
    return hasText
      ? { route: 'extract', tool: 'pdf2text', preprocess: false, why: 'pdfHasText' }
      : { route: 'recognise', tool: 'ocr', preprocess: true, why: 'pdfScanned' };
  }
  if (lower.startsWith('image/') || /(jpe?g|png|webp|bmp|gif|tiff?)$/i.test(lower)) {
    return { route: 'recognise', tool: 'ocr', preprocess: true, why: 'image' };
  }
  return { route: 'unsupported', preprocess: false, why: 'unknownKind' };
}

/** 읽기 모형. 언어마다 다른 것을 쓴다. **아는 것만** 적고, 없으면 없다고 한다. */
export const MODELS: Record<string, { id: string; sizeMb: number; languages: string[] }> = {
  latin: { id: 'Xenova/trocr-small-printed', sizeMb: 60, languages: ['en', 'de', 'fr', 'es'] },
  handwriting: { id: 'Xenova/trocr-small-handwritten', sizeMb: 60, languages: ['en'] }
};

/** 한국어, 일본어는 아직 이 길로 못 읽는다. **되는 척하지 않는다.** */
export function modelFor(language: string): { id: string; sizeMb: number } | undefined {
  if (language === 'ko' || language === 'ja' || language === 'zh') return undefined;
  const found = Object.values(MODELS).find((m) => m.languages.includes(language));
  return found === undefined ? undefined : { id: found.id, sizeMb: found.sizeMb };
}

/**
 * 읽어 온 글 다듬기. 스캔에서 오는 세 가지를 손본다:
 * 줄 끝에서 잘린 낱말, 쪽 번호만 있는 줄, 늘어난 빈칸.
 */
export function tidy(text: string): string {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim());

  const kept: string[] = [];
  for (const line of lines) {
    /* 쪽 번호만 있는 줄은 글이 아니다 (붙여 놓으면 문장 가운데에 숫자가 낀다) */
    if (/^[--. ]?\s*\d{1,4}\s*[--. ]?$/.test(line)) continue;
    kept.push(line);
  }

  const out: string[] = [];
  for (const line of kept) {
    const last = out[out.length - 1];
    if (line === '') {
      if (last !== '') out.push('');
      continue;
    }
    if (last === undefined || last === '') {
      out.push(line);
      continue;
    }
    /* 앞 줄이 붙임표로 끝나면 낱말이 잘린 것이다. 붙임표를 떼고 잇는다 */
    if (/[A-Za-z][-‐]$/.test(last)) {
      out[out.length - 1] = last.slice(0, -1) + line;
      continue;
    }
    /*
     * 문장이 안 끝났으면 이어지는 줄이다.
     * **한국어는 낱말을 띄어 쓴다**. 줄이 바뀌는 자리는 대개 낱말 사이라 빈칸을 넣어야 한다.
     * 일본어, 중국어는 낱말을 안 띄우므로 빈칸을 넣으면 없던 틈이 생긴다. 그 둘만 붙여 잇는다.
     */
    if (!/[.!?。？！:;]$/.test(last)) {
      const cjkNoSpace = /[ぁ-ヿ一-鿿]$/.test(last) && /^[ぁ-ヿ一-鿿]/.test(line);
      const glue = cjkNoSpace ? '' : ' ';
      out[out.length - 1] = last + glue + line;
      continue;
    }
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** 읽은 결과가 쓸 만한가. 빈 글을 조용히 주는 것을 막는 자리. */
export function looksEmpty(text: string): boolean {
  const letters = text.replace(/[\s\d\p{P}\p{S}]/gu, '');
  return letters.length < 3;
}

export const run: ToolRunner = (op, args) => {
  if (op === 'route') {
    const plan = route(String(args.kind ?? ''), args.hasText === true);
    return plan.route + (plan.tool === undefined ? '' : ' → ' + plan.tool) + (plan.preprocess ? ' (clean up first)' : '') + '  [' + plan.why + ']';
  }
  if (op === 'tidy') return tidy(String(args.text ?? ''));
  throw new Error('ocr: 모르는 연산 ' + op);
};
