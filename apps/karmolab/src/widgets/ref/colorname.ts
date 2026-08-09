/**
 * CSS 색상 이름표 (TASK-KL-088) — 148개 표준 색상 이름 ↔ HEX.
 * 이름 목록만 두고 HEX 는 브라우저에게 물어본다 (캔버스가 CSS 색을 파싱하므로 표를 손으로 안 적어도 된다).
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /* 이름은 **쓸 때** 정한다 — 실려 오는 순간 지으면 말 묶음이 아직 없어 열쇠가 그대로 박힌다. */
  const names = (): Array<[string, string]> => [
    ['red', t('colorname.t01')], ['crimson', t('colorname.t02')], ['darkred', t('colorname.t03')], ['firebrick', t('colorname.t04')], ['indianred', t('colorname.t05')],
    ['lightcoral', t('colorname.t06')], ['salmon', t('colorname.t07')], ['darksalmon', t('colorname.t08')], ['lightsalmon', t('colorname.t09')], ['tomato', t('colorname.t10')],
    ['orangered', t('colorname.t11')], ['orange', t('colorname.t12')], ['darkorange', t('colorname.t13')], ['coral', t('colorname.t14')], ['gold', t('colorname.t15')],
    ['yellow', t('colorname.t16')], ['lightyellow', t('colorname.t17')], ['lemonchiffon', t('colorname.t18')], ['khaki', t('colorname.t19')], ['darkkhaki', t('colorname.t20')],
    ['moccasin', t('colorname.t21')], ['peachpuff', t('colorname.t22')], ['papayawhip', t('colorname.t23')], ['cornsilk', t('colorname.t24')], ['ivory', t('colorname.t25')],
    ['beige', t('colorname.t26')], ['wheat', t('colorname.t27')], ['tan', t('colorname.t28')], ['burlywood', t('colorname.t29')], ['sandybrown', t('colorname.t30')],
    ['peru', t('colorname.t31')], ['chocolate', t('colorname.t32')], ['sienna', t('colorname.t33')], ['saddlebrown', t('colorname.t34')], ['brown', t('colorname.t35')],
    ['maroon', t('colorname.t36')], ['rosybrown', t('colorname.t37')],
    ['green', t('colorname.t38')], ['darkgreen', t('colorname.t39')], ['forestgreen', t('colorname.t40')], ['seagreen', t('colorname.t41')], ['mediumseagreen', t('colorname.t42')],
    ['limegreen', t('colorname.t43')], ['lime', t('colorname.t44')], ['lawngreen', t('colorname.t45')], ['chartreuse', t('colorname.t46')], ['greenyellow', t('colorname.t47')],
    ['springgreen', t('colorname.t48')], ['mediumspringgreen', t('colorname.t49')], ['lightgreen', t('colorname.t50')], ['palegreen', t('colorname.t51')],
    ['darkseagreen', t('colorname.t52')], ['olive', t('colorname.t53')], ['olivedrab', t('colorname.t54')], ['darkolivegreen', t('colorname.t55')],
    ['yellowgreen', t('colorname.t56')], ['teal', t('colorname.t57')], ['darkcyan', t('colorname.t58')], ['lightseagreen', t('colorname.t59')],
    ['cyan', t('colorname.t60')], ['aqua', t('colorname.t61')], ['aquamarine', t('colorname.t62')], ['turquoise', t('colorname.t63')], ['mediumturquoise', t('colorname.t64')],
    ['darkturquoise', t('colorname.t65')], ['paleturquoise', t('colorname.t66')], ['lightcyan', t('colorname.t67')], ['cadetblue', t('colorname.t68')],
    ['powderblue', t('colorname.t69')], ['lightblue', t('colorname.t70')], ['skyblue', t('colorname.t71')], ['lightskyblue', t('colorname.t72')],
    ['deepskyblue', t('colorname.t73')], ['dodgerblue', t('colorname.t74')], ['cornflowerblue', t('colorname.t75')], ['steelblue', t('colorname.t76')],
    ['royalblue', t('colorname.t77')], ['blue', t('colorname.t78')], ['mediumblue', t('colorname.t79')], ['darkblue', t('colorname.t80')], ['navy', t('colorname.t81')],
    ['midnightblue', t('colorname.t82')], ['slateblue', t('colorname.t83')], ['darkslateblue', t('colorname.t84')],
    ['mediumslateblue', t('colorname.t85')], ['blueviolet', t('colorname.t86')], ['indigo', t('colorname.t87')], ['darkviolet', t('colorname.t88')],
    ['darkorchid', t('colorname.t89')], ['darkmagenta', t('colorname.t90')], ['purple', t('colorname.t91')], ['rebeccapurple', t('colorname.t92')],
    ['magenta', t('colorname.t93')], ['fuchsia', t('colorname.t94')], ['orchid', t('colorname.t95')], ['mediumorchid', t('colorname.t96')], ['mediumpurple', t('colorname.t97')],
    ['violet', t('colorname.t98')], ['plum', t('colorname.t99')], ['thistle', t('colorname.t100')], ['lavender', t('colorname.t101')], ['pink', t('colorname.t102')],
    ['lightpink', t('colorname.t103')], ['hotpink', t('colorname.t104')], ['deeppink', t('colorname.t105')], ['palevioletred', t('colorname.t106')],
    ['mediumvioletred', t('colorname.t107')],
    ['white', t('colorname.t108')], ['snow', t('colorname.t109')], ['honeydew', t('colorname.t110')], ['mintcream', t('colorname.t111')], ['azure', t('colorname.t112')],
    ['aliceblue', t('colorname.t113')], ['ghostwhite', t('colorname.t114')], ['whitesmoke', t('colorname.t115')], ['seashell', t('colorname.t116')],
    ['oldlace', t('colorname.t117')], ['floralwhite', t('colorname.t118')], ['linen', t('colorname.t119')], ['antiquewhite', t('colorname.t120')],
    ['blanchedalmond', t('colorname.t121')], ['bisque', t('colorname.t122')], ['navajowhite', t('colorname.t123')], ['mistyrose', t('colorname.t124')],
    ['lavenderblush', t('colorname.t125')], ['gainsboro', t('colorname.t126')], ['lightgray', t('colorname.t127')], ['silver', t('colorname.t128')],
    ['darkgray', t('colorname.t129')], ['gray', t('colorname.t130')], ['dimgray', t('colorname.t131')], ['lightslategray', t('colorname.t132')],
    ['slategray', t('colorname.t133')], ['darkslategray', t('colorname.t134')], ['black', t('colorname.t135')]
  ];

  function hexOf(name: string): string {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.fillStyle = name;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  function groupOf(name: string): string {
    if (/red|crimson|firebrick|tomato|salmon|coral|maroon/.test(name)) return t('colorname.t136');
    if (/orange|gold|peru|chocolate|sienna|brown|tan|wheat|sandy|burly/.test(name)) return t('colorname.t137');
    if (/yellow|khaki|lemon|corn|ivory|beige|moccasin|papaya|peach/.test(name)) return t('colorname.t138');
    if (/green|lime|olive|chartreuse|spring/.test(name)) return t('colorname.t139');
    if (/cyan|aqua|turquoise|teal|cadet/.test(name)) return t('colorname.t140');
    if (/blue|navy|azure|sky|steel|slate(?!gray)|indigo|cornflower|dodger|royal|midnight/.test(name)) return t('colorname.t141');
    if (/purple|violet|orchid|magenta|fuchsia|plum|thistle|lavender(?!blush)/.test(name)) return t('colorname.t142');
    if (/pink|rose/.test(name)) return t('colorname.t143');
    return t('colorname.t144');
  }

  Toolbox.register({
    id: 'colorname',
    title: t('widgets.colorname.title', undefined, "CSS 색상 이름표"),
    category: 'ref',
    desc: t('widgets-desc.colorname.desc', undefined, "CSS 표준 색상 이름 148개와 HEX 값을 눈으로 비교하고 눌러서 복사합니다"),
    layout: 'wide',
    icon: '<path d="M12 3a9 9 0 1 0 0 18h2a3 3 0 0 0 0-6h-1a2 2 0 0 1 0-4h2a5 5 0 0 0-3-8z" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="8" cy="10" r="1.2" fill="currentColor"/><circle cx="12" cy="7" r="1.2" fill="currentColor"/>',
    tabs: [
      {
        id: 'app',
        label: t('colorname.t147', undefined, "색상 이름"),
        build: function (container: HTMLElement): void {
          void loadNamespace('colorname').then(function () {

          Mdd.linePreset('tool_run', { msg: t('colorname.t148') });
          window.RefTable?.build(container, {
            items: names().map(([name, ko]) => {
              const hex = hexOf(name);
              return {
                copy: name,
                glyph: name,
                label: `${name} · ${ko}`,
                sub: hex,
                keywords: `${name} ${ko} ${hex}`,
                group: groupOf(name),
                color: name
              };
            }),
            placeholder: t('colorname.t149'),
            copyNoun: t('colorname.t147'),
            layout: 'grid',
            note: t('colorname.t150')
          });
                  });
        }
      }
    ]
  });
})();
