/**
 * HTTP 상태 코드 (TASK-KL-088) — 번호·이름·언제 쓰는지 한 줄.
 * 「이 코드 뭐였더라」 를 검색으로 나가지 않고 끝내는 표.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /* 표는 **쓸 때** 짓는다 — 실려 오는 순간 지으면 말 묶음이 아직 없어 열쇠가 그대로 박힌다. */
  const codes = (): Array<[number, string, string]> => [
    [100, 'Continue', t('httpstatus.t01')],
    [101, 'Switching Protocols', t('httpstatus.t02')],
    [200, 'OK', t('httpstatus.t03')],
    [201, 'Created', t('httpstatus.t04')],
    [202, 'Accepted', t('httpstatus.t05')],
    [204, 'No Content', t('httpstatus.t06')],
    [206, 'Partial Content', t('httpstatus.t07')],
    [301, 'Moved Permanently', t('httpstatus.t08')],
    [302, 'Found', t('httpstatus.t09')],
    [303, 'See Other', t('httpstatus.t10')],
    [304, 'Not Modified', t('httpstatus.t11')],
    [307, 'Temporary Redirect', t('httpstatus.t12')],
    [308, 'Permanent Redirect', t('httpstatus.t13')],
    [400, 'Bad Request', t('httpstatus.t14')],
    [401, 'Unauthorized', t('httpstatus.t15')],
    [402, 'Payment Required', t('httpstatus.t16')],
    [403, 'Forbidden', t('httpstatus.t17')],
    [404, 'Not Found', t('httpstatus.t18')],
    [405, 'Method Not Allowed', t('httpstatus.t19')],
    [408, 'Request Timeout', t('httpstatus.t20')],
    [409, 'Conflict', t('httpstatus.t21')],
    [410, 'Gone', t('httpstatus.t22')],
    [413, 'Payload Too Large', t('httpstatus.t23')],
    [415, 'Unsupported Media Type', t('httpstatus.t24')],
    [418, "I'm a teapot", t('httpstatus.t25')],
    [422, 'Unprocessable Content', t('httpstatus.t26')],
    [429, 'Too Many Requests', t('httpstatus.t27')],
    [500, 'Internal Server Error', t('httpstatus.t28')],
    [501, 'Not Implemented', t('httpstatus.t29')],
    [502, 'Bad Gateway', t('httpstatus.t30')],
    [503, 'Service Unavailable', t('httpstatus.t31')],
    [504, 'Gateway Timeout', t('httpstatus.t32')],
    [507, 'Insufficient Storage', t('httpstatus.t33')]
  ];

  const group = (code: number): string => {
    if (code < 200) return t('httpstatus.t34');
    if (code < 300) return t('httpstatus.t35');
    if (code < 400) return t('httpstatus.t36');
    if (code < 500) return t('httpstatus.t37');
    return t('httpstatus.t38');
  };

  Toolbox.register({
    id: 'httpstatus',
    title: t('widgets.httpstatus.title', undefined, "HTTP 상태 코드"),
    category: 'ref',
    desc: t('widgets-desc.httpstatus.desc', undefined, "200·301·403·404·500 등 HTTP 응답 코드의 뜻과 쓰는 상황을 정리한 표"),
    layout: 'wide',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 7v6M12 16v1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('httpstatus.t41', undefined, "상태 코드"),
        build: function (container: HTMLElement): void {
          void loadNamespace('httpstatus').then(function () {

          Mdd.linePreset('tool_run', { msg: t('httpstatus.t42') });
          window.RefTable?.build(container, {
            items: codes().map(([code, name, desc]) => ({
              copy: String(code),
              glyph: String(code),
              label: name,
              sub: desc,
              keywords: `${code} ${name} ${desc}`,
              group: group(code)
            })),
            placeholder: t('httpstatus.t43'),
            copyNoun: t('httpstatus.t41'),
            layout: 'list',
            note: t('httpstatus.t44')
          });
                  });
        }
      }
    ]
  });
})();
