/**
 * 특수문자 모음 (TASK-KL-088) — 눌러서 복사.
 * 한글 자판으로 못 치는 기호를 분류별로 늘어놓는다. 데이터가 곧 이 위젯의 전부라 표만 채운다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /* 표는 **쓸 때** 짓는다 — 실려 오는 순간 지으면 말 묶음이 아직 없어 열쇠가 그대로 박힌다. */
  const raw = (): Array<[string, string, string]> => [
    // [문자, 이름, 분류]
    ['←', t('specialchar.t01'), t('specialchar.t02')], ['→', t('specialchar.t03'), t('specialchar.t02')], ['↑', t('specialchar.t04'), t('specialchar.t02')], ['↓', t('specialchar.t05'), t('specialchar.t02')],
    ['↔', t('specialchar.t06'), t('specialchar.t02')], ['↕', t('specialchar.t07'), t('specialchar.t02')], ['↖', t('specialchar.t08'), t('specialchar.t02')], ['↗', t('specialchar.t09'), t('specialchar.t02')],
    ['↘', t('specialchar.t10'), t('specialchar.t02')], ['↙', t('specialchar.t11'), t('specialchar.t02')], ['⇒', t('specialchar.t12'), t('specialchar.t02')], ['⇔', t('specialchar.t13'), t('specialchar.t02')],
    ['⇐', t('specialchar.t14'), t('specialchar.t02')], ['⇑', t('specialchar.t15'), t('specialchar.t02')], ['⇓', t('specialchar.t16'), t('specialchar.t02')], ['➜', t('specialchar.t17'), t('specialchar.t02')],
    ['▶', t('specialchar.t18'), t('specialchar.t02')], ['◀', t('specialchar.t19'), t('specialchar.t02')], ['▲', t('specialchar.t20'), t('specialchar.t02')], ['▼', t('specialchar.t21'), t('specialchar.t02')],

    ['★', t('specialchar.t22'), t('specialchar.t23')], ['☆', t('specialchar.t24'), t('specialchar.t23')], ['✦', t('specialchar.t25'), t('specialchar.t23')], ['✧', t('specialchar.t26'), t('specialchar.t23')],
    ['❤', t('specialchar.t27'), t('specialchar.t23')], ['♥', t('specialchar.t28'), t('specialchar.t23')], ['♡', t('specialchar.t29'), t('specialchar.t23')], ['✿', t('specialchar.t30'), t('specialchar.t23')],
    ['❀', t('specialchar.t31'), t('specialchar.t23')], ['✽', t('specialchar.t32'), t('specialchar.t23')], ['✼', t('specialchar.t33'), t('specialchar.t23')], ['❁', t('specialchar.t34'), t('specialchar.t23')],

    ['●', t('specialchar.t35'), t('specialchar.t36')], ['○', t('specialchar.t37'), t('specialchar.t36')], ['◎', t('specialchar.t38'), t('specialchar.t36')], ['◉', t('specialchar.t39'), t('specialchar.t36')],
    ['■', t('specialchar.t40'), t('specialchar.t36')], ['□', t('specialchar.t41'), t('specialchar.t36')], ['▣', t('specialchar.t42'), t('specialchar.t36')], ['▦', t('specialchar.t43'), t('specialchar.t36')],
    ['◆', t('specialchar.t44'), t('specialchar.t36')], ['◇', t('specialchar.t45'), t('specialchar.t36')], ['▩', t('specialchar.t46'), t('specialchar.t36')], ['▧', t('specialchar.t47'), t('specialchar.t36')],
    ['◐', t('specialchar.t48'), t('specialchar.t36')], ['◑', t('specialchar.t49'), t('specialchar.t36')], ['▪', t('specialchar.t50'), t('specialchar.t36')], ['▫', t('specialchar.t51'), t('specialchar.t36')],

    ['※', t('specialchar.t52'), t('specialchar.t53')], ['·', t('specialchar.t54'), t('specialchar.t53')], ['…', t('specialchar.t55'), t('specialchar.t53')], ['—', t('specialchar.t56'), t('specialchar.t53')],
    ['–', t('specialchar.t57'), t('specialchar.t53')], ['~', t('specialchar.t58'), t('specialchar.t53')], ['∼', t('specialchar.t59'), t('specialchar.t53')], ['‥', t('specialchar.t60'), t('specialchar.t53')],
    ['「', t('specialchar.t61'), t('specialchar.t62')], ['」', t('specialchar.t63'), t('specialchar.t62')], ['『', t('specialchar.t64'), t('specialchar.t62')], ['』', t('specialchar.t65'), t('specialchar.t62')],
    ['〈', t('specialchar.t66'), t('specialchar.t62')], ['〉', t('specialchar.t67'), t('specialchar.t62')], ['《', t('specialchar.t68'), t('specialchar.t62')], ['》', t('specialchar.t69'), t('specialchar.t62')],
    ['【', t('specialchar.t70'), t('specialchar.t62')], ['】', t('specialchar.t71'), t('specialchar.t62')], ['〔', t('specialchar.t72'), t('specialchar.t62')], ['〕', t('specialchar.t73'), t('specialchar.t62')],
    ['‘', t('specialchar.t74'), t('specialchar.t62')], ['’', t('specialchar.t75'), t('specialchar.t62')], ['“', t('specialchar.t76'), t('specialchar.t62')], ['”', t('specialchar.t77'), t('specialchar.t62')],

    ['✓', t('specialchar.t78'), t('specialchar.t79')], ['✔', t('specialchar.t80'), t('specialchar.t79')], ['✗', t('specialchar.t81'), t('specialchar.t79')], ['✘', t('specialchar.t82'), t('specialchar.t79')],
    ['☑', t('specialchar.t83'), t('specialchar.t79')], ['☐', t('specialchar.t84'), t('specialchar.t79')], ['☒', t('specialchar.t85'), t('specialchar.t79')], ['√', t('specialchar.t86'), t('specialchar.t79')],
    ['♠', t('specialchar.t87'), t('specialchar.t88')], ['♣', t('specialchar.t89'), t('specialchar.t88')], ['♦', t('specialchar.t90'), t('specialchar.t88')], ['♧', t('specialchar.t91'), t('specialchar.t88')],
    ['♤', t('specialchar.t92'), t('specialchar.t88')], ['♢', t('specialchar.t93'), t('specialchar.t88')],

    ['±', t('specialchar.t94'), t('specialchar.t95')], ['×', t('specialchar.t96'), t('specialchar.t95')], ['÷', t('specialchar.t97'), t('specialchar.t95')], ['≠', t('specialchar.t98'), t('specialchar.t95')],
    ['≤', t('specialchar.t99'), t('specialchar.t95')], ['≥', t('specialchar.t100'), t('specialchar.t95')], ['≒', t('specialchar.t101'), t('specialchar.t95')], ['∞', t('specialchar.t102'), t('specialchar.t95')],
    ['√', t('specialchar.t103'), t('specialchar.t95')], ['∑', t('specialchar.t104'), t('specialchar.t95')], ['∏', t('specialchar.t105'), t('specialchar.t95')], ['∫', t('specialchar.t106'), t('specialchar.t95')],
    ['∂', t('specialchar.t107'), t('specialchar.t95')], ['∇', t('specialchar.t108'), t('specialchar.t95')], ['∈', t('specialchar.t109'), t('specialchar.t95')], ['∉', t('specialchar.t110'), t('specialchar.t95')],
    ['⊂', t('specialchar.t111'), t('specialchar.t95')], ['∪', t('specialchar.t112'), t('specialchar.t95')], ['∩', t('specialchar.t113'), t('specialchar.t95')], ['∴', t('specialchar.t114'), t('specialchar.t95')],
    ['∵', t('specialchar.t115'), t('specialchar.t95')], ['∝', t('specialchar.t116'), t('specialchar.t95')], ['⊥', t('specialchar.t117'), t('specialchar.t95')], ['∠', t('specialchar.t118'), t('specialchar.t95')],
    ['°', t('specialchar.t119'), t('specialchar.t95')], ['′', t('specialchar.t120'), t('specialchar.t95')], ['″', t('specialchar.t121'), t('specialchar.t95')], ['㎜', t('specialchar.t122'), t('specialchar.t123')],
    ['㎝', t('specialchar.t124'), t('specialchar.t123')], ['㎞', t('specialchar.t125'), t('specialchar.t123')], ['㎡', t('specialchar.t126'), t('specialchar.t123')], ['㎥', t('specialchar.t127'), t('specialchar.t123')],
    ['㎏', t('specialchar.t128'), t('specialchar.t123')], ['㎖', t('specialchar.t129'), t('specialchar.t123')], ['ℓ', t('specialchar.t130'), t('specialchar.t123')], ['℃', t('specialchar.t131'), t('specialchar.t123')],
    ['℉', t('specialchar.t132'), t('specialchar.t123')], ['㎧', t('specialchar.t133'), t('specialchar.t123')], ['㏈', t('specialchar.t134'), t('specialchar.t123')], ['㎃', t('specialchar.t135'), t('specialchar.t123')],

    ['₩', t('specialchar.t136'), t('specialchar.t137')], ['$', t('specialchar.t138'), t('specialchar.t137')], ['€', t('specialchar.t139'), t('specialchar.t137')], ['¥', t('specialchar.t140'), t('specialchar.t137')],
    ['£', t('specialchar.t141'), t('specialchar.t137')], ['¢', t('specialchar.t142'), t('specialchar.t137')], ['₿', t('specialchar.t143'), t('specialchar.t137')], ['₽', t('specialchar.t144'), t('specialchar.t137')],

    ['①', t('specialchar.t145'), t('specialchar.t146')], ['②', t('specialchar.t147'), t('specialchar.t146')], ['③', t('specialchar.t148'), t('specialchar.t146')], ['④', t('specialchar.t149'), t('specialchar.t146')],
    ['⑤', t('specialchar.t150'), t('specialchar.t146')], ['⑥', t('specialchar.t151'), t('specialchar.t146')], ['⑦', t('specialchar.t152'), t('specialchar.t146')], ['⑧', t('specialchar.t153'), t('specialchar.t146')],
    ['⑨', t('specialchar.t154'), t('specialchar.t146')], ['⑩', t('specialchar.t155'), t('specialchar.t146')], ['㉠', t('specialchar.t156'), t('specialchar.t146')], ['㉡', t('specialchar.t157'), t('specialchar.t146')],
    ['㉢', t('specialchar.t158'), t('specialchar.t146')], ['㉣', t('specialchar.t159'), t('specialchar.t146')], ['⑴', t('specialchar.t160'), t('specialchar.t146')], ['⑵', t('specialchar.t161'), t('specialchar.t146')],
    ['⑶', t('specialchar.t162'), t('specialchar.t146')], ['Ⅰ', t('specialchar.t163'), t('specialchar.t146')], ['Ⅱ', t('specialchar.t164'), t('specialchar.t146')], ['Ⅲ', t('specialchar.t165'), t('specialchar.t146')],
    ['Ⅳ', t('specialchar.t166'), t('specialchar.t146')], ['Ⅴ', t('specialchar.t167'), t('specialchar.t146')], ['Ⅵ', t('specialchar.t168'), t('specialchar.t146')], ['Ⅹ', t('specialchar.t169'), t('specialchar.t146')],

    ['α', t('specialchar.t170'), t('specialchar.t171')], ['β', t('specialchar.t172'), t('specialchar.t171')], ['γ', t('specialchar.t173'), t('specialchar.t171')], ['δ', t('specialchar.t174'), t('specialchar.t171')],
    ['ε', t('specialchar.t175'), t('specialchar.t171')], ['θ', t('specialchar.t176'), t('specialchar.t171')], ['λ', t('specialchar.t177'), t('specialchar.t171')], ['μ', t('specialchar.t178'), t('specialchar.t171')],
    ['π', t('specialchar.t179'), t('specialchar.t171')], ['σ', t('specialchar.t104'), t('specialchar.t171')], ['τ', t('specialchar.t180'), t('specialchar.t171')], ['φ', t('specialchar.t181'), t('specialchar.t171')],
    ['ω', t('specialchar.t182'), t('specialchar.t171')], ['Δ', t('specialchar.t183'), t('specialchar.t171')], ['Ω', t('specialchar.t184'), t('specialchar.t171')], ['Σ', t('specialchar.t185'), t('specialchar.t171')],

    ['♨', t('specialchar.t186'), t('specialchar.t187')], ['☎', t('specialchar.t188'), t('specialchar.t187')], ['✉', t('specialchar.t189'), t('specialchar.t187')], ['✂', t('specialchar.t190'), t('specialchar.t187')],
    ['✈', t('specialchar.t191'), t('specialchar.t187')], ['☂', t('specialchar.t192'), t('specialchar.t187')], ['☀', t('specialchar.t193'), t('specialchar.t187')], ['☁', t('specialchar.t194'), t('specialchar.t187')],
    ['☃', t('specialchar.t195'), t('specialchar.t187')], ['♪', t('specialchar.t196'), t('specialchar.t187')], ['♬', t('specialchar.t197'), t('specialchar.t187')], ['♩', t('specialchar.t198'), t('specialchar.t187')],
    ['☞', t('specialchar.t199'), t('specialchar.t187')], ['☜', t('specialchar.t200'), t('specialchar.t187')], ['♂', t('specialchar.t201'), t('specialchar.t187')], ['♀', t('specialchar.t202'), t('specialchar.t187')],
    ['©', t('specialchar.t203'), t('specialchar.t187')], ['®', t('specialchar.t204'), t('specialchar.t187')], ['™', t('specialchar.t205'), t('specialchar.t187')], ['§', t('specialchar.t206'), t('specialchar.t187')],
    ['¶', t('specialchar.t207'), t('specialchar.t187')], ['†', t('specialchar.t208'), t('specialchar.t187')], ['‡', t('specialchar.t209'), t('specialchar.t187')], ['№', t('specialchar.t210'), t('specialchar.t187')]
  ];

  let defined = false;
  function defineTable(): void {
    if (defined) return;
    defined = true;
    window.RefTable?.define('specialchar', {
      items: raw().map(([glyph, label, group]) => ({
        copy: glyph,
        glyph,
        label,
        sub: 'U+' + glyph.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0'),
        group
      })),
      placeholder: t('specialchar.t211'),
      copyNoun: t('specialchar.t212'),
      layout: 'grid',
      note: t('specialchar.t213')
    });
  }

  Toolbox.register({
    id: 'specialchar',
    title: t('widgets.specialchar.title', undefined, "특수문자 모음"),
    category: 'ref',
    desc: t('widgets-desc.specialchar.desc', undefined, "화살표·별·도형·수학기호 등 자판에 없는 특수문자를 눌러서 복사합니다"),
    layout: 'wide',
    icon: '<path d="M5 7h6M8 4v6M15 5l4 4M19 5l-4 4M7 15h4M9 13v4M15 15h4M15 18h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('specialchar.t212', undefined, "특수문자"),
        build: function (container: HTMLElement): void {
          void loadNamespace('specialchar').then(function () {

          Mdd.linePreset('tool_run', { msg: t('specialchar.t216') });
          defineTable();
          window.RefTable?.build(container, window.RefTable.get('specialchar')!);
                  });
        }
      }
    ]
  });

  /* ★ 표를 **묶음이 실릴 때 미리** 등록해 둔다 (2026-08-12).
   *   여태는 이 도구의 탭이 열릴 때만 등록했다. 그런데 문자표(charmap)는 네 표를 한자리에
   *   모아 보여 주는 도구라, 자기 탭을 열자마자 `RefTable.get(...)` 을 묻는다 — 아무도
   *   안 열어 본 표는 그때 없다. 그래서 실주소 문자표가 통째로 「표를 불러오지 못했어요」였다
   *   (컴파일도 통과하고 이 도구 단독 화면은 멀쩡했다). 등록은 덮어쓰기라 두 번 해도 안전하다. */
  void loadNamespace('specialchar').then(defineTable);
})();
