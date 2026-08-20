/**
 * **화면이 다 뜬 뒤에 하는 잔일** — 한 파일에 모은다 (2026-08-17).
 *
 * 왜 밖으로 뺐나: 첫 화면에 `script-src` 자물쇠를 걸려면 인라인 <script> 가 0 이어야 한다.
 * 지문(sha256)으로 허락하는 길은 막혀 있다 — 지문을 하나라도 적으면 크롬이
 * `'inline-speculation-rules'` 를 무시해서 **미리읽기가 죽는다**(2026-08-17 실험으로 갈랐다).
 * 그러니 남은 길은 인라인을 없애는 것뿐이고, 없애도 안전한 것부터 옮긴다.
 *
 * 여기 있는 것은 **첫 그림과 무관한 것만**이다. 테마 깜빡임 막기·부팅 눈금처럼
 * 그려지기 전에 돌아야 하는 것은 그대로 머리에 남는다 — 밖으로 빼면 늦어서 뜻이 없다.
 */
const idle: (fn: () => void) => void =
  (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback
  || ((f: () => void) => { setTimeout(f, 200); });

/** 화면이 다 뜨고 한가해진 뒤에. 이미 다 떴으면 바로 한가할 때. */
function whenIdle(todo: () => void): void {
  if (document.readyState === 'complete') idle(todo);
  else addEventListener('load', () => idle(todo));
}

/* 글꼴은 내용이 아니라 꾸밈이다 — 먼저 오려고 회선을 다투면 정작 글이 늦게 나온다
   (평소처럼 걸었더니 첫 그림 284→760ms, 실측 TASK-KL-128). 그동안은 컴퓨터 글꼴로 보이는데
   폭을 맞춰 뒀으므로(tools.css) 바뀔 때 글이 밀리지 않는다. */
whenIdle(() => {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = '/apps/karmolab/css/fonts.css';
  document.head.appendChild(l);
});

/* 방문 기록. 바로 부르면 남의 서버에서 받아 실행하는 동안 주 스레드가 더 잡힌다(실측 +88ms) —
   방문 수는 조금 늦게 세어도 값이 같다. 도구를 옮겨 다닐 때의 기록은 `analytics.js` 가 맡고,
   처음 연 도구는 이 줄이 센다. */
addEventListener('load', () => {
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.setAttribute('data-goatcounter', 'https://mascari4615.goatcounter.com/count');
  document.head.appendChild(s);
});

/* 늦게 받는 것 셋 — 말 바꾸기·내 정보·같이 쓰기. 화면이 다 뜬 뒤 한가해지면 받는다.
   (예전엔 똑같은 아홉 줄이 머리에 세 군데 흩어져 있었다 — 한 곳으로 모았고 이제 밖으로 뺐다.) */
/* ★ **주소는 통째로 적는다 — 조각내면 그 파일이 안 지어진다** (2026-08-17, 실주소 404 로 들켰다).
   처음엔 이름만 배열에 담고 주소를 `${name}` 으로 붙였다. 그런데 무엇을 지을지 고르는 자
   (`scripts/entry-points.mjs`)는 **글자로 적힌 주소**를 찾는다 — 조각난 주소는 안 보인다.
   그래서 `copresence.js`·`alarm-fire.js` 가 빌드에서 빠져 배포에서 404 였다(화면은 멀쩡한데
   그 기능만 조용히 죽는다). 사람이 읽기에도 이쪽이 낫다. */
whenIdle(() => {
  [
    '/apps/karmolab/js/lang-switch.js',
    '/apps/karmolab/js/account.js',
    '/apps/karmolab/js/copresence.js',
  ].forEach((src) => {
    const s = document.createElement('script');
    s.src = src;
    document.head.appendChild(s);
  });
});

/* 알람 발화 모드 (TASK-KL-064) — Rust 스케줄러가 띄우는 창이 `#alarm-fire` 로 이 장을 연다.
   대시보드 부팅 대신 가벼운 풀스크린 알람만 올린다(`widgets-loader.js` 도 같은 해시로 일찍 나간다). */
if (location.hash === '#alarm-fire') {
  const s = document.createElement('script');
  s.src = '/apps/karmolab/js/alarm-fire.js';
  s.defer = true;
  document.head.appendChild(s);
}

/* 코드 색칠 도우미가 언어 파일을 어디서 찾는지 (Prism autoloader). 색칠은 첫 그림과 무관하다. */
document.addEventListener('DOMContentLoaded', () => {
  const P = (window as unknown as { Prism?: { plugins?: { autoloader?: { languages_path: string } } } }).Prism;
  if (P?.plugins?.autoloader) P.plugins.autoloader.languages_path = '/apps/karmolab/js/vendor/prism/components/';
});
