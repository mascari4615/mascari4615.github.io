/**
 * 사진 자리 지도 (TASK-KL-316 / 31)
 *
 * 사진을 여럿 받아 **찍힌 자리와 때**를 보여 준다. 읽기는 `core/exif`, 묶기, 투영은 `core/photomap`.
 * 파일을 여럿 받고 그림으로 보여 줘야 해서 새 위젯이다(닮은 사진 찾기와 같은 이유).
 *
 * ⚠ **지도 타일을 안 받는다**. 받는 순간 내 사진이 어디서 찍혔는지가 남의 서버로 간다.
 * 점만 그리고, 진짜 지도는 사람이 누를 때만 새 창으로 나간다.
 */
import { dateToMs, read } from '../../core/exif';
import { escapeHtml as esc } from './shared/text';
import { days, frameOf, mapLink, metersBetween, places, project, type Shot } from '../../core/photomap';
import { markLive } from './shared/say';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {

  Toolbox.register({
    id: 'photomap',
    title: t('widgets.photomap.title', undefined, '사진 자리 보기'),
    category: 'image',
    desc: t(
      'widgets-desc.photomap.desc',
      undefined,
      '사진에 든 위치, 날짜를 읽어 어디서 언제 찍었는지 보여 줍니다. 지도 타일을 받지 않아 위치가 밖으로 안 나갑니다'
    ),
    layout: 'wide',
    icon: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: t('photomap.tab', undefined, '자리'),
        build: function (container: HTMLElement): void {
          void loadNamespace('photomap').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('photomap.mdd') });
    container.innerHTML = `
      <div style="display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap; margin-bottom:10px;">
        <div>
          <label class="field-label" for="pmFiles">${esc(t('photomap.label.files'))}</label>
          <input type="file" id="pmFiles" name="photos" accept="image/jpeg,image/*" multiple aria-label="${esc(t('photomap.label.files'))}">
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('photomap.label.near'))} <span id="pmNearVal" class="range-value">300 m</span></div>
          <input type="range" id="pmNear" name="near" aria-label="${esc(t('photomap.label.near'))}" min="50" max="5000" step="50" value="300" style="width:200px;">
        </div>
      </div>
      <div id="pmDots" style="border:1px solid rgba(128,128,128,.24); border-radius:10px; padding:8px; overflow:auto; margin-bottom:10px;"></div>
      <div class="tool-grid-2">
        <div>
          <div class="tool-sublabel">${esc(t('photomap.label.places'))}</div>
          <div id="pmPlaces" class="tool-list"></div>
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('photomap.label.days'))}</div>
          <div id="pmDays" class="tool-list"></div>
        </div>
      </div>
      <div class="tool-status" id="pmStatus">${esc(t('photomap.status.idle'))}</div>
      <p class="tool-hint">${esc(t('photomap.note.noTiles'))}</p>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const status = $<HTMLElement>('#pmStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    let shots: Shot[] = [];
    let noPlace = 0;

    function render(): void {
      const near = Number($<HTMLInputElement>('#pmNear').value);
      $<HTMLElement>('#pmNearVal').textContent = near>= 1000 ? (near / 1000).toFixed(1) + ' km' : near + ' m';

      if (shots.length === 0) {
        $<HTMLElement>('#pmDots').innerHTML = '';
        $<HTMLElement>('#pmPlaces').innerHTML = '';
        $<HTMLElement>('#pmDays').innerHTML = '';
        status.textContent = noPlace> 0 ? t('photomap.status.noneWithGps', { n: noPlace }) : t('photomap.status.idle');
        return;
      }

      const grouped = places(shots, near);
      const frame = frameOf(shots);
      const width = 640;
      const height = 360;
      const biggest = Math.max(...grouped.map((p) => p.shots.length));
      const dots = grouped
        .map((p) => {
          const at = project(p, frame, width, height);
          const r = 5 + Math.round((p.shots.length / biggest) * 12);
          return (
            '<circle cx="' + at.x + '" cy="' + at.y + '" r="' + r + '" fill="rgba(70,140,255,.45)" stroke="rgba(70,140,255,.95)" stroke-width="1.5">' +
            '<title>' + esc(p.shots.length + ', ' + p.lat.toFixed(4) + ', ' + p.lon.toFixed(4)) + '</title></circle>' +
            (p.shots.length> 1 ? '<text x="' + at.x + '" y="' + (at.y + 4) + '" text-anchor="middle" font-size="11" fill="#111">' + p.shots.length + '</text>' : '')
          );
        })
        .join('');
      /* 눈금 대신 **얼마나 넓은 판인지** 한 줄로 적는다. 타일이 없으니 크기 감이 필요하다. */
      const spanKm = metersBetween(frame.minLat, frame.minLon, frame.minLat, frame.maxLon) / 1000;
      $<HTMLElement>('#pmDots').innerHTML =
        '<svg viewBox="0 0 ' + width + ' ' + height + '" width="100%" style="max-width:' + width + 'px" font-family="system-ui, sans-serif">' +
        '<rect x="0" y="0" width="' + width + '" height="' + height + '" fill="rgba(128,128,128,.06)"/>' + dots +
        '<text x="8" y="' + (height - 8) + '" font-size="11" fill="currentColor" opacity=".6">' + esc(t('photomap.span', { km: spanKm.toFixed(spanKm < 10 ? 1 : 0) })) + '</text>' +
        '</svg>';

      $<HTMLElement>('#pmPlaces').innerHTML = grouped
        .slice(0, 12)
        .map(
          (p) =>
            '<div class="tool-list-row"><span class="tool-list-key">' + p.shots.length + '</span>' +
            '<span class="mono tool-list-val">' + esc(p.lat.toFixed(4) + ', ' + p.lon.toFixed(4)) + '</span>' +
            '<span class="tool-list-dim"><a href="' + esc(mapLink(p.lat, p.lon)) + '" target="_blank" rel="noreferrer noopener">' + esc(t('photomap.openMap')) + '</a></span></div>'
        )
        .join('');

      const byDay = days(shots);
      $<HTMLElement>('#pmDays').innerHTML =
        byDay.days
          .map(
            (d) =>
              '<div class="tool-list-row"><span class="tool-list-key">' + esc(d.day) + '</span>' +
              '<span class="tool-list-val">' + esc(t('photomap.shots', { n: d.shots.length })) + '</span></div>'
          )
          .join('') +
        (byDay.undated.length> 0
          ? '<div class="tool-list-row"><span class="tool-list-key">. </span><span class="tool-list-val">' + esc(t('photomap.undated', { n: byDay.undated.length })) + '</span></div>'
          : '');

      status.textContent = t('photomap.status.ok', { n: shots.length, places: grouped.length, without: noPlace });
    }

    $<HTMLInputElement>('#pmFiles').addEventListener('change', async (): Promise<void> => {
      const files = [...($<HTMLInputElement>('#pmFiles').files ?? [])];
      if (files.length === 0) return;
      status.textContent = t('photomap.status.reading', { n: files.length });
      shots = [];
      noPlace = 0;
      for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const info = read(bytes);
        if (info.gps === undefined) {
          noPlace++;
          continue;
        }
        shots.push({ name: file.name, lat: info.gps.lat, lon: info.gps.lon, at: dateToMs(info.date) });
      }
      render();
    });

    $<HTMLInputElement>('#pmNear').addEventListener('input', render);
  }
})();
