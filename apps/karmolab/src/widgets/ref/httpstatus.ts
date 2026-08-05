/**
 * HTTP 상태 코드 (TASK-KL-088) — 번호·이름·언제 쓰는지 한 줄.
 * 「이 코드 뭐였더라」 를 검색으로 나가지 않고 끝내는 표.
 */
(function (): void {
  const CODES: Array<[number, string, string]> = [
    [100, 'Continue', '요청 헤더까지 받았으니 본문을 계속 보내라'],
    [101, 'Switching Protocols', '프로토콜 전환 승인 (예: WebSocket)'],
    [200, 'OK', '정상 처리'],
    [201, 'Created', '자원이 새로 만들어짐 (POST 성공)'],
    [202, 'Accepted', '접수했지만 처리는 아직 (비동기 작업)'],
    [204, 'No Content', '성공했지만 돌려줄 본문이 없음 (DELETE 등)'],
    [206, 'Partial Content', '범위 요청의 일부만 응답 (이어받기·동영상)'],
    [301, 'Moved Permanently', '주소가 영구히 바뀜 — 검색엔진도 새 주소로 옮김'],
    [302, 'Found', '임시로 다른 곳 (원래 주소는 유지)'],
    [303, 'See Other', 'POST 후 GET 으로 결과를 보러 가라'],
    [304, 'Not Modified', '바뀐 게 없으니 캐시를 쓰라'],
    [307, 'Temporary Redirect', '임시 이동 — 메서드를 바꾸지 말 것'],
    [308, 'Permanent Redirect', '영구 이동 — 메서드를 바꾸지 말 것'],
    [400, 'Bad Request', '요청 자체가 잘못됨 (형식·파라미터)'],
    [401, 'Unauthorized', '인증이 필요함 — 사실상 "누구인지 모름"'],
    [402, 'Payment Required', '결제 필요 (일부 API 의 사용량 초과)'],
    [403, 'Forbidden', '누구인지는 알지만 권한이 없음'],
    [404, 'Not Found', '그런 자원이 없음'],
    [405, 'Method Not Allowed', '주소는 맞지만 그 메서드는 못 씀'],
    [408, 'Request Timeout', '클라이언트가 너무 늦게 보냄'],
    [409, 'Conflict', '현재 상태와 충돌 (동시 수정 등)'],
    [410, 'Gone', '있었지만 영구히 사라짐'],
    [413, 'Payload Too Large', '보낸 본문이 너무 큼'],
    [415, 'Unsupported Media Type', '지원하지 않는 Content-Type'],
    [418, "I'm a teapot", '만우절 농담 코드 — 실제로 표준 문서에 있음'],
    [422, 'Unprocessable Content', '형식은 맞지만 내용이 유효하지 않음 (검증 실패)'],
    [429, 'Too Many Requests', '요청이 너무 잦음 — 잠시 후 재시도'],
    [500, 'Internal Server Error', '서버가 터짐 (원인 불명 총칭)'],
    [501, 'Not Implemented', '서버가 그 기능을 구현하지 않음'],
    [502, 'Bad Gateway', '앞단 서버가 뒷단에서 이상한 응답을 받음'],
    [503, 'Service Unavailable', '과부하·점검으로 지금은 못 받음'],
    [504, 'Gateway Timeout', '뒷단 서버가 제때 답하지 않음'],
    [507, 'Insufficient Storage', '저장 공간 부족']
  ];

  const GROUP = (code: number): string => {
    if (code < 200) return '1xx 정보';
    if (code < 300) return '2xx 성공';
    if (code < 400) return '3xx 리다이렉트';
    if (code < 500) return '4xx 요청 오류';
    return '5xx 서버 오류';
  };

  Toolbox.register({
    id: 'httpstatus',
    title: 'HTTP 상태 코드',
    category: 'ref',
    desc: '200·301·403·404·500 등 HTTP 응답 코드의 뜻과 쓰는 상황을 정리한 표',
    layout: 'wide',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 7v6M12 16v1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '상태 코드',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '404 말고도 많답니다.' });
          window.RefTable?.build(container, {
            items: CODES.map(([code, name, desc]) => ({
              copy: String(code),
              glyph: String(code),
              label: name,
              sub: desc,
              keywords: `${code} ${name} ${desc}`,
              group: GROUP(code)
            })),
            placeholder: '번호나 이름으로 찾기 (예: 404, timeout, 리다이렉트)',
            copyNoun: '상태 코드',
            layout: 'list',
            note: '누르면 번호가 복사됩니다.'
          });
        }
      }
    ]
  });
})();
