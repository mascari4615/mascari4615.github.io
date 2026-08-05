/**
 * ASCII 코드표 (TASK-KL-088) — 0~127. 10진·16진·2진·HTML 엔티티 함께.
 * 표는 코드에서 생성한다 (128줄을 손으로 적으면 오타가 반드시 생긴다).
 */
(function (): void {
  const CONTROL = [
    'NUL 널', 'SOH 헤딩 시작', 'STX 텍스트 시작', 'ETX 텍스트 끝', 'EOT 전송 끝', 'ENQ 조회', 'ACK 확인', 'BEL 벨',
    'BS 백스페이스', 'HT 탭', 'LF 줄바꿈', 'VT 수직 탭', 'FF 폼피드', 'CR 캐리지 리턴', 'SO 시프트 아웃', 'SI 시프트 인',
    'DLE 데이터 링크 이스케이프', 'DC1 장치 제어 1', 'DC2 장치 제어 2', 'DC3 장치 제어 3', 'DC4 장치 제어 4',
    'NAK 부정 응답', 'SYN 동기', 'ETB 블록 끝', 'CAN 취소', 'EM 매체 끝', 'SUB 치환', 'ESC 이스케이프',
    'FS 파일 구분', 'GS 그룹 구분', 'RS 레코드 구분', 'US 유닛 구분'
  ];

  function nameOf(code: number): string {
    if (code < 32) return CONTROL[code];
    if (code === 32) return 'Space 공백';
    if (code === 127) return 'DEL 삭제';
    return String.fromCharCode(code);
  }

  Toolbox.register({
    id: 'ascii',
    title: 'ASCII 코드표',
    category: 'ref',
    desc: '0~127 ASCII 문자의 10진·16진·2진 값과 제어문자 의미를 한 표에서 봅니다',
    layout: 'wide',
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 9h18M9 9v11" stroke="currentColor" stroke-width="1.4"/>',
    tabs: [
      {
        id: 'app',
        label: 'ASCII',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '0번부터 127번까지, 컴퓨터 글자의 뿌리예요.' });
          const items = [];
          for (let code = 0; code <= 127; code++) {
            const printable = code > 32 && code < 127;
            const group = code < 32 || code === 127 ? '제어문자' : code < 48 || (code > 57 && code < 65) || (code > 90 && code < 97) || code > 122 ? '기호' : code < 58 ? '숫자' : code < 91 ? '대문자' : '소문자';
            items.push({
              copy: printable ? String.fromCharCode(code) : String(code),
              glyph: printable ? String.fromCharCode(code) : String(code),
              label: nameOf(code),
              sub: `${code} · 0x${code.toString(16).toUpperCase().padStart(2, '0')} · ${code.toString(2).padStart(8, '0')}`,
              keywords: `${code} ${code.toString(16)} ${nameOf(code)}`,
              group
            });
          }
          window.RefTable?.build(container, {
            items,
            placeholder: '문자·10진·16진·이름으로 찾기 (예: 65, 0x41, LF)',
            copyNoun: '값',
            layout: 'list',
            note: '출력 가능한 문자는 문자를, 제어문자는 10진 값을 복사합니다.'
          });
        }
      }
    ]
  });
})();
