/**
 * 마크다운 문법표 (TASK-KL-088)
 *
 * 「표 문법이 뭐였더라」 를 찾을 때 필요한 건 설명이 아니라 **바로 붙여 넣을 조각**이다.
 * 그래서 항목마다 실제로 동작하는 예시를 복사값으로 둔다.
 * GitHub Flavored Markdown(GFM) 기준이며, 편집기에 따라 안 되는 건 따로 표시했다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /** [복사할 조각, 이름, 설명] */
  /* 표는 **쓸 때** 짓는다 — 실려 오는 순간 지으면 말 묶음이 아직 없어 열쇠가 그대로 박힌다. */
  const md = (): Record<string, Array<[string, string, string]>> => ({
    [t('markdown.t01')]: [
      [t('markdown.t02'), t('markdown.t03'), t('markdown.t04')],
      [t('markdown.t05'), t('markdown.t06'), t('markdown.t07')],
      [t('markdown.t08'), t('markdown.t09'), t('markdown.t10')],
      ['---', t('markdown.t11'), t('markdown.t12')],
      [t('markdown.t13'), t('markdown.t14'), t('markdown.t15')],
      ['\n', t('markdown.t16'), t('markdown.t17')]
    ],
    [t('markdown.t18')]: [
      [t('markdown.t19'), t('markdown.t20'), t('markdown.t21')],
      [t('markdown.t22'), t('markdown.t23'), t('markdown.t24')],
      [t('markdown.t25'), t('markdown.t26'), t('markdown.t27')],
      [t('markdown.t28'), t('markdown.t29'), t('markdown.t30')],
      [t('markdown.t31'), t('markdown.t32'), t('markdown.t33')],
      [t('markdown.t34'), t('markdown.t35'), t('markdown.t36')],
      [t('markdown.t37'), t('markdown.t38'), t('markdown.t39')]
    ],
    [t('markdown.t40')]: [
      [t('markdown.t41'), t('markdown.t42'), t('markdown.t43')],
      [t('markdown.t44'), t('markdown.t45'), t('markdown.t46')],
      [t('markdown.t47'), t('markdown.t48'), t('markdown.t49')],
      [t('markdown.t50'), t('markdown.t51'), t('markdown.t52')],
      [t('markdown.s.deflist'), t('markdown.t53'), t('markdown.t54')]
    ],
    [t('markdown.t55')]: [
      [t('markdown.t56'), t('markdown.t57'), t('markdown.t58')],
      [t('markdown.t59'), t('markdown.t60'), t('markdown.t61')],
      [t('markdown.t62'), t('markdown.t63'), t('markdown.t64')],
      [t('markdown.t65'), t('markdown.t66'), t('markdown.t67')],
      ['<https://example.com>', t('markdown.t68'), t('markdown.t69')],
      ['[^1]', t('markdown.t70'), t('markdown.t71')]
    ],
    [t('markdown.t72')]: [
      ['```js\ncode\n```', t('markdown.t73'), t('markdown.t74')],
      [t('markdown.s.diff'), t('markdown.t75'), t('markdown.t76')],
      [t('markdown.t77'), t('markdown.t78'), t('markdown.t79')]
    ],
    [t('markdown.t80')]: [
      [t('markdown.s.table'), t('markdown.t81'), t('markdown.t82')],
      [t('markdown.s.tableAlign'), t('markdown.t83'), t('markdown.t84')]
    ],
    [t('markdown.t85')]: [
      [t('markdown.s.tasklist'), t('markdown.t86'), t('markdown.t87')],
      [t('markdown.t88'), t('markdown.t89'), t('markdown.t90')],
      ['#123', t('markdown.t91'), t('markdown.t92')],
      ['```mermaid\ngraph TD;\nA-->B;\n```', t('markdown.t93'), t('markdown.t94')],
      [t('markdown.s.alert'), t('markdown.t95'), 'NOTE·TIP·IMPORTANT·WARNING·CAUTION'],
      [t('markdown.s.details'), t('markdown.t96'), t('markdown.t97')]
    ],
    [t('markdown.t98')]: [
      [t('markdown.s.escape'), t('markdown.t99'), t('markdown.t100')],
      ['&nbsp;', t('markdown.t101'), t('markdown.t102')],
      ['<br>', t('markdown.t103'), t('markdown.t104')],
      [t('markdown.t105'), t('markdown.t106'), t('markdown.t107')]
    ]
  });

  Toolbox.register({
    id: 'markdown',
    title: t('widgets.markdown.title', undefined, "마크다운 문법표"),
    category: 'ref',
    desc: t('widgets-desc.markdown.desc', undefined, "제목·표·코드블록·체크박스 등 마크다운 문법을 찾아 그대로 복사합니다 (GFM 기준)"),
    layout: 'wide',
    icon: '<rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 15V9l3 3 3-3v6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 9v4M15 12l2 2 2-2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('markdown.t110', undefined, "문법표"),
        build: function (container: HTMLElement): void {
          void loadNamespace('markdown').then(function () {

          Mdd.linePreset('tool_run', { msg: t('markdown.t111') });
          const table = md();
          const items = Object.keys(table).flatMap((group) =>
            table[group].map(([copy, label, desc]) => ({
              copy,
              // 줄바꿈이 든 조각은 표에서 한 줄로 보여야 읽힌다.
              glyph: copy.replace(/\n/g, ' ⏎ ').slice(0, 42),
              label,
              sub: desc,
              keywords: `${label} ${desc} ${copy}`,
              group
            }))
          );
          window.RefTable?.build(container, {
            items,
            placeholder: t('markdown.t112'),
            copyNoun: t('markdown.t113'),
            layout: 'list',
            note: t('markdown.t114')
          });
                  });
        }
      }
    ]
  });
})();
