/**
 * 방문·동작 계측 (TASK-KAR-202).
 *
 * 왜: 이 물건의 목적은 「사람이 오게 하는 것」인데, 정작 **얼마나 오는지 볼 수단이 없었다.**
 * 무엇을 고칠지가 전부 이 숫자에 달려 있으니 계기부터 단다.
 *
 * 원칙 (블로그·KarmoLab 이 쓰는 것과 같다):
 *  - GoatCounter — 쿠키도 개인 식별자도 없다. 사이트가 이미 쓰는 계정을 그대로 쓴다.
 *  - **보내는 것은 판 이름과 동작뿐.** 무엇을 추측했는지·정답이 무엇인지는 절대 안 보낸다
 *    (정답이 계측에 실리면 그걸 보고 그날 답을 알 수 있다).
 *  - 내 기계(localhost·파일 열기)에서는 아예 안 보낸다 — 내가 통계를 덮는다.
 */
const SITE = 'https://mascari4615.goatcounter.com/count';

const disabled =
  typeof window === 'undefined' ||
  location.protocol === 'file:' ||
  /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

let loading = null;

/** GoatCounter 스크립트는 필요할 때 한 번만 부른다 — 첫 화면을 늦추지 않는다. */
function ready() {
  if (disabled) return Promise.resolve(null);
  if (window.goatcounter?.count) return Promise.resolve(window.goatcounter.count.bind(window.goatcounter));
  if (!loading) {
    window.goatcounter = { no_onload: true, no_events: true };
    loading = new Promise((resolve) => {
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://gc.zgo.at/count.js';
      s.dataset.goatcounter = SITE;
      s.addEventListener('load', () =>
        resolve(window.goatcounter?.count ? window.goatcounter.count.bind(window.goatcounter) : null),
      );
      s.addEventListener('error', () => resolve(null)); // 광고 차단기에 막혀도 게임은 그대로 돈다
      document.head.append(s);
    });
  }
  return loading;
}

/** 페이지 하나를 봤다. `path` 는 지금 주소 그대로 (연습 여부는 물음표 뒤라 안 실린다). */
export async function countPage() {
  const count = await ready();
  if (count) count({ path: location.pathname, title: document.title });
}

/**
 * 무슨 일이 일어났다 — `끝남/포켓몬/속성/맞힘` 같은 이름표만 보낸다.
 * 추측한 이름·정답은 **절대 넣지 않는다**.
 */
export async function countEvent(name) {
  const count = await ready();
  if (count) count({ path: name, event: true, title: name });
}
