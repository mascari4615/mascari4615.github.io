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
    ['percent', t('calc.part.percent', undefined, '퍼센트')],
    ['interest', t('calc.part.interest', undefined, '이자')],
    ['bmi', 'BMI'],
    ['unitconv', t('calc.part.unitconv', undefined, '단위')],
    ['radix', t('calc.part.radix', undefined, '진법')],
    ['numword', t('calc.part.numword', undefined, '숫자 ↔ 한글')],
    ['aspect', t('calc.part.aspect', undefined, '비율')],
    ['grade', t('calc.part.grade', undefined, '학점')],
    ['vat', t('calc.part.vat', undefined, '부가세')],
    ['bytesize', t('calc.part.bytesize', undefined, '용량')],
    ['bizno', t('calc.part.bizno', undefined, '사업자번호')],
    ['loan', t('calc.part.loan', undefined, '대출 상환')],
    ['cssunit', t('calc.part.cssunit', undefined, 'CSS 단위')]
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
