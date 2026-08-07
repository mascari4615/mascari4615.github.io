/**
 * 일정 파일 만들기 (TASK-KL-088)
 *
 * 모임 공지를 올릴 때 「달력에 추가」 파일 하나만 있으면 참석률이 다르다. 그런데 .ics 는
 * 손으로 쓰기엔 규칙이 까다롭다 — 줄바꿈은 CRLF 여야 하고, 쉼표·세미콜론은 앞에 역슬래시를
 * 붙여야 하고, 시각은 UTC 로 적어야 어느 나라에서 열어도 같은 시각이 된다.
 *
 * 신경 쓴 곳:
 *  - **시각을 UTC 로 적는다.** 한국 시간 그대로 쓰면 외국에서 연 사람에게 9시간 어긋난다.
 *    입력은 한국 시간으로 받고, 파일에는 UTC 로 넣은 뒤 「한국시간 ○○ = 파일에 ○○」로 보여 준다.
 *  - 규칙에 걸리는 글자(쉼표·세미콜론·줄바꿈)를 자동으로 처리한다. 안 하면 달력 앱이
 *    파일을 통째로 거부하는데, 그때 나오는 오류 메시지가 아무 도움이 안 된다.
 */
(function (): void {
  /** .ics 규칙: 쉼표·세미콜론·역슬래시는 이스케이프, 줄바꿈은 \n 글자로 */
  const esc = (s: string): string =>
    s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

  /** 한국 시간 문자열 → UTC 기준 `YYYYMMDDTHHMMSSZ` */
  function toUtcStamp(local: string): string {
    // input[type=datetime-local] 은 시간대가 없다. 한국 시간으로 읽겠다고 못 박는다
    const d = new Date(local + ':00+09:00');
    if (isNaN(d.getTime())) return '';
    const p = (n: number): string => String(n).padStart(2, '0');
    return (
      `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T` +
      `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
    );
  }

  /** 종일 일정은 날짜만 적고, 끝 날짜는 하루 뒤로 적어야 그 날까지 잡힌다 */
  function dayStamp(local: string, plusDays = 0): string {
    // 종일 일정은 규격상 **시간대가 없는 달력 날짜**다. 예전 판은 한국시간으로 파싱해 놓고
    // 현지 게터(getFullYear/getMonth/getDate)로 뽑아, UTC 기계(CI)에서 하루가 밀렸다 —
    // 로컬은 통과하고 CI 만 빨간 전형(2026-08-07: DTSTART 20260831/DTEND 20260903 로 어긋남).
    // 시간대를 아예 태우지 않는다: 숫자로 읽고 UTC 로 계산해 UTC 로 출력.
    const [y, m, d] = local.slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return '';
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (isNaN(dt.getTime())) return '';
    dt.setUTCDate(dt.getUTCDate() + plusDays);
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${dt.getUTCFullYear()}${p(dt.getUTCMonth() + 1)}${p(dt.getUTCDate())}`;
  }

  Toolbox.register({
    id: 'icsmake',
    title: '일정 파일 만들기',
    category: 'tool',
    desc: '모임·공지를 달력에 넣을 수 있는 .ics 파일로 만듭니다. 시간대를 맞춰 적습니다',
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12 13v5M9.5 15.5h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '일정 만들기',
        build: function (container: HTMLElement): void {
          const now = new Date(Date.now() + 24 * 3600 * 1000);
          const p = (n: number): string => String(n).padStart(2, '0');
          const startDefault = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}T19:00`;
          const endDefault = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}T21:00`;

          container.innerHTML = `
            <div class="field-group">
              <label class="field-label" for="icTitle">일정 이름</label>
              <input type="text" id="icTitle" aria-label="일정 이름" placeholder="예: 스터디 3회차" value="모임">
            </div>

            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">시작 (한국 시간)</div>
                  <input type="datetime-local" id="icStart" aria-label="시작 시각" value="${startDefault}">
                </div>
                <div>
                  <div class="tool-sublabel">끝 (한국 시간)</div>
                  <input type="datetime-local" id="icEnd" aria-label="끝 시각" value="${endDefault}">
                </div>
              </div>
              <div class="tool-chips" style="margin-top:10px;">
                <label class="tool-chip"><input type="checkbox" id="icAllDay"> 종일 일정</label>
                <label class="tool-chip"><input type="checkbox" id="icAlarm" checked> 30분 전 알림</label>
              </div>
            </div>

            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">장소 (없어도 됨)</div>
                  <input type="text" id="icPlace" aria-label="장소" placeholder="예: 강남역 3번 출구">
                </div>
                <div>
                  <div class="tool-sublabel">반복</div>
                  <select id="icRepeat" aria-label="반복">
                    <option value="">반복 없음</option>
                    <option value="FREQ=WEEKLY">매주</option>
                    <option value="FREQ=WEEKLY;INTERVAL=2">격주</option>
                    <option value="FREQ=MONTHLY">매달</option>
                  </select>
                </div>
              </div>
              <label class="field-label" for="icNote" style="margin-top:10px;">메모 (없어도 됨)</label>
              <textarea id="icNote" rows="3" style="width:100%;" placeholder="준비물, 링크 등"></textarea>
            </div>

            <div class="cc-stats" id="icStats"></div>
            <div class="tool-list" id="icCheck"></div>

            <div class="field-group">
              <label class="field-label" for="icOut">만들어진 파일 내용</label>
              <textarea id="icOut" rows="9" spellcheck="false" style="width:100%;" readonly></textarea>
              <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
                <button class="btn btn-primary btn-sm" id="icSave">.ics 로 받기</button>
                <button class="btn btn-ghost btn-sm" id="icCopy">복사</button>
              </div>
            </div>

            <div class="tool-status" id="icStatus">일정은 브라우저 안에서만 다뤄집니다 — 어디에도 올리지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const out = $<HTMLTextAreaElement>('#icOut');
          const status = $<HTMLElement>('#icStatus');
          const stats = $<HTMLElement>('#icStats');
          const check = $<HTMLElement>('#icCheck');
          // 만든 내용을 따로 들고 있는다. 텍스트 상자에 넣었다 꺼내면 브라우저가 줄바꿈을
          // LF 로 바꿔 버려서, 내려받는 .ics 가 규칙(CRLF)에 안 맞게 된다 (시험이 잡았다).
          let built = '';

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          function run(): void {
            const title = $<HTMLInputElement>('#icTitle').value.trim() || '일정';
            const start = $<HTMLInputElement>('#icStart').value;
            const end = $<HTMLInputElement>('#icEnd').value;
            const allDay = $<HTMLInputElement>('#icAllDay').checked;
            if (!start || !end) {
              built = '';
              out.value = '';
              say('시작·끝 시각을 넣어 주세요.', 'error');
              return;
            }
            if (new Date(end) <= new Date(start) && !allDay) {
              built = '';
              out.value = '';
              say('끝 시각이 시작보다 빠르거나 같아요.', 'error');
              return;
            }

            const lines: string[] = [
              'BEGIN:VCALENDAR',
              'VERSION:2.0',
              'PRODID:-//KarmoLab//일정 파일 만들기//KO',
              'CALSCALE:GREGORIAN',
              'BEGIN:VEVENT',
              // 같은 일정을 두 번 받아도 달력이 하나로 알아보게 고정된 값에서 뽑는다
              `UID:${toUtcStamp(start)}-${Math.abs(hash(title + start)).toString(36)}@karmolab`,
              `DTSTAMP:${toUtcStamp(new Date().toISOString().slice(0, 16))}`,
              allDay
                ? `DTSTART;VALUE=DATE:${dayStamp(start)}`
                : `DTSTART:${toUtcStamp(start)}`,
              allDay
                ? `DTEND;VALUE=DATE:${dayStamp(end, 1)}` // 끝 날짜는 하루 뒤여야 그 날까지 잡힌다
                : `DTEND:${toUtcStamp(end)}`,
              `SUMMARY:${esc(title)}`
            ];
            const place = $<HTMLInputElement>('#icPlace').value.trim();
            if (place) lines.push(`LOCATION:${esc(place)}`);
            const note = $<HTMLTextAreaElement>('#icNote').value.trim();
            if (note) lines.push(`DESCRIPTION:${esc(note)}`);
            const rep = $<HTMLSelectElement>('#icRepeat').value;
            if (rep) lines.push(`RRULE:${rep}`);
            if ($<HTMLInputElement>('#icAlarm').checked && !allDay) {
              lines.push('BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'END:VALARM');
            }
            lines.push('END:VEVENT', 'END:VCALENDAR');

            // .ics 는 줄바꿈이 CRLF 여야 한다 — LF 만 쓰면 거부하는 달력 앱이 있다
            built = lines.join('\r\n') + '\r\n';
            out.value = built;

            stats.innerHTML =
              stat('일정', title, true) +
              stat('길이', allDay ? '종일' : lengthOf(start, end)) +
              stat('반복', rep ? ($<HTMLSelectElement>('#icRepeat').selectedOptions[0]?.text || '있음') : '없음');

            // 시간대는 사고가 나도 눈에 안 보이므로, 무엇이 어떻게 적혔는지 드러낸다
            check.innerHTML = allDay
              ? `<div class="tool-list-row"><span class="tool-list-key">날짜</span><span class="tool-list-val">${start.slice(0, 10)} (종일)</span></div>`
              : `<div class="tool-list-row"><span class="tool-list-key">한국 시간</span><span class="tool-list-val">${start.replace('T', ' ')}</span></div>` +
                `<div class="tool-list-row"><span class="tool-list-key">파일에 적힌 값</span><span class="tool-list-val">${toUtcStamp(start)} — 세계 표준시라 어느 나라에서 열어도 같은 시각입니다</span></div>`;
            say('받아서 달력에 넣거나, 공지에 파일로 올리세요.', 'ok');
            Toolbox.trackUse?.('ics');
          }

          function lengthOf(a: string, b: string): string {
            const m = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
            return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60 ? (m % 60) + '분' : ''}`.trim() : `${m}분`;
          }
          function hash(s: string): number {
            let h = 0;
            for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
            return h;
          }

          container.querySelectorAll('input, select, textarea').forEach((el) => {
            el.addEventListener('input', run);
            el.addEventListener('change', run);
          });
          $<HTMLButtonElement>('#icCopy').onclick = () => {
            void Toolbox.copyText?.(built, { message: '일정 파일 내용을 복사했어요' });
          };
          $<HTMLButtonElement>('#icSave').onclick = () => {
            if (!built) {
              say('먼저 시각을 넣어 주세요.', 'error');
              return;
            }
            const blob = new Blob([built], { type: 'text/calendar;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = ($<HTMLInputElement>('#icTitle').value.trim() || '일정') + '.ics';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            say('받았어요. 눌러서 달력에 넣거나, 공지에 그대로 올리세요.', 'ok');
          };
          run();
        }
      }
    ]
  });
})();
