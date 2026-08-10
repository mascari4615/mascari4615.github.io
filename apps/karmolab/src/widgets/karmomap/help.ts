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
    title: t('karmomap.help.sec.draw'),
    items: [
      { what: t('karmomap.t02'), how: t('karmomap.t03') },
      { what: t('karmomap.t04'), how: t('karmomap.t05') },
      { what: t('karmomap.t06'), how: t('karmomap.t07') },
      { what: t('karmomap.t08'), how: t('karmomap.t09') },
      { what: t('karmomap.t10'), how: t('karmomap.t11') },
      { what: t('karmomap.t12'), how: t('karmomap.t13') },
      { what: t('karmomap.t14'), how: t('karmomap.t15') },
      { what: t('karmomap.t16'), how: t('karmomap.t17') },
      { what: t('karmomap.t18'), how: t('karmomap.t19') },
    ],
  },
  {
    title: t('karmomap.help.sec.select'),
    items: [
      { what: t('karmomap.t21'), how: t('karmomap.t22') },
      { what: t('karmomap.t23'), how: t('karmomap.t24') },
      { what: t('karmomap.t25'), how: 'Tab / Shift+Tab' },
      { what: t('karmomap.t26'), how: t('karmomap.t27') },
      { what: t('karmomap.t28'), how: 'Enter' },
      { what: t('karmomap.t29'), how: 'Delete' },
      { what: t('karmomap.t30'), how: 'Esc' },
      { what: t('karmomap.t31'), how: 'Ctrl+Z / Ctrl+Y' },
      { what: t('karmomap.t32'), how: t('karmomap.t33') },
    ],
  },
  {
    title: t('karmomap.help.sec.read'),
    items: [
      { what: t('karmomap.t35'), how: t('karmomap.t36') },
      { what: t('karmomap.t37'), how: t('karmomap.t38') },
      { what: t('karmomap.t39'), how: t('karmomap.t40') },
      { what: t('karmomap.t41'), how: t('karmomap.t42') },
      { what: t('karmomap.t43'), how: t('karmomap.t44') },
      { what: t('karmomap.t45'), how: t('karmomap.t46') },
      { what: t('karmomap.t47'), how: t('karmomap.t48') },
      { what: t('karmomap.t49'), how: t('karmomap.t50') },
      { what: t('karmomap.t51'), how: t('karmomap.t52') },
      { what: t('karmomap.t53'), how: t('karmomap.t54') },
      { what: t('karmomap.t55'), how: t('karmomap.t56') },
      { what: t('karmomap.t57'), how: t('karmomap.t58') },
    ],
  },
  {
    title: t('karmomap.help.sec.text'),
    items: [
      { what: t('karmomap.t60'), how: t('karmomap.t61') },
      { what: t('karmomap.t62'), how: t('karmomap.t63') },
      { what: t('karmomap.t64'), how: t('karmomap.t65') },
      { what: t('karmomap.t66'), how: t('karmomap.t67') },
      { what: t('karmomap.t68'), how: t('karmomap.t69') },
      { what: t('karmomap.t70'), how: t('karmomap.t71') },
    ],
  },
  {
    title: t('karmomap.help.sec.export'),
    items: [
      { what: t('karmomap.t73'), how: t('karmomap.t74') },
      { what: t('karmomap.t75'), how: t('karmomap.t76') },
      { what: t('karmomap.t77'), how: t('karmomap.t78') },
      { what: t('karmomap.t79'), how: t('karmomap.t80') },
      { what: t('karmomap.t81'), how: t('karmomap.t82') },
      { what: t('karmomap.t83'), how: t('karmomap.t84') },
      { what: t('karmomap.t85'), how: t('karmomap.t86') },
      { what: t('karmomap.t87'), how: t('karmomap.t88') },
      { what: t('karmomap.t89'), how: '⋯ → ✒ / 🗂 / 📄' },
      { what: t('karmomap.t90'), how: t('karmomap.t91') },
    ],
  },
];
