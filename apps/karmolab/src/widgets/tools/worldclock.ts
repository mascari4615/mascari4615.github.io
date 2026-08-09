/**
 * 세계 시간 · 시차 (TASK-KL-088)
 *
 * 시차 계산이 틀리는 이유는 대부분 **서머타임**이다. 나라별로 시행 여부와 전환일이 달라
 * 「+9시간」 같은 고정 숫자를 외우면 연중 몇 달은 어긋난다.
 * 그래서 상수를 쓰지 않고 브라우저의 IANA 시간대 데이터에 매번 물어본다 — 서머타임이 자동 반영된다.
 */
import { t, loadNamespace, locale } from '../../lib/i18n';

(function (): void {
  /**
   * `[IANA 시간대, 도시 열쇠, 지역]`.
   *
   * 나라 이름을 여기 적지 않는다 — 브라우저가 `Intl.DisplayNames` 로 **모든 언어의 나라 이름**을
   * 이미 알고 있다. 적어 두면 언어를 늘릴 때마다 41개를 또 옮겨야 하고, 나라 이름이 바뀌면
   * (튀르키예처럼) 우리 표만 낡는다. 지역이 `@` 로 시작하면 나라로 안 떨어지는 자리다
   * (「미국 동부」처럼) — 그때만 말 묶음에서 가져온다.
   */
  const ZONES: Array<[string, string, string]> = [
    ['Asia/Seoul', 'seoul', 'KR'],
    ['Asia/Tokyo', 'tokyo', 'JP'],
    ['Asia/Shanghai', 'shanghai', 'CN'],
    ['Asia/Hong_Kong', 'hongkong', 'HK'],
    ['Asia/Taipei', 'taipei', 'TW'],
    ['Asia/Singapore', 'singapore', 'SG'],
    ['Asia/Bangkok', 'bangkok', 'TH'],
    ['Asia/Ho_Chi_Minh', 'hochiminh', 'VN'],
    ['Asia/Jakarta', 'jakarta', 'ID'],
    ['Asia/Manila', 'manila', 'PH'],
    ['Asia/Kolkata', 'delhi', 'IN'],
    ['Asia/Dubai', 'dubai', 'AE'],
    ['Europe/Moscow', 'moscow', 'RU'],
    ['Europe/Istanbul', 'istanbul', 'TR'],
    ['Europe/Berlin', 'berlin', 'DE'],
    ['Europe/Paris', 'paris', 'FR'],
    ['Europe/Madrid', 'madrid', 'ES'],
    ['Europe/Rome', 'rome', 'IT'],
    ['Europe/Amsterdam', 'amsterdam', 'NL'],
    ['Europe/Zurich', 'zurich', 'CH'],
    ['Europe/Prague', 'prague', 'CZ'],
    ['Europe/London', 'london', 'GB'],
    ['Europe/Lisbon', 'lisbon', 'PT'],
    ['America/New_York', 'newyork', '@us-east'],
    ['America/Chicago', 'chicago', '@us-central'],
    ['America/Denver', 'denver', '@us-mountain'],
    ['America/Los_Angeles', 'losangeles', '@us-west'],
    ['America/Anchorage', 'anchorage', '@us-alaska'],
    ['Pacific/Honolulu', 'honolulu', '@us-hawaii'],
    ['America/Toronto', 'toronto', 'CA'],
    ['America/Vancouver', 'vancouver', '@ca-west'],
    ['America/Mexico_City', 'mexicocity', 'MX'],
    ['America/Sao_Paulo', 'saopaulo', 'BR'],
    ['America/Argentina/Buenos_Aires', 'buenosaires', 'AR'],
    ['Australia/Sydney', 'sydney', 'AU'],
    ['Australia/Perth', 'perth', '@au-west'],
    ['Pacific/Auckland', 'auckland', 'NZ'],
    ['Africa/Cairo', 'cairo', 'EG'],
    ['Africa/Johannesburg', 'johannesburg', 'ZA'],
    ['Africa/Lagos', 'lagos', 'NG'],
    ['UTC', 'utc', '@utc'],
  ];

  /** 도시 이름 — 말 묶음에서. */
  const cityName = (key: string): string => t(`worldclock.city.${key}`);

  /** 나라 이름 — 브라우저가 안다. 못 알아보면 코드를 그대로 보여 준다(빈칸보다 낫다). */
  function regionName(region: string): string {
    if (region.startsWith('@')) return t(`worldclock.region.${region.slice(1)}`);
    try {
      const dn = new (Intl as unknown as { DisplayNames: new (l: string[], o: { type: string }) => { of: (c: string) => string | undefined } })
        .DisplayNames([locale()], { type: 'region' });
      return dn.of(region) || region;
    } catch {
      return region;
    }
  }

  /** 그 시간대의 UTC 오프셋(분). Intl 이 서머타임까지 반영해 준다. */
  function offsetMinutes(zone: string, at: Date): number {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).format(at);
    const m = s.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
    if (!m) return 0;
    const sign = m[1] === '-' ? -1 : 1;
    return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] || '0', 10));
  }

  Toolbox.register({
    id: 'worldclock',
    /* 도구 큰제목이 이 값을 쓴다 — 목록의 이름 표는 여기까지 못 미친다(실측: 영어 장의
       큰제목만 한국어로 남았다). 등록 순간이라 기다릴 수 없어 원본을 기본값으로 함께 준다. */
    title: t('widgets.worldclock.title', undefined, '세계 시간 · 시차'),
    category: 'tool',
    /* 도구 큰제목 아래 한 줄도 이 값을 쓴다 — 등록 순간이라 원본을 기본값으로 함께 준다. */
    desc: t('widgets-desc.worldclock.desc', undefined, '도시별 현재 시각과 서울과의 시차를 봅니다. 서머타임 자동 반영'),
    layout: 'wide',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" stroke="currentColor" stroke-width="1.4" fill="none"/>',
    tabs: [
      {
        id: 'app',
        /* 등록 순간에 쓰인다 — 기다릴 자리가 없어 원본을 기본값으로 함께 준다. */
        label: t('worldclock.tab', undefined, '세계 시간'),
        /* 말을 받아온 뒤에 그린다 — 안 기다리면 화면에 열쇠 이름이 뜬다. */
        build: function (container: HTMLElement): void {
          void loadNamespace('worldclock').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    /* 번역 글에 꺾쇠가 들어와도 화면이 안 깨지게. */
    const esc = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          Mdd.linePreset('tool_run', { msg: t('worldclock.mdd') });
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('worldclock.baseCity'))}</div>
                  <select id="wcBase" aria-label="${esc(t('worldclock.baseCity'))}"></select>
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('worldclock.baseTimeHint'))}</div>
                  <input type="datetime-local" id="wcWhen" aria-label="${esc(t('worldclock.baseTime'))}">
                </div>
              </div>
            </div>
            <div class="field-group">
              <input type="text" id="wcSearch" placeholder="${esc(t('worldclock.search'))}">
            </div>
            <div class="tool-list" id="wcList"></div>
            <div class="tool-status" id="wcStatus"></div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const baseSel = $<HTMLSelectElement>('#wcBase');
          const when = $<HTMLInputElement>('#wcWhen');
          const search = $<HTMLInputElement>('#wcSearch');
          const list = $<HTMLElement>('#wcList');
          const status = $<HTMLElement>('#wcStatus');

          baseSel.innerHTML = ZONES.map(
            ([z, key, region]) => `<option value="${z}">${esc(cityName(key))} · ${esc(regionName(region))}</option>`
          ).join('');
          baseSel.value = 'Asia/Seoul';

          /** 적힌 벽시계 시각(YYYY-MM-DDTHH:mm)을 그 도시 기준으로 읽어 실제 순간을 낸다. */
          function wallToInstant(wall: string, zone: string): Date {
            const asUtc = Date.parse(wall.length === 16 ? wall + ':00Z' : wall + 'Z');
            let ts = asUtc;
            for (let i = 0; i < 2; i++) ts = asUtc - offsetMinutes(zone, new Date(ts)) * 60000;
            return new Date(ts);
          }

          function render(): void {
            /* 적어 넣은 시각은 **기준 도시의 벽시계 시각**이다. 예전에는 `new Date(값)` 으로 읽어
               *브라우저가 있는 시간대*로 해석했다 — 기준 도시가 서울인데 브라우저가 베를린이면
               표 전체가 8시간씩 어긋났다. 화면 라벨은 「기준 도시 / 기준 시각」이라 사람은 도시
               기준으로 적는데, 결과만 조용히 다른 값이 나왔다.
               고치는 법: 적힌 벽시계 시각을 UTC 로 가정해 한 번 읽고, 그 시점 기준 도시의 오프셋을
               빼서 실제 순간을 얻는다. 서머타임 경계에서 흔들리지 않게 두 번 접는다. */
            const at = when.value ? wallToInstant(when.value, baseSel.value) : new Date();
            if (isNaN(at.getTime())) return;
            const baseOff = offsetMinutes(baseSel.value, at);
            const q = search.value.trim().toLowerCase();

            list.innerHTML = ZONES.filter(
              ([z, key, region]) =>
                !q ||
                cityName(key).toLowerCase().includes(q) ||
                regionName(region).toLowerCase().includes(q) ||
                z.toLowerCase().includes(q)
            )
              .map(([z, key, region]) => {
                const city = cityName(key);
                const country = regionName(region);
                const diff = (offsetMinutes(z, at) - baseOff) / 60;
                /* 45분·30분짜리 시간대(네팔 +5:45, 인도 +5:30)를 `+5.8시간` 처럼 적으면 아무도 못 읽는다.
                   시간과 분으로 적는다. */
                const diffMin = offsetMinutes(z, at) - baseOff;
                const sign = diffMin > 0 ? '+' : '-';
                const am = Math.abs(diffMin);
                const diffText =
                  diffMin === 0
                    ? t('worldclock.same')
                    : t('worldclock.diff', {
                        sign,
                        h: Math.floor(am / 60),
                        m: am % 60 ? t('worldclock.diffMinutes', { m: am % 60 }) : ''
                      });
                const time = new Intl.DateTimeFormat(locale(), {
                  timeZone: z,
                  dateStyle: 'short',
                  timeStyle: 'short'
                }).format(at);
                const here = z === baseSel.value;
                return `<div class="tool-list-row"${here ? ' style="border-left:3px solid var(--accent);"' : ''}>
                          <span class="tool-list-key">${city}<span class="tool-list-dim" style="display:block;">${country}</span></span>
                          <span class="tool-list-val">${time} <span class="tool-list-dim">${diffText}</span></span>
                        </div>`;
              })
              .join('');

            const baseName = ZONES.find(([z]) => z === baseSel.value);
            status.textContent = t('worldclock.status', {
              city: baseName ? cityName(baseName[1]) : '',
              when: when.value ? t('worldclock.at') : t('worldclock.now')
            });
            status.className = 'tool-status ok';
          }

          [baseSel, when, search].forEach((el) => {
            el.addEventListener('input', render);
            el.addEventListener('change', render);
          });
          render();
          // 기준 시각을 비워 둔 동안만 살아 있는 시계로 둔다 (지정했으면 흔들리면 안 된다).
          // 위젯을 떠날 때를 알려 주는 훅이 없으므로, 화면에서 떨어져 나간 것을 스스로 보고 멈춘다
          // (안 그러면 다른 도구로 가도 타이머가 계속 돈다).
          const timer = window.setInterval(() => {
            if (!container.isConnected) {
              clearInterval(timer);
              return;
            }
            if (!when.value && document.visibilityState === 'visible') render();
          }, 30000);
          Toolbox.trackUse?.('view');
  }
})();
