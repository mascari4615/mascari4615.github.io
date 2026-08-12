/**
 * help.ts — 무엇을 할 수 있는지 (TASK-KL-202 격차 AA).
 *
 * 기능이 서른 개 가까이 쌓이는 동안 안내는 빈 화면의 두 줄이 전부였다. **못 찾는 기능은
 * 없는 것과 같다** — 도달성 문제다.
 *
 * 여기 목록은 「메뉴가 곧 배우는 자리」라는 오래된 규칙을 따른다: 할 수 있는 일과 그 단축키를
 * 한자리에 나란히 둔다. 새 기능을 넣을 때 **이 파일에 한 줄 안 늘면 그 기능은 숨은 것**이다.
 */
import { t } from '../../lib/i18n';


export interface HelpItem {
  /** 무엇을 하나 — 사람 말로. */
  what: string;
  /** 어떻게 — 어디를 누르나 / 어떤 키인가. */
  how: string;
}

export interface HelpSection {
  title: string;
  items: HelpItem[];
}

/* 목록은 **읽을 때 만든다** — 이 파일은 화면보다 먼저 뜨므로 값으로 두면 한국어로 굳는다. */
export const help = (): HelpSection[] => [
  {
    title: t('karmograph.help.sec.draw'),
    items: [
      { what: t('karmograph.help.txt'), how: t('karmograph.help.txt2') },
      { what: t('karmograph.help.renameWhat'), how: t('karmograph.help.renameHow') },
      { what: t('karmograph.help.txt3'), how: t('karmograph.help.txt4') },
      { what: t('karmograph.help.txt5'), how: t('karmograph.help.txt6') },
      { what: t('karmograph.help.txt7'), how: t('karmograph.help.txt8') },
      { what: t('karmograph.help.txt9'), how: t('karmograph.help.txt10') },
      { what: t('karmograph.help.txt11'), how: t('karmograph.help.txt12') },
      { what: t('karmograph.help.txt13'), how: t('karmograph.help.txt14') },
      { what: t('karmograph.help.txt15'), how: t('karmograph.help.txt16') },
      { what: t('karmograph.help.txt17'), how: t('karmograph.help.txt18') },
    ],
  },
  {
    title: t('karmograph.help.sec.select'),
    items: [
      { what: t('karmograph.help.txt19'), how: t('karmograph.help.txt20') },
      { what: t('karmograph.help.txt21'), how: t('karmograph.help.txt22') },
      { what: t('karmograph.help.txt23'), how: 'Tab / Shift+Tab' },
      { what: t('karmograph.help.selectAll'), how: 'Ctrl+A' },
      { what: t('karmograph.help.resizeWhat'), how: t('karmograph.help.resizeHow') },
      { what: t('karmograph.help.guideWhat'), how: t('karmograph.help.guideHow') },
      { what: t('karmograph.help.txt24'), how: t('karmograph.help.txt25') },
      { what: t('karmograph.help.txt26'), how: 'Enter' },
      { what: t('karmograph.help.txt27'), how: 'Delete' },
      { what: t('karmograph.help.txt28'), how: 'Esc' },
      { what: t('karmograph.help.txt29'), how: 'Ctrl+Z / Ctrl+Y' },
      { what: t('karmograph.help.txt30'), how: t('karmograph.help.txt31') },
    ],
  },
  {
    title: t('karmograph.help.sec.read'),
    items: [
      { what: t('karmograph.help.txt32'), how: t('karmograph.help.txt33') },
      { what: t('karmograph.help.txt34'), how: t('karmograph.help.txt35') },
      { what: t('karmograph.help.txt36'), how: t('karmograph.help.txt37') },
      { what: t('karmograph.help.txt38'), how: t('karmograph.help.txt39') },
      { what: t('karmograph.help.txt40'), how: t('karmograph.help.txt41') },
      { what: t('karmograph.help.txt42'), how: t('karmograph.help.txt43') },
      { what: t('karmograph.help.txt44'), how: t('karmograph.help.txt45') },
      { what: t('karmograph.help.txt46'), how: t('karmograph.help.txt47') },
      { what: t('karmograph.help.txt48'), how: t('karmograph.help.txt49') },
      { what: t('karmograph.help.txt50'), how: t('karmograph.help.txt51') },
      { what: t('karmograph.help.txt52'), how: t('karmograph.help.txt53') },
      { what: t('karmograph.help.txt54'), how: t('karmograph.help.txt55') },
    ],
  },
  {
    title: t('karmograph.help.sec.text'),
    items: [
      { what: t('karmograph.help.txt56'), how: t('karmograph.help.txt57') },
      { what: t('karmograph.help.txt58'), how: t('karmograph.help.txt59') },
      { what: t('karmograph.help.txt60'), how: t('karmograph.help.txt61') },
      { what: t('karmograph.help.txt62'), how: t('karmograph.help.txt63') },
      { what: t('karmograph.help.txt64'), how: t('karmograph.help.txt65') },
      { what: t('karmograph.help.txt66'), how: t('karmograph.help.txt67') },
    ],
  },
  {
    title: t('karmograph.help.sec.export'),
    items: [
      { what: t('karmograph.help.txt68'), how: t('karmograph.help.txt69') },
      { what: t('karmograph.help.txt70'), how: t('karmograph.help.txt71') },
      { what: t('karmograph.help.txt72'), how: t('karmograph.help.txt73') },
      { what: t('karmograph.help.txt74'), how: t('karmograph.help.txt75') },
      { what: t('karmograph.help.txt76'), how: t('karmograph.help.txt77') },
      { what: t('karmograph.help.txt78'), how: t('karmograph.help.txt79') },
      { what: t('karmograph.help.txt80'), how: t('karmograph.help.txt81') },
      { what: t('karmograph.help.txt82'), how: t('karmograph.help.txt83') },
      { what: t('karmograph.help.txt84'), how: '⋯ → ✒ / 🗂 / 📄' },
      { what: t('karmograph.help.txt85'), how: t('karmograph.help.txt86') },
    ],
  },
];
