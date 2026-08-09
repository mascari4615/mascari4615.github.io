/**
 * 참고표 (TASK-KL-088) — HTTP 상태·git 명령어·마크다운·단축키·확장자·키 코드를 한 위젯의 탭으로.
 *
 * 전부 「몰라서 찾아보는 표」 라 성격이 같다. 여섯 개가 목록에 나란히 서 있으면
 * 정작 무엇이 있는지 눈에 안 들어온다. 한 자리에 모아 탭으로 고르게 한다.
 * 화면은 각 부분 위젯이 그대로 그린다 — 표 데이터는 여전히 한 곳에만 있다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /* 탭 이름은 **쓸 때** 붙인다 — 표로 굳히면 말 묶음이 오기 전이라 한국어로 박힌다. */
  const parts = (): Array<[string, string]> => [
    ['gitcmd', t('reference.part.gitcmd', undefined, 'git 명령어')],
    ['markdown', t('reference.part.markdown', undefined, '마크다운')],
    ['httpstatus', t('reference.part.httpstatus', undefined, 'HTTP 상태')],
    ['shortcut', t('reference.part.shortcut', undefined, '단축키')],
    ['filetype', t('reference.part.filetype', undefined, '파일 확장자')],
    ['keycode', t('reference.part.keycode', undefined, '키 코드')],
    ['regexref', t('reference.part.regexref', undefined, '정규식')]
  ];

  Toolbox.register({
    id: 'reference',
    title: t('widgets.reference.title', undefined, "참고표"),
    category: 'ref',
    desc: t('widgets-desc.reference.desc', undefined, "git 명령어·마크다운·HTTP 상태·단축키·파일 확장자·키 코드를 한 곳에서 찾아봅니다"),
    layout: 'wide',
    lazyTabs: true, // 안 본 탭은 만들지 않는다
    icon: '<path d="M4 5a2 2 0 0 1 2-2h12a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M4 18a2 2 0 0 1 2-2h13" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 7h7M8 11h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: parts().map(([id, label]) => ({
      id,
      label,
      build: function (container: HTMLElement): void {
        void loadNamespace('reference').then(function () {

        Toolbox.mountTool(id, container);
              });
      }
    }))
  });
})();
