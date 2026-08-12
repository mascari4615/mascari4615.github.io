/**
 * 이모지 찾기 (TASK-KL-088)
 *
 * 이모지는 이름이 영어라 「웃는 얼굴」 로는 안 잡힌다. 그래서 항목마다 **한국어 검색어**를 붙인다 —
 * 표의 값이 목록 길이가 아니라 「찾아지느냐」 에 있기 때문이다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /** [문자, 이름, 검색 키워드] */
  /* 표는 **쓸 때** 짓는다 — 실려 오는 순간 지으면 말 묶음이 아직 없어 열쇠가 그대로 박힌다. */
  const emojis = (): Record<string, Array<[string, string, string]>> => ({
    [t('emoji.g1')]: [
      ['😀', t('emoji.t01'), t('emoji.t02')],
      ['😃', t('emoji.t03'), t('emoji.t04')],
      ['😄', t('emoji.t05'), t('emoji.t06')],
      ['😁', t('emoji.t07'), t('emoji.t08')],
      ['😆', t('emoji.t09'), t('emoji.t10')],
      ['😅', t('emoji.t11'), t('emoji.t12')],
      ['🤣', t('emoji.t13'), t('emoji.t14')],
      ['😂', t('emoji.t15'), t('emoji.t16')],
      ['🙂', t('emoji.t17'), t('emoji.t18')],
      ['🙃', t('emoji.t19'), t('emoji.t20')],
      ['😉', t('emoji.t21'), t('emoji.t22')],
      ['😊', t('emoji.t23'), t('emoji.t24')],
      ['😇', t('emoji.t25'), t('emoji.t26')],
      ['🥰', t('emoji.t27'), t('emoji.t28')],
      ['😍', t('emoji.t29'), t('emoji.t30')],
      ['😘', t('emoji.t31'), t('emoji.t32')],
      ['😋', t('emoji.t33'), t('emoji.t34')],
      ['😜', t('emoji.t35'), t('emoji.t36')],
      ['🤪', t('emoji.t37'), t('emoji.t38')],
      ['🤨', t('emoji.t39'), t('emoji.t40')],
      ['🧐', t('emoji.t41'), t('emoji.t42')],
      ['🤓', t('emoji.t43'), t('emoji.t44')],
      ['😎', t('emoji.t45'), t('emoji.t46')],
      ['🥳', t('emoji.t47'), t('emoji.t48')],
      ['😏', t('emoji.t49'), t('emoji.t50')],
      ['😒', t('emoji.t51'), t('emoji.t52')],
      ['😞', t('emoji.t53'), t('emoji.t54')],
      ['😔', t('emoji.t55'), t('emoji.t56')],
      ['😟', t('emoji.t57'), t('emoji.t58')],
      ['😕', t('emoji.t59'), t('emoji.t60')],
      ['🙁', t('emoji.t61'), t('emoji.t62')],
      ['😣', t('emoji.t63'), t('emoji.t64')],
      ['😖', t('emoji.t65'), t('emoji.t66')],
      ['😫', t('emoji.t67'), t('emoji.t68')],
      ['😩', t('emoji.t69'), t('emoji.t70')],
      ['🥺', t('emoji.t71'), t('emoji.t72')],
      ['😢', t('emoji.t73'), t('emoji.t74')],
      ['😭', t('emoji.t75'), t('emoji.t76')],
      ['😤', t('emoji.t77'), t('emoji.t78')],
      ['😠', t('emoji.t79'), t('emoji.t80')],
      ['😡', t('emoji.t81'), t('emoji.t82')],
      ['🤬', t('emoji.t83'), t('emoji.t84')],
      ['🤯', t('emoji.t85'), t('emoji.t86')],
      ['😳', t('emoji.t87'), t('emoji.t88')],
      ['🥵', t('emoji.t89'), t('emoji.t90')],
      ['🥶', t('emoji.t91'), t('emoji.t92')],
      ['😱', t('emoji.t93'), t('emoji.t94')],
      ['😨', t('emoji.t95'), t('emoji.t96')],
      ['😰', t('emoji.t97'), t('emoji.t98')],
      ['😥', t('emoji.t99'), t('emoji.t100')],
      ['😓', t('emoji.t101'), t('emoji.t102')],
      ['🤗', t('emoji.t103'), t('emoji.t104')],
      ['🤔', t('emoji.t105'), t('emoji.t106')],
      ['🤭', t('emoji.t107'), t('emoji.t108')],
      ['🤫', t('emoji.t109'), t('emoji.t110')],
      ['🤥', t('emoji.t111'), t('emoji.t112')],
      ['😐', t('emoji.t113'), t('emoji.t114')],
      ['😑', t('emoji.t115'), t('emoji.t116')],
      ['😶', t('emoji.t117'), t('emoji.t118')],
      ['😴', t('emoji.t119'), t('emoji.t120')],
      ['🤤', t('emoji.t121'), t('emoji.t122')],
      ['😪', t('emoji.t123'), t('emoji.t124')],
      ['🤒', t('emoji.t125'), t('emoji.t126')],
      ['🤢', t('emoji.t127'), t('emoji.t128')],
      ['🤮', t('emoji.t129'), t('emoji.t130')],
      ['🥴', t('emoji.t131'), t('emoji.t132')],
      ['😵', t('emoji.t133'), t('emoji.t134')],
      ['🤠', t('emoji.t135'), t('emoji.t136')],
      ['🫠', t('emoji.t137'), t('emoji.t138')],
      ['🫡', t('emoji.t139'), t('emoji.t140')],
      ['🫥', t('emoji.t141'), t('emoji.t142')],
      ['💀', t('emoji.t143'), t('emoji.t144')],
      ['👻', t('emoji.t145'), t('emoji.t146')],
      ['👽', t('emoji.t147'), t('emoji.t148')],
      ['🤖', t('emoji.t149'), t('emoji.t150')],
      ['💩', t('emoji.t151'), t('emoji.t152')]
    ],
    [t('emoji.g2')]: [
      ['👍', t('emoji.t153'), t('emoji.t154')],
      ['👎', t('emoji.t155'), t('emoji.t156')],
      ['👌', t('emoji.t157'), t('emoji.t158')],
      ['🤌', t('emoji.t159'), t('emoji.t160')],
      ['✌️', t('emoji.t161'), t('emoji.t162')],
      ['🤞', t('emoji.t163'), t('emoji.t164')],
      ['🤟', t('emoji.t165'), t('emoji.t166')],
      ['🤘', t('emoji.t167'), t('emoji.t168')],
      ['🤙', t('emoji.t169'), t('emoji.t170')],
      ['👋', t('emoji.t171'), t('emoji.t172')],
      ['🙌', t('emoji.t173'), t('emoji.t174')],
      ['👏', t('emoji.t175'), t('emoji.t176')],
      ['🙏', t('emoji.t177'), t('emoji.t178')],
      ['💪', t('emoji.t179'), t('emoji.t180')],
      ['🫰', t('emoji.t181'), t('emoji.t182')],
      ['🤝', t('emoji.t183'), t('emoji.t184')],
      ['✍️', t('emoji.t185'), t('emoji.t186')],
      ['👀', t('emoji.t187'), t('emoji.t188')]
    ],
    [t('emoji.g3')]: [
      ['❤️', t('emoji.t189'), t('emoji.t190')],
      ['🧡', t('emoji.t191'), 'orange heart'],
      ['💛', t('emoji.t192'), 'yellow heart'],
      ['💚', t('emoji.t193'), 'green heart'],
      ['💙', t('emoji.t194'), 'blue heart'],
      ['💜', t('emoji.t195'), 'purple heart'],
      ['🖤', t('emoji.t196'), 'black heart'],
      ['🤍', t('emoji.t197'), 'white heart'],
      ['💔', t('emoji.t198'), t('emoji.t199')],
      ['💕', t('emoji.t200'), t('emoji.t201')],
      ['💖', t('emoji.t202'), 'sparkling heart'],
      ['💯', t('emoji.t203'), t('emoji.t204')],
      ['✨', t('emoji.t205'), t('emoji.t206')],
      ['🔥', t('emoji.t207'), t('emoji.t208')],
      ['⭐', t('emoji.t209'), t('emoji.t210')],
      ['🌟', t('emoji.t211'), 'glowing star'],
      ['💥', t('emoji.t212'), t('emoji.t213')],
      ['💫', t('emoji.t214'), t('emoji.t215')],
      ['🎉', t('emoji.t216'), t('emoji.t217')],
      ['🎊', t('emoji.t218'), t('emoji.t219')]
    ],
    [t('emoji.g4')]: [
      ['💻', t('emoji.t220'), t('emoji.t221')],
      ['🖥️', t('emoji.t222'), t('emoji.t223')],
      ['📱', t('emoji.t224'), t('emoji.t225')],
      ['⌨️', t('emoji.t226'), t('emoji.t227')],
      ['🖱️', t('emoji.t228'), 'mouse'],
      ['💾', t('emoji.t229'), t('emoji.t230')],
      ['📀', t('emoji.t231'), 'disc CD DVD'],
      ['🔋', t('emoji.t232'), t('emoji.t233')],
      ['🔌', t('emoji.t234'), t('emoji.t235')],
      ['📷', t('emoji.t236'), t('emoji.t237')],
      ['🎧', t('emoji.t238'), t('emoji.t239')],
      ['🎮', t('emoji.t240'), t('emoji.t241')],
      ['📚', t('emoji.t242'), t('emoji.t243')],
      ['📝', t('emoji.t244'), t('emoji.t245')],
      ['📌', t('emoji.t246'), t('emoji.t247')],
      ['📎', t('emoji.t248'), t('emoji.t249')],
      ['🔍', t('emoji.t250'), t('emoji.t251')],
      ['🔒', t('emoji.t252'), t('emoji.t253')],
      ['🔑', t('emoji.t254'), t('emoji.t255')],
      ['💡', t('emoji.t256'), t('emoji.t257')],
      ['🧭', t('emoji.t258'), t('emoji.t259')],
      ['⏰', t('emoji.t260'), t('emoji.t261')],
      ['⌛', t('emoji.t262'), t('emoji.t263')],
      ['💰', t('emoji.t264'), t('emoji.t265')],
      ['💸', t('emoji.t266'), t('emoji.t267')],
      ['🛒', t('emoji.t268'), t('emoji.t269')],
      ['🎁', t('emoji.t270'), t('emoji.t271')],
      ['🧪', t('emoji.t272'), t('emoji.t273')],
      ['⚙️', t('emoji.t274'), t('emoji.t275')],
      ['🔧', t('emoji.t276'), t('emoji.t277')],
      ['🔨', t('emoji.t278'), t('emoji.t279')],
      ['🧹', t('emoji.t280'), t('emoji.t281')],
      ['🗑️', t('emoji.t282'), t('emoji.t283')],
      ['📦', t('emoji.t284'), t('emoji.t285')]
    ],
    [t('emoji.g5')]: [
      ['🌞', t('emoji.t286'), t('emoji.t287')],
      ['🌙', t('emoji.t288'), t('emoji.t289')],
      ['☁️', t('emoji.t290'), t('emoji.t291')],
      ['🌧️', t('emoji.t292'), t('emoji.t293')],
      ['⛈️', t('emoji.t294'), t('emoji.t295')],
      ['❄️', t('emoji.t187'), t('emoji.t296')],
      ['🌈', t('emoji.t297'), 'rainbow'],
      ['🌊', t('emoji.t298'), t('emoji.t299')],
      ['🌸', t('emoji.t300'), t('emoji.t301')],
      ['🌻', t('emoji.t302'), t('emoji.t303')],
      ['🍁', t('emoji.t304'), t('emoji.t305')],
      ['🌱', t('emoji.t306'), t('emoji.t307')],
      ['🌵', t('emoji.t308'), 'cactus'],
      ['🐶', t('emoji.t309'), t('emoji.t310')],
      ['🐱', t('emoji.t311'), t('emoji.t312')],
      ['🐰', t('emoji.t313'), 'rabbit'],
      ['🦊', t('emoji.t314'), 'fox'],
      ['🐻', t('emoji.t315'), 'bear'],
      ['🐼', t('emoji.t316'), 'panda'],
      ['🐧', t('emoji.t317'), 'penguin'],
      ['🐢', t('emoji.t318'), t('emoji.t319')],
      ['🐍', t('emoji.t320'), t('emoji.t321')],
      ['🦄', t('emoji.t322'), t('emoji.t323')],
      ['🐝', t('emoji.t324'), 'bee'],
      ['🦋', t('emoji.t325'), 'butterfly']
    ],
    [t('emoji.g6')]: [
      ['🍚', t('emoji.t326'), t('emoji.t327')],
      ['🍜', t('emoji.t328'), t('emoji.t329')],
      ['🍕', t('emoji.t330'), 'pizza'],
      ['🍔', t('emoji.t331'), 'burger'],
      ['🍗', t('emoji.t332'), t('emoji.t333')],
      ['🍣', t('emoji.t334'), 'sushi'],
      ['🥟', t('emoji.t335'), 'dumpling'],
      ['🍺', t('emoji.t336'), t('emoji.t337')],
      ['🍻', t('emoji.t338'), t('emoji.t339')],
      ['🍷', t('emoji.t340'), t('emoji.t341')],
      ['🍶', t('emoji.t342'), t('emoji.t343')],
      ['☕', t('emoji.t344'), t('emoji.t345')],
      ['🍰', t('emoji.t346'), t('emoji.t347')],
      ['🍫', t('emoji.t348'), 'chocolate'],
      ['🍎', t('emoji.t349'), 'apple'],
      ['🍉', t('emoji.t350'), t('emoji.t351')],
      ['🍳', t('emoji.t352'), t('emoji.t353')]
    ],
    [t('emoji.g7')]: [
      ['✅', t('emoji.t354'), t('emoji.t355')],
      ['❌', t('emoji.t356'), t('emoji.t357')],
      ['⚠️', t('emoji.t358'), t('emoji.t359')],
      ['🚫', t('emoji.t360'), t('emoji.t361')],
      ['❗', t('emoji.t362'), t('emoji.t363')],
      ['❓', t('emoji.t364'), t('emoji.t365')],
      ['🔴', t('emoji.t366'), t('emoji.t367')],
      ['🟢', t('emoji.t368'), t('emoji.t369')],
      ['🟡', t('emoji.t370'), t('emoji.t371')],
      ['🔵', t('emoji.t372'), 'blue circle'],
      ['➡️', t('emoji.t373'), t('emoji.t374')],
      ['⬅️', t('emoji.t375'), t('emoji.t376')],
      ['⬆️', t('emoji.t377'), 'up arrow'],
      ['⬇️', t('emoji.t378'), 'down arrow'],
      ['🔄', t('emoji.t379'), t('emoji.t380')],
      ['♻️', t('emoji.t381'), t('emoji.t382')],
      ['🆕', 'NEW', t('emoji.t383')],
      ['🆗', 'OK', 'ok'],
      ['🔞', t('emoji.t384'), t('emoji.t385')],
      ['🚧', t('emoji.t386'), t('emoji.t387')],
      ['🐛', t('emoji.t388'), t('emoji.t389')],
      ['🚀', t('emoji.t390'), t('emoji.t391')],
      ['📈', t('emoji.t392'), t('emoji.t393')],
      ['📉', t('emoji.t394'), t('emoji.t395')],
      ['🏆', t('emoji.t396'), t('emoji.t397')],
      ['🎯', t('emoji.t398'), t('emoji.t399')]
    ]
  });

  let defined = false;
  function defineTable(): void {
    if (defined) return;
    defined = true;
    window.RefTable?.define('emoji', {
      items: Object.keys(emojis()).flatMap((group) =>
        emojis()[group].map(([glyph, label, keywords]) => ({
          copy: glyph,
          glyph,
          label,
          keywords: `${label} ${keywords}`,
          group
        }))
      ),
      placeholder: t('emoji.t400'),
      copyNoun: t('emoji.t401'),
      layout: 'grid',
      note: t('emoji.t402')
    });
  }

  Toolbox.register({
    id: 'emoji',
    title: t('widgets.emoji.title', undefined, "이모지 찾기"),
    category: 'ref',
    desc: t('widgets-desc.emoji.desc', undefined, "한국어로 검색해서 이모지를 찾고 눌러서 복사합니다. 표정·손짓·기호 등 분류별"),
    layout: 'wide',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="9" cy="10" r="1.2" fill="currentColor"/><circle cx="15" cy="10" r="1.2" fill="currentColor"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('emoji.t401', undefined, "이모지"),
        build: function (container: HTMLElement): void {
          void loadNamespace('emoji').then(function () {

          Mdd.linePreset('tool_run', { msg: t('emoji.t405') });
          defineTable();
          window.RefTable?.build(container, window.RefTable.get('emoji')!);
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
  void loadNamespace('emoji').then(defineTable);
})();
