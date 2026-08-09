/**
 * 개발 도구 (TASK-KL-088) — 개발하다 잠깐 필요해지는 것들을 한 위젯의 탭으로.
 *
 * 이것들은 「작업 중에 잠깐」 쓰인다. 낱개로 흩어져 있으면 매번 목록에서 찾아야 하고,
 * 정작 무엇이 있는지도 눈에 안 들어온다.
 * 화면은 각 부분 위젯이 그대로 그린다 (Toolbox.mountTool) — 복제하면 고칠 곳이 갈라진다.
 * 부분 위젯의 개별 주소는 그대로 살아 있다 (검색 유입 유지).
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /* 부품 이름은 **쓸 때** 붙인다 — 표로 굳히면 말 묶음이 오기 전이라 한국어로 박힌다. */
  const parts = (): Array<[string, string]> => [
    ['jsonfmt', 'JSON'],
    ['jwt', 'JWT'],
    ['regextest', t('devtool.part.regextest')],
    ['hashgen', t('devtool.part.hashgen')],
    ['uuidgen', 'UUID'],
    ['cron', t('devtool.part.cron')],
    ['urlparse', 'URL'],
    ['crypto', t('devtool.part.crypto')],
    ['base64', 'Base64'],
    ['csvjson', 'CSV ↔ JSON'],
    ['tableconv', t('devtool.part.tableconv')],
    ['json2ts', t('devtool.part.json2ts')]
  ];

  Toolbox.register({
    id: 'devtool',
    title: t('widgets.devtool.title', undefined, "개발 도구"),
    category: 'tool',
    desc: t('widgets-desc.devtool.desc', undefined, "JSON 포맷·JWT 디코드·정규식 테스트·해시·UUID·크론·URL·암호화를 한 곳에서"),
    layout: 'wide',
    lazyTabs: true, // 안 본 탭은 만들지 않는다
    icon: '<path d="M9 6 3 12l6 6M15 6l6 6-6 6" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: parts().map(([id, label]) => ({
      id,
      label,
      build: function (container: HTMLElement): void {
        void loadNamespace('devtool').then(function () {

        Toolbox.mountTool(id, container);
              });
      }
    }))
  });
})();
