/**
 * 문자표 (TASK-KL-088) — 특수문자·이모지·HTML 엔티티·ASCII 를 한 위젯의 탭으로.
 *
 * 넷 다 「자판에 없는 글자를 찾아 복사」 라는 같은 일이라, 목록에 따로 서 있으면 위젯만 늘고
 * 고를 게 늘어난다. 위젯은 하나로 합치되 **각 표의 검색 페이지 주소는 그대로 둔다** —
 * 「HTML 특수문자」 같은 검색어로 들어오는 길이 사라지면 안 되기 때문이다.
 *
 * 표 정의는 각 데이터 모듈이 RefTable.define 으로 등록해 둔 것을 꺼내 쓴다 (복제 X).
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /* 탭 이름은 **쓸 때** 붙인다 — 표로 굳히면 말 묶음이 오기 전이라 한국어로 박힌다. */
  const tabs = (): Array<[string, string]> => [
    ['specialchar', t('charmap.part.specialchar', undefined, '특수문자')],
    ['emoji', t('charmap.part.emoji', undefined, '이모지')],
    ['htmlentity', t('charmap.part.htmlentity', undefined, 'HTML 엔티티')],
    ['ascii', t('charmap.part.ascii', undefined, 'ASCII 코드')]
  ];

  Toolbox.register({
    id: 'charmap',
    title: t('widgets.charmap.title', undefined, "문자표"),
    category: 'ref',
    desc: t('widgets-desc.charmap.desc', undefined, "특수문자·이모지·HTML 엔티티·ASCII 를 한 곳에서 찾아 눌러 복사합니다"),
    layout: 'wide',
    lazyTabs: true, // 안 본 탭은 만들지 않는다
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M7 9h2M7 13h4M13 9h4M15 13h2M7 17h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    tabs: tabs().map(([id, label]) => ({
      id,
      label,
      build: function (container: HTMLElement): void {
        void loadNamespace('charmap').then(function () {

        const spec = window.RefTable?.get(id);
        if (!spec) {
          container.innerHTML = `<div class="tool-status error">${t('charmap.loadFail')}</div>`;
          return;
        }
        window.RefTable?.build(container, spec);
              });
      }
    }))
  });
})();
