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
      { what: t('karmograph.t02'), how: t('karmograph.t03') },
      { what: t('karmograph.help.renameWhat'), how: t('karmograph.help.renameHow') },
      { what: t('karmograph.t04'), how: t('karmograph.t05') },
      { what: t('karmograph.t06'), how: t('karmograph.t07') },
      { what: t('karmograph.t08'), how: t('karmograph.t09') },
      { what: t('karmograph.t10'), how: t('karmograph.t11') },
      { what: t('karmograph.t12'), how: t('karmograph.t13') },
      { what: t('karmograph.t14'), how: t('karmograph.t15') },
      { what: t('karmograph.t16'), how: t('karmograph.t17') },
      { what: t('karmograph.t18'), how: t('karmograph.t19') },
    ],
  },
  {
    title: t('karmograph.help.sec.select'),
    items: [
      { what: t('karmograph.t21'), how: t('karmograph.t22') },
      { what: t('karmograph.t23'), how: t('karmograph.t24') },
      { what: t('karmograph.t25'), how: 'Tab / Shift+Tab' },
      { what: t('karmograph.help.selectAll'), how: 'Ctrl+A' },
      { what: t('karmograph.t26'), how: t('karmograph.t27') },
      { what: t('karmograph.t28'), how: 'Enter' },
      { what: t('karmograph.t29'), how: 'Delete' },
      { what: t('karmograph.t30'), how: 'Esc' },
      { what: t('karmograph.t31'), how: 'Ctrl+Z / Ctrl+Y' },
      { what: t('karmograph.t32'), how: t('karmograph.t33') },
    ],
  },
  {
    title: t('karmograph.help.sec.read'),
    items: [
      { what: t('karmograph.t35'), how: t('karmograph.t36') },
      { what: t('karmograph.t37'), how: t('karmograph.t38') },
      { what: t('karmograph.t39'), how: t('karmograph.t40') },
      { what: t('karmograph.t41'), how: t('karmograph.t42') },
      { what: t('karmograph.t43'), how: t('karmograph.t44') },
      { what: t('karmograph.t45'), how: t('karmograph.t46') },
      { what: t('karmograph.t47'), how: t('karmograph.t48') },
      { what: t('karmograph.t49'), how: t('karmograph.t50') },
      { what: t('karmograph.t51'), how: t('karmograph.t52') },
      { what: t('karmograph.t53'), how: t('karmograph.t54') },
      { what: t('karmograph.t55'), how: t('karmograph.t56') },
      { what: t('karmograph.t57'), how: t('karmograph.t58') },
    ],
  },
  {
    title: t('karmograph.help.sec.text'),
    items: [
      { what: t('karmograph.t60'), how: t('karmograph.t61') },
      { what: t('karmograph.t62'), how: t('karmograph.t63') },
      { what: t('karmograph.t64'), how: t('karmograph.t65') },
      { what: t('karmograph.t66'), how: t('karmograph.t67') },
      { what: t('karmograph.t68'), how: t('karmograph.t69') },
      { what: t('karmograph.t70'), how: t('karmograph.t71') },
    ],
  },
  {
    title: t('karmograph.help.sec.export'),
    items: [
      { what: t('karmograph.t73'), how: t('karmograph.t74') },
      { what: t('karmograph.t75'), how: t('karmograph.t76') },
      { what: t('karmograph.t77'), how: t('karmograph.t78') },
      { what: t('karmograph.t79'), how: t('karmograph.t80') },
      { what: t('karmograph.t81'), how: t('karmograph.t82') },
      { what: t('karmograph.t83'), how: t('karmograph.t84') },
      { what: t('karmograph.t85'), how: t('karmograph.t86') },
      { what: t('karmograph.t87'), how: t('karmograph.t88') },
      { what: t('karmograph.t89'), how: '⋯ → ✒ / 🗂 / 📄' },
      { what: t('karmograph.t90'), how: t('karmograph.t91') },
    ],
  },
];
