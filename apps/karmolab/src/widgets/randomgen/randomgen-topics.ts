/**
 * 랜덤 생성기 — 주제 데이터 로드
 *
 * 단순 주제( items 기반)는 topics.json에서 로드.
 * generator 기반 주제는 randomgen-number.js, randomgen-time.js, randomgen-color.js, randomgen-name.js에서 추가.
 *
 * 참고: [니힐 랜덤 키워드](https://nihilapp.github.io/keyword) / [nihilapp/random-keyword-code](https://github.com/nihilapp/random-keyword-code)
 *       창작자용 랜덤 키워드 사이트를 참고하여 주제·키워드를 보강했습니다. (MIT License)
 *
 * 새 주제 추가:
 * - 단순: topics.json에 { id, label, group, items: ["a","b",...] } 추가
 * - 커스텀: 각 모듈에서 topics.push({ id, label, group, generator: () => string | { name, sub } })
 */
import type { RandomGenTopic } from '../../../types/karmolab';
import topicsData from '../../../js/widgets/randomgen/topics.json';

(function () {

  /*
   * ★★ 주제 목록은 **파일에 같이 실어 둔다** (예전에는 여기서 통째로 멈춰 섰다).
   *
   *   여기 있던 코드는 `XMLHttpRequest` 를 **동기**로 열어 topics.json(18KB)을 받았다.
   *   동기 요청은 받아올 때까지 **화면 전체를 세운다** — 느린 회선에서 그 시간이 통째로
   *   「눌러도 반응 없는 시간」이 된다(실측: 이 파일 하나가 286ms). 브라우저도 폐기 경고를 낸다.
   *   빌드할 때 자료를 같이 묶으면 요청 자체가 사라진다 — 기다릴 것이 없다.
   */
  const data = topicsData as RandomGenTopic[];

  window.RANDOMGEN_TOPICS = data;
})();
