/**
 * 정규식 치트시트 (TASK-KL-088)
 *
 * 정규식은 기호 하나가 곧 규칙이라 「그 기호가 뭐였더라」 로 막힌다.
 * 그래서 항목 이름을 **하려는 일**로 적고, 복사값은 바로 붙여 쓸 조각으로 둔다.
 * 자주 쓰는 완성 패턴(이메일·전화번호 등)도 함께 — 매번 새로 짜는 게 더 위험하다.
 *
 * 조각은 대부분 역슬래시를 품는다. 보통 따옴표에 넣으면 자바스크립트가 역슬래시를 먹어
 * 화면에 \d 대신 d 가 나온다 (실제로 그렇게 배포된 적이 있다) → String.raw 로 적는다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /** [조각, 하는 일, 설명] */
  /* 표는 **쓸 때** 짓는다 — 실려 오는 순간 지으면 말 묶음이 아직 없어 열쇠가 그대로 박힌다. */
  const rx = (): Record<string, Array<[string, string, string]>> => ({
    [t('regexref.t01')]: [
      ['.', t('regexref.t02'), t('regexref.t03')],
      [String.raw`\d`, t('regexref.t04'), t('regexref.t05')],
      [String.raw`\D`, t('regexref.t06'), ''],
      [String.raw`\w`, t('regexref.t07'), t('regexref.t08')],
      [String.raw`\W`, t('regexref.t09'), ''],
      [String.raw`\s`, t('regexref.t10'), t('regexref.t11')],
      [String.raw`\S`, t('regexref.t12'), ''],
      ['[abc]', t('regexref.t13'), t('regexref.t14')],
      ['[^abc]', t('regexref.t15'), t('regexref.t16')],
      ['[a-z]', t('regexref.t17'), t('regexref.t18')],
      [t('regexref.t19'), t('regexref.t20'), t('regexref.t21')],
      ['[ㄱ-ㅎㅏ-ㅣ]', t('regexref.t22'), t('regexref.t23')]
    ],
    [t('regexref.t24')]: [
      ['*', t('regexref.t25'), t('regexref.t26')],
      ['+', t('regexref.t27'), t('regexref.t28')],
      ['?', t('regexref.t29'), t('regexref.t30')],
      ['{3}', t('regexref.t31'), ''],
      ['{2,}', t('regexref.t32'), ''],
      ['{2,5}', t('regexref.t33'), ''],
      ['+?', t('regexref.t34'), t('regexref.t35')],
      ['.*?', t('regexref.t36'), t('regexref.t37')]
    ],
    [t('regexref.t38')]: [
      ['^', t('regexref.t39'), t('regexref.t40')],
      ['$', t('regexref.t41'), ''],
      [String.raw`\b`, t('regexref.t42'), String.raw`\bcat\b 는 concat 에 안 걸린다`],
      [String.raw`\B`, t('regexref.t43'), ''],
      ['(?=abc)', t('regexref.t44'), t('regexref.t45')],
      ['(?!abc)', t('regexref.t46'), ''],
      ['(?<=abc)', t('regexref.t47'), t('regexref.t48')],
      ['(?<!abc)', t('regexref.t49'), '']
    ],
    [t('regexref.t50')]: [
      ['(abc)', t('regexref.t51'), t('regexref.t52')],
      ['(?:abc)', t('regexref.t53'), t('regexref.t54')],
      ['(?<name>abc)', t('regexref.t55'), t('regexref.t56')],
      ['a|b', t('regexref.t57'), t('regexref.t58')],
      [String.raw`\1`, t('regexref.t59'), String.raw`(\w)\1 은 같은 글자가 겹친 곳`],
      ['$1', t('regexref.t60'), t('regexref.t61')]
    ],
    플래그: [
      ['g', t('regexref.t62'), t('regexref.t63')],
      ['i', t('regexref.t64'), ''],
      ['m', t('regexref.t65'), t('regexref.t66')],
      ['s', t('regexref.t67'), ''],
      ['u', t('regexref.t68'), t('regexref.t69')]
    ],
    [t('regexref.t70')]: [
      [String.raw`^[\w.+-]+@[\w-]+\.[\w.-]+$`, t('regexref.t71'), t('regexref.t72')],
      [String.raw`^01[016-9]-?\d{3,4}-?\d{4}$`, t('regexref.t73'), t('regexref.t74')],
      [String.raw`^\d{5}$`, t('regexref.t75'), t('regexref.t76')],
      [String.raw`^\d{4}-\d{2}-\d{2}$`, t('regexref.t77'), ''],
      [String.raw`^https?://[^\s]+$`, 'URL', ''],
      ['^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$', t('regexref.t78'), ''],
      [String.raw`\s{2,}`, t('regexref.t79'), t('regexref.t80')],
      [String.raw`^\s+|\s+$`, t('regexref.t81'), t('regexref.t82')],
      ['<[^>]+>', t('regexref.t83'), t('regexref.t84')],
      [String.raw`(\d)(?=(\d{3})+$)`, t('regexref.t85'), t('regexref.t86')]
    ],
    [t('regexref.t87')]: [
      [String.raw`\.`, t('regexref.t88'), t('regexref.t89')],
      [String.raw`\\`, t('regexref.t90'), ''],
      [String.raw`\[ \] \( \) \{ \}`, t('regexref.t91'), t('regexref.t92')],
      ['[.]', t('regexref.t93'), t('regexref.t94')],
      [t('regexref.t19'), t('regexref.t95'), t('regexref.t96')]
    ]
  });

  let defined = false;
  function defineTable(): void {
    if (defined) return;
    defined = true;
    const table = rx();
    const items = Object.keys(table).flatMap((group) =>
      table[group].map(([code, label, desc]) => ({
        copy: code,
        glyph: code,
        label,
        sub: desc,
        keywords: `${code} ${label} ${desc}`,
        group
      }))
    );

    window.RefTable?.define('regexref', {
      items,
      placeholder: t('regexref.t97'),
      copyNoun: t('regexref.t98'),
      layout: 'list',
      note: t('regexref.t99')
    });
  }

  Toolbox.register({
    id: 'regexref',
    title: t('widgets.regexref.title', undefined, "정규식 치트시트"),
    category: 'ref',
    desc: t('widgets-desc.regexref.desc', undefined, "정규식 기호와 자주 쓰는 패턴을 하려는 일로 찾아 복사합니다"),
    layout: 'wide',
    icon: '<path d="M12 4v16M6 8l12 8M18 8 6 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('regexref.t102', undefined, "치트시트"),
        build: function (container: HTMLElement): void {
          void loadNamespace('regexref').then(function () {

          Mdd.linePreset('tool_run', { msg: t('regexref.t103') });
          defineTable();
          window.RefTable?.build(container, window.RefTable.get('regexref')!);
                  });
        }
      }
    ]
  });
})();
