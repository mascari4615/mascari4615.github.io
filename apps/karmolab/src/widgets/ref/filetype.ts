/**
 * 파일 확장자표 (TASK-KL-088)
 *
 * 「이 파일 뭐로 열지」 가 진짜 질문이라 확장자 이름만으로는 답이 안 된다.
 * 그래서 항목마다 **무엇이고 무엇으로 여는지**를 붙인다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /** [확장자, 이름, 설명·여는 방법] */
  /* 표는 **쓸 때** 짓는다 — 실려 오는 순간 지으면 말 묶음이 아직 없어 열쇠가 그대로 박힌다. */
  const ft = (): Record<string, Array<[string, string, string]>> => ({
    이미지: [
      ['.jpg', t('filetype.t01'), t('filetype.t02')],
      ['.png', t('filetype.t03'), t('filetype.t04')],
      ['.webp', 'WebP', t('filetype.t05')],
      ['.avif', 'AVIF', t('filetype.t06')],
      ['.gif', t('filetype.t07'), t('filetype.t08')],
      ['.svg', t('filetype.t09'), t('filetype.t10')],
      ['.heic', t('filetype.t11'), t('filetype.t12')],
      ['.psd', t('filetype.t13'), t('filetype.t14')],
      ['.raw / .cr2 / .nef', t('filetype.t15'), t('filetype.t16')],
      ['.ico', t('filetype.t17'), t('filetype.t18')]
    ],
    문서: [
      ['.pdf', t('filetype.t19'), t('filetype.t20')],
      ['.docx', t('filetype.t21'), t('filetype.t22')],
      ['.hwp / .hwpx', t('filetype.t23'), t('filetype.t24')],
      ['.xlsx', t('filetype.t25'), t('filetype.t26')],
      ['.pptx', t('filetype.t27'), ''],
      ['.txt', t('filetype.t28'), t('filetype.t29')],
      ['.md', t('filetype.t30'), t('filetype.t31')],
      ['.csv', t('filetype.t32'), t('filetype.t33')],
      ['.epub', t('filetype.t34'), t('filetype.t35')]
    ],
    [t('filetype.t36')]: [
      ['.zip', t('filetype.t37'), t('filetype.t38')],
      ['.7z', t('filetype.t39'), t('filetype.t40')],
      ['.rar', t('filetype.t41'), t('filetype.t42')],
      ['.tar.gz / .tgz', t('filetype.t43'), t('filetype.t44')],
      ['.iso', t('filetype.t45'), t('filetype.t46')],
      ['.dmg', t('filetype.t47'), t('filetype.t48')]
    ],
    [t('filetype.t49')]: [
      ['.mp4', t('filetype.t50'), t('filetype.t51')],
      ['.mkv', t('filetype.t52'), t('filetype.t53')],
      ['.mov', t('filetype.t54'), t('filetype.t55')],
      ['.webm', t('filetype.t56'), t('filetype.t57')],
      ['.mp3', t('filetype.t58'), t('filetype.t59')],
      ['.flac', t('filetype.t60'), t('filetype.t61')],
      ['.wav', t('filetype.t62'), t('filetype.t63')],
      ['.aac / .m4a', t('filetype.t64'), t('filetype.t65')],
      ['.srt', t('filetype.t66'), t('filetype.t67')]
    ],
    [t('filetype.t68')]: [
      ['.js / .ts', t('filetype.t69'), t('filetype.t70')],
      ['.py', t('filetype.t71'), ''],
      ['.json', t('filetype.t72'), t('filetype.t73')],
      ['.yml / .yaml', t('filetype.t74'), t('filetype.t75')],
      ['.env', t('filetype.t76'), t('filetype.t77')],
      ['.lock', t('filetype.t78'), t('filetype.t79')],
      ['.log', t('filetype.t80'), t('filetype.t81')],
      ['.sh / .ps1 / .bat', t('filetype.t82'), t('filetype.t83')]
    ],
    [t('filetype.t84')]: [
      ['.exe', t('filetype.t85'), t('filetype.t86')],
      ['.msi', t('filetype.t87'), ''],
      ['.apk', t('filetype.t88'), t('filetype.t89')],
      ['.app', t('filetype.t90'), t('filetype.t91')],
      ['.dll / .so', t('filetype.t92'), t('filetype.t93')],
      ['.tmp', t('filetype.t94'), t('filetype.t95')],
      ['.lnk', t('filetype.t96'), t('filetype.t97')]
    ],
    글꼴: [
      ['.ttf', t('filetype.t98'), t('filetype.t99')],
      ['.otf', t('filetype.t100'), t('filetype.t101')],
      ['.woff2', t('filetype.t102'), t('filetype.t103')]
    ]
  });

  Toolbox.register({
    id: 'filetype',
    title: t('widgets.filetype.title', undefined, "파일 확장자표"),
    category: 'ref',
    desc: t('widgets-desc.filetype.desc', undefined, "확장자가 무슨 파일이고 무엇으로 여는지 찾아봅니다. 이미지·문서·압축·코드 등"),
    layout: 'wide',
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M8 15h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('filetype.t106', undefined, "확장자"),
        build: function (container: HTMLElement): void {
          void loadNamespace('filetype').then(function () {

          Mdd.linePreset('tool_run', { msg: t('filetype.t107') });
          const table = ft();
          const items = Object.keys(table).flatMap((group) =>
            table[group].map(([ext, label, desc]) => ({
              copy: ext,
              glyph: ext,
              label,
              sub: desc,
              keywords: `${ext} ${label} ${desc}`,
              group
            }))
          );
          window.RefTable?.build(container, {
            items,
            placeholder: t('filetype.t108'),
            copyNoun: t('filetype.t106'),
            layout: 'list',
            note: t('filetype.t109')
          });
                  });
        }
      }
    ]
  });
})();
