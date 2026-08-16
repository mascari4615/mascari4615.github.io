/**
 * 닮은 사진 찾기 (TASK-KL-316 / 30)
 *
 * 여러 장을 한꺼번에 받아 **모양으로** 묶는다. 셈은 `core/dupphoto`.
 * 파일을 여럿 받고 그림으로 보여 줘야 해서 **새 위젯**이다(로그 보기·번들 지도와 같은 이유).
 *
 * 지우지 않는다 — 브라우저는 남의 폴더를 못 지우고, 지우는 건 되돌릴 수 없다.
 * 「어느 것을 남기면 되는지」와 「지우면 얼마나 줄어드는지」만 말하고, 목록을 복사해 준다.
 */
import { dHash, group, toGray, totalSaved, type Photo } from '../../core/dupphoto';
import { escapeHtml as esc } from './shared/text';
import { markLive } from './shared/say';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {

  const human = (bytes: number): string =>
    bytes < 1024 ? bytes + ' B' : bytes < 1024 * 1024 ? (bytes / 1024).toFixed(0) + ' KB' : (bytes / 1024 / 1024).toFixed(1) + ' MB';

  Toolbox.register({
    id: 'dupphoto',
    title: t('widgets.dupphoto.title', undefined, '닮은 사진 찾기'),
    category: 'tool',
    desc: t(
      'widgets-desc.dupphoto.desc',
      undefined,
      '사진을 여러 장 넣으면 닮은 것끼리 묶어 어느 것을 남기면 되는지 알려 줍니다. 사진이 브라우저를 벗어나지 않습니다'
    ),
    layout: 'wide',
    icon: '<rect x="3" y="3" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: t('dupphoto.tab', undefined, '닮은 사진'),
        build: function (container: HTMLElement): void {
          void loadNamespace('dupphoto').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('dupphoto.mdd') });
    container.innerHTML = `
      <div style="display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap; margin-bottom:10px;">
        <div>
          <label class="field-label" for="dpFiles">${esc(t('dupphoto.label.files'))}</label>
          <input type="file" id="dpFiles" name="photos" accept="image/*" multiple aria-label="${esc(t('dupphoto.label.files'))}">
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('dupphoto.label.strict'))} <span id="dpStrictVal" class="range-value">6</span></div>
          <input type="range" id="dpStrict" name="threshold" aria-label="${esc(t('dupphoto.label.strict'))}" min="0" max="16" value="6" style="width:200px;">
        </div>
        <button class="btn btn-ghost" id="dpCopy">${esc(t('dupphoto.btn.copy'))}</button>
      </div>
      <div id="dpGroups"></div>
      <div class="tool-status" id="dpStatus">${esc(t('dupphoto.status.idle'))}</div>
      <p class="tool-hint">${esc(t('dupphoto.note.noDelete'))}</p>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const status = $<HTMLElement>('#dpStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    const thumbs = new Map<string, string>();
    let photos: Photo[] = [];

    /** 한 장을 9×8 로 줄여 지문을 낸다. 미리보기용 작은 그림도 같이 만든다. */
    async function readOne(file: File): Promise<Photo | undefined> {
      const url = URL.createObjectURL(file);
      try {
        const image = await new Promise<HTMLImageElement | undefined>((resolve) => {
          const el = new Image();
          el.onload = (): void => resolve(el);
          el.onerror = (): void => resolve(undefined);
          el.src = url;
        });
        if (image === undefined) return undefined;

        const tiny = document.createElement('canvas');
        tiny.width = 9;
        tiny.height = 8;
        const tctx = tiny.getContext('2d', { willReadFrequently: true });
        if (tctx === null) return undefined;
        tctx.drawImage(image, 0, 0, 9, 8);
        const gray = toGray(tctx.getImageData(0, 0, 9, 8).data, 72);

        const thumb = document.createElement('canvas');
        const scale = Math.min(1, 120 / Math.max(image.width, image.height));
        thumb.width = Math.max(1, Math.round(image.width * scale));
        thumb.height = Math.max(1, Math.round(image.height * scale));
        thumb.getContext('2d')?.drawImage(image, 0, 0, thumb.width, thumb.height);
        thumbs.set(file.name, thumb.toDataURL('image/jpeg', 0.7));

        return { name: file.name, size: file.size, pixels: image.width * image.height, hash: dHash(gray) };
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    function render(): void {
      const threshold = Number($<HTMLInputElement>('#dpStrict').value);
      $<HTMLElement>('#dpStrictVal').textContent = String(threshold);
      if (photos.length === 0) {
        $<HTMLElement>('#dpGroups').innerHTML = '';
        status.textContent = t('dupphoto.status.idle');
        return;
      }
      const groups = group(photos, threshold);
      if (groups.length === 0) {
        $<HTMLElement>('#dpGroups').innerHTML = '';
        status.textContent = t('dupphoto.status.none', { n: photos.length });
        return;
      }
      const card = (photo: Photo, keep: boolean): string =>
        '<figure style="margin:0; text-align:center; opacity:' + (keep ? '1' : '.65') + ';">' +
        '<img src="' + esc(thumbs.get(photo.name) ?? '') + '" alt="' + esc(photo.name) + '" style="max-width:120px; border-radius:8px; border:2px solid ' + (keep ? 'var(--accent-success, #2e7d32)' : 'transparent') + ';">' +
        '<figcaption style="font-size:11px; margin-top:4px;">' + esc(photo.name) + '<br><span style="opacity:.6">' + esc(human(photo.size)) + '</span>' +
        (keep ? '<br><b style="color:var(--accent-success, #2e7d32)">' + esc(t('dupphoto.keep')) + '</b>' : '') +
        '</figcaption></figure>';

      $<HTMLElement>('#dpGroups').innerHTML = groups
        .map(
          (g) =>
            '<div style="border:1px solid rgba(128,128,128,.24); border-radius:10px; padding:10px; margin-bottom:10px;">' +
            '<div class="tool-sublabel">' + esc(t('dupphoto.group', { n: g.others.length + 1, saved: human(g.saved) })) + '</div>' +
            '<div style="display:flex; gap:10px; flex-wrap:wrap;">' + card(g.keep, true) + g.others.map((p) => card(p, false)).join('') + '</div></div>'
        )
        .join('');
      status.textContent = t('dupphoto.status.found', { groups: groups.length, saved: human(totalSaved(groups)) });
    }

    $<HTMLInputElement>('#dpFiles').addEventListener('change', async (): Promise<void> => {
      const files = [...($<HTMLInputElement>('#dpFiles').files ?? [])];
      if (files.length === 0) return;
      status.textContent = t('dupphoto.status.reading', { n: files.length });
      photos = [];
      for (const file of files) {
        const photo = await readOne(file);
        if (photo !== undefined) photos.push(photo);
      }
      render();
    });

    $<HTMLInputElement>('#dpStrict').addEventListener('input', render);

    $<HTMLButtonElement>('#dpCopy').onclick = async (): Promise<void> => {
      const groups = group(photos, Number($<HTMLInputElement>('#dpStrict').value));
      if (groups.length === 0) return;
      /* 지우는 건 사람이 한다 — 지울 이름만 줄줄이 준다(파일 관리자에 붙여 찾기 쉽게). */
      const lines = groups.flatMap((g) => g.others.map((p) => p.name));
      await Toolbox.copyText?.(lines.join('\n'), { message: t('dupphoto.copied', { n: lines.length }) });
    };
  }
})();
