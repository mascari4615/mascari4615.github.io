/**
 * 계산기 (TASK-KL-088) — 관련 도구를 한 위젯의 탭으로 묶는다.
 *
 * 목록에 낱개로 서 있으면 무엇이 있는지 눈에 안 들어오고 고를 게 늘어난다.
 * 화면은 각 부분 위젯이 그대로 그린다 (Toolbox.mountTool) — 복제하면 고칠 곳이 갈라진다.
 * 부분 위젯의 개별 주소는 그대로 살아 있다 (검색 유입 유지).
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /* 부품 이름은 **쓸 때** 붙인다 — 표로 굳히면 말 묶음이 오기 전이라 한국어로 박힌다. */
  const parts = (): Array<[string, string]> => [
    ['percent', t('calc.part.percent')],
    ['interest', t('calc.part.interest')],
    ['bmi', 'BMI'],
    ['unitconv', t('calc.part.unitconv')],
    ['radix', t('calc.part.radix')],
    ['numword', t('calc.part.numword')],
    ['aspect', t('calc.part.aspect')],
    ['grade', t('calc.part.grade')],
    ['vat', t('calc.part.vat')],
    ['bytesize', t('calc.part.bytesize')],
    ['bizno', t('calc.part.bizno')],
    ['loan', t('calc.part.loan')],
    ['cssunit', t('calc.part.cssunit')]
  ];

  Toolbox.register({
    id: 'calc',
    title: t('widgets.calc.title', undefined, "계산기"),
    category: 'tool',
    desc: t('widgets-desc.calc.desc', undefined, "퍼센트·이자·BMI·단위·진법 계산을 한 곳에서"),
    layout: 'form',
    lazyTabs: true, // 안 본 탭은 만들지 않는다
    icon: '<rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 7h8M8 12h2M12 12h2M16 12h1M8 16h2M12 16h2M16 16h1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: parts().map(([id, label]) => ({
      id,
      label,
      build: function (container: HTMLElement): void {
        void loadNamespace('calc').then(function () {

        Toolbox.mountTool(id, container);
              });
      }
    }))
  });
})();
