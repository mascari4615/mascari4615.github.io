/**
 * HTML 특수문자(엔티티) 표 (TASK-KL-088)
 * 복사되는 값은 문자 자체가 아니라 **엔티티 코드**다 — 이 표를 찾는 사람은 마크업에 붙여넣으려는 것이다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /* 표는 **쓸 때** 짓는다 — 실려 오는 순간 지으면 말 묶음이 아직 없어 열쇠가 그대로 박힌다. */
  const entities = (): Array<[string, string, string, string]> => [
    // [문자, 엔티티, 이름, 분류]
    [' ', '&nbsp;', t('htmlentity.t01'), t('htmlentity.t02')],
    ['&', '&amp;', t('htmlentity.t03'), t('htmlentity.t02')],
    ['<', '&lt;', t('htmlentity.t04'), t('htmlentity.t02')],
    ['>', '&gt;', t('htmlentity.t05'), t('htmlentity.t02')],
    ['"', '&quot;', t('htmlentity.t06'), t('htmlentity.t02')],
    ["'", '&apos;', t('htmlentity.t07'), t('htmlentity.t02')],
    [' ', '&ensp;', t('htmlentity.t08'), t('htmlentity.t02')],
    [' ', '&emsp;', t('htmlentity.t09'), t('htmlentity.t02')],
    [' ', '&thinsp;', t('htmlentity.t10'), t('htmlentity.t02')],
    ['©', '&copy;', t('htmlentity.t11'), t('htmlentity.t12')],
    ['®', '&reg;', t('htmlentity.t13'), t('htmlentity.t12')],
    ['™', '&trade;', t('htmlentity.t14'), t('htmlentity.t12')],
    ['§', '&sect;', t('htmlentity.t15'), t('htmlentity.t12')],
    ['¶', '&para;', t('htmlentity.t16'), t('htmlentity.t12')],
    ['†', '&dagger;', t('htmlentity.t17'), t('htmlentity.t12')],
    ['‡', '&Dagger;', t('htmlentity.t18'), t('htmlentity.t12')],
    ['•', '&bull;', t('htmlentity.t19'), t('htmlentity.t12')],
    ['…', '&hellip;', t('htmlentity.t20'), t('htmlentity.t12')],
    ['‰', '&permil;', t('htmlentity.t21'), t('htmlentity.t12')],
    ['′', '&prime;', t('htmlentity.t22'), t('htmlentity.t12')],
    ['″', '&Prime;', t('htmlentity.t23'), t('htmlentity.t12')],
    ['–', '&ndash;', t('htmlentity.t24'), t('htmlentity.t12')],
    ['—', '&mdash;', t('htmlentity.t25'), t('htmlentity.t12')],
    ['‘', '&lsquo;', t('htmlentity.t26'), t('htmlentity.t27')],
    ['’', '&rsquo;', t('htmlentity.t28'), t('htmlentity.t27')],
    ['“', '&ldquo;', t('htmlentity.t29'), t('htmlentity.t27')],
    ['”', '&rdquo;', t('htmlentity.t30'), t('htmlentity.t27')],
    ['«', '&laquo;', t('htmlentity.t31'), t('htmlentity.t27')],
    ['»', '&raquo;', t('htmlentity.t32'), t('htmlentity.t27')],
    ['₩', '&#8361;', t('htmlentity.t33'), t('htmlentity.t34')],
    ['$', '&dollar;', t('htmlentity.t35'), t('htmlentity.t34')],
    ['¢', '&cent;', t('htmlentity.t36'), t('htmlentity.t34')],
    ['£', '&pound;', t('htmlentity.t37'), t('htmlentity.t34')],
    ['¥', '&yen;', t('htmlentity.t38'), t('htmlentity.t34')],
    ['€', '&euro;', t('htmlentity.t39'), t('htmlentity.t34')],
    ['¤', '&curren;', t('htmlentity.t40'), t('htmlentity.t34')],
    ['←', '&larr;', t('htmlentity.t41'), t('htmlentity.t42')],
    ['↑', '&uarr;', t('htmlentity.t43'), t('htmlentity.t42')],
    ['→', '&rarr;', t('htmlentity.t44'), t('htmlentity.t42')],
    ['↓', '&darr;', t('htmlentity.t45'), t('htmlentity.t42')],
    ['↔', '&harr;', t('htmlentity.t46'), t('htmlentity.t42')],
    ['⇐', '&lArr;', t('htmlentity.t47'), t('htmlentity.t42')],
    ['⇒', '&rArr;', t('htmlentity.t48'), t('htmlentity.t42')],
    ['⇔', '&hArr;', t('htmlentity.t49'), t('htmlentity.t42')],
    ['±', '&plusmn;', t('htmlentity.t50'), t('htmlentity.t51')],
    ['×', '&times;', t('htmlentity.t52'), t('htmlentity.t51')],
    ['÷', '&divide;', t('htmlentity.t53'), t('htmlentity.t51')],
    ['≠', '&ne;', t('htmlentity.t54'), t('htmlentity.t51')],
    ['≤', '&le;', t('htmlentity.t55'), t('htmlentity.t51')],
    ['≥', '&ge;', t('htmlentity.t56'), t('htmlentity.t51')],
    ['≈', '&asymp;', t('htmlentity.t57'), t('htmlentity.t51')],
    ['∞', '&infin;', t('htmlentity.t58'), t('htmlentity.t51')],
    ['√', '&radic;', t('htmlentity.t59'), t('htmlentity.t51')],
    ['∑', '&sum;', t('htmlentity.t60'), t('htmlentity.t51')],
    ['∏', '&prod;', t('htmlentity.t61'), t('htmlentity.t51')],
    ['∫', '&int;', t('htmlentity.t62'), t('htmlentity.t51')],
    ['∂', '&part;', t('htmlentity.t63'), t('htmlentity.t51')],
    ['∈', '&isin;', t('htmlentity.t64'), t('htmlentity.t51')],
    ['∉', '&notin;', t('htmlentity.t65'), t('htmlentity.t51')],
    ['∩', '&cap;', t('htmlentity.t66'), t('htmlentity.t51')],
    ['∪', '&cup;', t('htmlentity.t67'), t('htmlentity.t51')],
    ['°', '&deg;', t('htmlentity.t68'), t('htmlentity.t51')],
    ['¼', '&frac14;', t('htmlentity.t69'), t('htmlentity.t51')],
    ['½', '&frac12;', t('htmlentity.t70'), t('htmlentity.t51')],
    ['¾', '&frac34;', t('htmlentity.t71'), t('htmlentity.t51')],
    ['¹', '&sup1;', t('htmlentity.t72'), t('htmlentity.t51')],
    ['²', '&sup2;', t('htmlentity.t73'), t('htmlentity.t51')],
    ['³', '&sup3;', t('htmlentity.t74'), t('htmlentity.t51')],
    ['α', '&alpha;', t('htmlentity.t75'), t('htmlentity.t76')],
    ['β', '&beta;', t('htmlentity.t77'), t('htmlentity.t76')],
    ['γ', '&gamma;', t('htmlentity.t78'), t('htmlentity.t76')],
    ['δ', '&delta;', t('htmlentity.t79'), t('htmlentity.t76')],
    ['π', '&pi;', t('htmlentity.t80'), t('htmlentity.t76')],
    ['σ', '&sigma;', t('htmlentity.t60'), t('htmlentity.t76')],
    ['λ', '&lambda;', t('htmlentity.t81'), t('htmlentity.t76')],
    ['μ', '&micro;', t('htmlentity.t82'), t('htmlentity.t76')],
    ['Ω', '&Omega;', t('htmlentity.t83'), t('htmlentity.t76')],
    ['Δ', '&Delta;', t('htmlentity.t84'), t('htmlentity.t76')],
    ['★', '&#9733;', t('htmlentity.t85'), t('htmlentity.t86')],
    ['☆', '&#9734;', t('htmlentity.t87'), t('htmlentity.t86')],
    ['♥', '&hearts;', t('htmlentity.t88'), t('htmlentity.t86')],
    ['♠', '&spades;', t('htmlentity.t89'), t('htmlentity.t86')],
    ['♣', '&clubs;', t('htmlentity.t90'), t('htmlentity.t86')],
    ['♦', '&diams;', t('htmlentity.t91'), t('htmlentity.t86')],
    ['●', '&#9679;', t('htmlentity.t92'), t('htmlentity.t86')],
    ['■', '&#9632;', t('htmlentity.t93'), t('htmlentity.t86')],
    ['✓', '&#10003;', t('htmlentity.t94'), t('htmlentity.t86')],
    ['✗', '&#10007;', t('htmlentity.t95'), t('htmlentity.t86')]
  ];

  let defined = false;
  function defineTable(): void {
    if (defined) return;
    defined = true;
    window.RefTable?.define('htmlentity', {
      items: entities().map(([ch, entity, name, group]) => ({
        copy: entity,
        glyph: ch,
        label: entity,
        sub: name,
        keywords: `${entity} ${name} ${ch}`,
        group
      })),
      placeholder: t('htmlentity.t96'),
      copyNoun: t('htmlentity.t97'),
      layout: 'grid',
      note: t('htmlentity.t98')
    });
  }

  Toolbox.register({
    id: 'htmlentity',
    title: t('widgets.htmlentity.title', undefined, "HTML 특수문자"),
    category: 'ref',
    desc: t('widgets-desc.htmlentity.desc', undefined, "&amp;nbsp; &amp;lt; &amp;copy; 같은 HTML 엔티티 코드를 문자와 함께 찾아 복사합니다"),
    layout: 'wide',
    icon: '<path d="M9 7 4 12l5 5M15 7l5 5-5 5M13 4l-2 16" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('htmlentity.t97', undefined, "엔티티"),
        build: function (container: HTMLElement): void {
          void loadNamespace('htmlentity').then(function () {

          Mdd.linePreset('tool_run', { msg: t('htmlentity.t101') });
          defineTable();
          window.RefTable?.build(container, window.RefTable.get('htmlentity')!);
                  });
        }
      }
    ]
  });
})();
