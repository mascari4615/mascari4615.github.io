/**
 * 단축키 모음 (TASK-KL-088)
 *
 * 단축키표는 「외운 것을 확인」 이 아니라 「이런 게 있는 줄 몰랐다」 를 위해 존재한다.
 * 그래서 목록을 다 싣지 않고, **알면 실제로 쓰게 되는 것**만 남긴다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /** [단축키, 하는 일, 비고] */
  /* 표는 **쓸 때** 짓는다 — 실려 오는 순간 지으면 말 묶음이 아직 없어 열쇠가 그대로 박힌다. */
  const sc = (): Record<string, Array<[string, string, string]>> => ({
    [t('shortcut.t01')]: [
      ['Win + D', t('shortcut.t02'), t('shortcut.t03')],
      ['Win + E', t('shortcut.t04'), ''],
      ['Win + L', t('shortcut.t05'), t('shortcut.t06')],
      ['Win + V', t('shortcut.t07'), t('shortcut.t08')],
      ['Win + Shift + S', t('shortcut.t09'), t('shortcut.t10')],
      ['Win + .', t('shortcut.t11'), t('shortcut.t12')],
      [t('shortcut.t13'), t('shortcut.t14'), t('shortcut.t15')],
      ['Win + Tab', t('shortcut.t16'), ''],
      ['Ctrl + Shift + Esc', t('shortcut.t17'), t('shortcut.t18')],
      ['Alt + Tab', t('shortcut.t19'), ''],
      ['F2', t('shortcut.t20'), t('shortcut.t21')],
      ['Shift + Delete', t('shortcut.t22'), t('shortcut.t23')]
    ],
    [t('shortcut.t24')]: [
      ['Cmd + Space', t('shortcut.t25'), t('shortcut.t26')],
      ['Cmd + Tab', t('shortcut.t27'), ''],
      ['Cmd + Shift + 4', t('shortcut.t09'), t('shortcut.t28')],
      ['Cmd + Shift + 5', t('shortcut.t29'), ''],
      ['Cmd + Option + Esc', t('shortcut.t30'), ''],
      ['Cmd + ,', t('shortcut.t31'), t('shortcut.t32')],
      ['Ctrl + Cmd + Space', t('shortcut.t11'), ''],
      ['Cmd + Delete', t('shortcut.t33'), '']
    ],
    [t('shortcut.t34')]: [
      ['Ctrl / Cmd + Z', t('shortcut.t35'), ''],
      ['Ctrl / Cmd + Shift + Z', t('shortcut.t36'), t('shortcut.t37')],
      ['Ctrl / Cmd + Shift + V', t('shortcut.t38'), t('shortcut.t39')],
      ['Ctrl / Cmd + F', t('shortcut.t40'), ''],
      ['Ctrl / Cmd + A', t('shortcut.t41'), ''],
      ['Ctrl / Cmd + S', t('shortcut.t42'), ''],
      ['Home / End', t('shortcut.t43'), t('shortcut.t44')],
      [t('shortcut.t45'), t('shortcut.t46'), t('shortcut.t47')]
    ],
    브라우저: [
      ['Ctrl / Cmd + T', t('shortcut.t48'), ''],
      ['Ctrl / Cmd + Shift + T', t('shortcut.t49'), t('shortcut.t50')],
      ['Ctrl / Cmd + W', t('shortcut.t51'), ''],
      ['Ctrl / Cmd + L', t('shortcut.t52'), t('shortcut.t53')],
      ['Ctrl / Cmd + Shift + N', t('shortcut.t54'), t('shortcut.t55')],
      ['Ctrl / Cmd + Shift + R', t('shortcut.t56'), t('shortcut.t57')],
      [t('shortcut.t58'), t('shortcut.t59'), t('shortcut.t60')],
      ['F12', t('shortcut.t61'), ''],
      ['Space / Shift + Space', t('shortcut.t62'), '']
    ],
    'VS Code': [
      ['Ctrl / Cmd + P', t('shortcut.t63'), t('shortcut.t64')],
      ['Ctrl / Cmd + Shift + P', t('shortcut.t65'), t('shortcut.t66')],
      ['Ctrl / Cmd + D', t('shortcut.t67'), t('shortcut.t68')],
      ['Alt + ↑ / ↓', t('shortcut.t69'), t('shortcut.t70')],
      ['Shift + Alt + ↑ / ↓', t('shortcut.t71'), ''],
      ['Ctrl / Cmd + /', t('shortcut.t72'), ''],
      ['Ctrl + `', t('shortcut.t73'), ''],
      ['Ctrl / Cmd + Shift + F', t('shortcut.t74'), t('shortcut.t75')],
      ['F2', t('shortcut.t76'), t('shortcut.t77')],
      [t('shortcut.t78'), t('shortcut.t79'), '']
    ],
    한글입력: [
      [t('shortcut.t80'), t('shortcut.t81'), t('shortcut.t82')],
      ['Shift + Space', t('shortcut.t83'), t('shortcut.t84')],
      [t('shortcut.t85'), t('shortcut.t86'), t('shortcut.t87')],
      [t('shortcut.t88'), t('shortcut.t89'), t('shortcut.t90')]
    ]
  });

  Toolbox.register({
    id: 'shortcut',
    title: t('widgets.shortcut.title', undefined, "단축키 모음"),
    category: 'ref',
    desc: t('widgets-desc.shortcut.desc', undefined, "윈도우·맥·브라우저·VS Code 단축키 중 알면 실제로 쓰게 되는 것만 모았습니다"),
    layout: 'wide',
    icon: '<rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 9h1M10 9h1M14 9h1M18 9h1M6 13h1M10 13h5M18 13h1M8 16.5h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('shortcut.t93', undefined, "단축키"),
        build: function (container: HTMLElement): void {
          void loadNamespace('shortcut').then(function () {

          Mdd.linePreset('tool_run', { msg: t('shortcut.t94') });
          const table = sc();
          const items = Object.keys(table).flatMap((group) =>
            table[group].map(([key, label, desc]) => ({
              copy: key,
              glyph: key,
              label,
              sub: desc,
              keywords: `${key} ${label} ${desc}`,
              group
            }))
          );
          window.RefTable?.build(container, {
            items,
            placeholder: t('shortcut.t95'),
            copyNoun: t('shortcut.t93'),
            layout: 'list',
            note: t('shortcut.t96')
          });
                  });
        }
      }
    ]
  });
})();
