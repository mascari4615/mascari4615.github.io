/**
 * ASCII 코드표 (TASK-KL-088) — 0~127. 10진·16진·2진·HTML 엔티티 함께.
 * 표는 코드에서 생성한다 (128줄을 손으로 적으면 오타가 반드시 생긴다).
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /* 표는 **쓸 때** 짓는다 — 모듈이 실려 오는 순간 지으면 말 묶음이 아직 없어 열쇠가 그대로 박힌다.
   * (제어문자 이름 32개가 통째로 `ascii.t01` 로 뜨던 자리다.) */
  let defined = false;
  function defineTable(): void {
    if (defined) return;
    defined = true;
    const CONTROL = [
      t('ascii.t01'), t('ascii.t02'), t('ascii.t03'), t('ascii.t04'), t('ascii.t05'), t('ascii.t06'), t('ascii.t07'), t('ascii.t08'),
      t('ascii.t09'), t('ascii.t10'), t('ascii.t11'), t('ascii.t12'), t('ascii.t13'), t('ascii.t14'), t('ascii.t15'), t('ascii.t16'),
      t('ascii.t17'), t('ascii.t18'), t('ascii.t19'), t('ascii.t20'), t('ascii.t21'),
      t('ascii.t22'), t('ascii.t23'), t('ascii.t24'), t('ascii.t25'), t('ascii.t26'), t('ascii.t27'), t('ascii.t28'),
      t('ascii.t29'), t('ascii.t30'), t('ascii.t31'), t('ascii.t32')
    ];

    function nameOf(code: number): string {
      if (code < 32) return CONTROL[code];
      if (code === 32) return t('ascii.t33');
      if (code === 127) return t('ascii.t34');
      return String.fromCharCode(code);
    }

    const asciiItems = [];
    for (let code = 0; code <= 127; code++) {
      const printable = code > 32 && code < 127;
      const group = code < 32 || code === 127 ? t('ascii.t35') : code < 48 || (code > 57 && code < 65) || (code > 90 && code < 97) || code > 122 ? t('ascii.t36') : code < 58 ? t('ascii.t37') : code < 91 ? t('ascii.t38') : t('ascii.t39');
      asciiItems.push({
        copy: printable ? String.fromCharCode(code) : String(code),
        glyph: printable ? String.fromCharCode(code) : String(code),
        label: nameOf(code),
        sub: `${code} · 0x${code.toString(16).toUpperCase().padStart(2, '0')} · ${code.toString(2).padStart(8, '0')}`,
        keywords: `${code} ${code.toString(16)} ${nameOf(code)}`,
        group
      });
    }

    window.RefTable?.define('ascii', {
      items: asciiItems,
      placeholder: t('ascii.t40'),
      copyNoun: t('ascii.t41'),
      layout: 'list',
      note: t('ascii.t42')
    });
  }

  Toolbox.register({
    id: 'ascii',
    title: t('widgets.ascii.title', undefined, "ASCII 코드표"),
    category: 'ref',
    desc: t('widgets-desc.ascii.desc', undefined, "0~127 ASCII 문자의 10진·16진·2진 값과 제어문자 의미를 한 표에서 봅니다"),
    layout: 'wide',
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 9h18M9 9v11" stroke="currentColor" stroke-width="1.4"/>',
    tabs: [
      {
        id: 'app',
        label: 'ASCII',
        build: function (container: HTMLElement): void {
          void loadNamespace('ascii').then(function () {

          defineTable();
          Mdd.linePreset('tool_run', { msg: t('ascii.t45') });
          window.RefTable?.build(container, window.RefTable.get('ascii')!);
                  });
        }
      }
    ]
  });
})();
