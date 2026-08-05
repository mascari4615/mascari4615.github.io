/**
 * CSS 색상 이름표 (TASK-KL-088) — 148개 표준 색상 이름 ↔ HEX.
 * 이름 목록만 두고 HEX 는 브라우저에게 물어본다 (캔버스가 CSS 색을 파싱하므로 표를 손으로 안 적어도 된다).
 */
(function (): void {
  const NAMES: Array<[string, string]> = [
    ['red', '빨강'], ['crimson', '진홍'], ['darkred', '어두운 빨강'], ['firebrick', '벽돌'], ['indianred', '연한 벽돌'],
    ['lightcoral', '연산호'], ['salmon', '연어'], ['darksalmon', '진연어'], ['lightsalmon', '밝은 연어'], ['tomato', '토마토'],
    ['orangered', '주홍'], ['orange', '주황'], ['darkorange', '진주황'], ['coral', '산호'], ['gold', '금'],
    ['yellow', '노랑'], ['lightyellow', '연노랑'], ['lemonchiffon', '레몬'], ['khaki', '카키'], ['darkkhaki', '진카키'],
    ['moccasin', '모카신'], ['peachpuff', '복숭아'], ['papayawhip', '파파야'], ['cornsilk', '옥수수'], ['ivory', '아이보리'],
    ['beige', '베이지'], ['wheat', '밀'], ['tan', '황갈'], ['burlywood', '나무'], ['sandybrown', '모래'],
    ['peru', '페루'], ['chocolate', '초콜릿'], ['sienna', '시에나'], ['saddlebrown', '안장 갈색'], ['brown', '갈색'],
    ['maroon', '적갈'], ['rosybrown', '장미갈색'],
    ['green', '초록'], ['darkgreen', '진초록'], ['forestgreen', '숲'], ['seagreen', '바다초록'], ['mediumseagreen', '중간 바다초록'],
    ['limegreen', '라임초록'], ['lime', '라임'], ['lawngreen', '잔디'], ['chartreuse', '샤르트뢰즈'], ['greenyellow', '연두'],
    ['springgreen', '봄초록'], ['mediumspringgreen', '중간 봄초록'], ['lightgreen', '연초록'], ['palegreen', '창백한 초록'],
    ['darkseagreen', '진바다초록'], ['olive', '올리브'], ['olivedrab', '올리브 드랩'], ['darkolivegreen', '진올리브'],
    ['yellowgreen', '황록'], ['teal', '청록'], ['darkcyan', '진청록'], ['lightseagreen', '밝은 바다초록'],
    ['cyan', '시안'], ['aqua', '아쿠아'], ['aquamarine', '아쿠아마린'], ['turquoise', '터콰이즈'], ['mediumturquoise', '중간 터콰이즈'],
    ['darkturquoise', '진터콰이즈'], ['paleturquoise', '연터콰이즈'], ['lightcyan', '연시안'], ['cadetblue', '사관 파랑'],
    ['powderblue', '파우더블루'], ['lightblue', '연파랑'], ['skyblue', '하늘'], ['lightskyblue', '연하늘'],
    ['deepskyblue', '진하늘'], ['dodgerblue', '다저블루'], ['cornflowerblue', '수레국화'], ['steelblue', '강철파랑'],
    ['royalblue', '로열블루'], ['blue', '파랑'], ['mediumblue', '중간 파랑'], ['darkblue', '진파랑'], ['navy', '남색'],
    ['midnightblue', '자정 파랑'], ['slateblue', '슬레이트 파랑'], ['darkslateblue', '진슬레이트 파랑'],
    ['mediumslateblue', '중간 슬레이트 파랑'], ['blueviolet', '청보라'], ['indigo', '인디고'], ['darkviolet', '진보라'],
    ['darkorchid', '진난초'], ['darkmagenta', '진자홍'], ['purple', '보라'], ['rebeccapurple', '레베카 퍼플'],
    ['magenta', '자홍'], ['fuchsia', '푸크시아'], ['orchid', '난초'], ['mediumorchid', '중간 난초'], ['mediumpurple', '중간 보라'],
    ['violet', '바이올렛'], ['plum', '자두'], ['thistle', '엉겅퀴'], ['lavender', '라벤더'], ['pink', '분홍'],
    ['lightpink', '연분홍'], ['hotpink', '핫핑크'], ['deeppink', '진분홍'], ['palevioletred', '창백한 보라빨강'],
    ['mediumvioletred', '중간 보라빨강'],
    ['white', '흰색'], ['snow', '눈'], ['honeydew', '허니듀'], ['mintcream', '민트크림'], ['azure', '하늘빛'],
    ['aliceblue', '앨리스블루'], ['ghostwhite', '고스트화이트'], ['whitesmoke', '연기 흰색'], ['seashell', '조개'],
    ['oldlace', '올드레이스'], ['floralwhite', '꽃 흰색'], ['linen', '리넨'], ['antiquewhite', '앤티크화이트'],
    ['blanchedalmond', '아몬드'], ['bisque', '비스크'], ['navajowhite', '나바호'], ['mistyrose', '미스티로즈'],
    ['lavenderblush', '라벤더블러시'], ['gainsboro', '게인즈버러'], ['lightgray', '연회색'], ['silver', '은색'],
    ['darkgray', '진회색'], ['gray', '회색'], ['dimgray', '어두운 회색'], ['lightslategray', '연슬레이트 회색'],
    ['slategray', '슬레이트 회색'], ['darkslategray', '진슬레이트 회색'], ['black', '검정']
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
    if (/red|crimson|firebrick|tomato|salmon|coral|maroon/.test(name)) return '빨강 계열';
    if (/orange|gold|peru|chocolate|sienna|brown|tan|wheat|sandy|burly/.test(name)) return '주황·갈색';
    if (/yellow|khaki|lemon|corn|ivory|beige|moccasin|papaya|peach/.test(name)) return '노랑 계열';
    if (/green|lime|olive|chartreuse|spring/.test(name)) return '초록 계열';
    if (/cyan|aqua|turquoise|teal|cadet/.test(name)) return '청록 계열';
    if (/blue|navy|azure|sky|steel|slate(?!gray)|indigo|cornflower|dodger|royal|midnight/.test(name)) return '파랑 계열';
    if (/purple|violet|orchid|magenta|fuchsia|plum|thistle|lavender(?!blush)/.test(name)) return '보라 계열';
    if (/pink|rose/.test(name)) return '분홍 계열';
    return '무채색';
  }

  Toolbox.register({
    id: 'colorname',
    title: 'CSS 색상 이름표',
    category: 'ref',
    desc: 'CSS 표준 색상 이름 148개와 HEX 값을 눈으로 비교하고 눌러서 복사합니다',
    layout: 'full',
    icon: '<path d="M12 3a9 9 0 1 0 0 18h2a3 3 0 0 0 0-6h-1a2 2 0 0 1 0-4h2a5 5 0 0 0-3-8z" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="8" cy="10" r="1.2" fill="currentColor"/><circle cx="12" cy="7" r="1.2" fill="currentColor"/>',
    tabs: [
      {
        id: 'app',
        label: '색상 이름',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '이름만 적어도 되는 색들이에요.' });
          window.RefTable?.build(container, {
            items: NAMES.map(([name, ko]) => {
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
            placeholder: '영문 이름·한글·HEX 로 찾기 (예: sky, 하늘, #87CEEB)',
            copyNoun: '색상 이름',
            layout: 'grid',
            note: '누르면 CSS 색상 이름이 복사됩니다.'
          });
        }
      }
    ]
  });
})();
