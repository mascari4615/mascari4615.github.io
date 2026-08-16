/**
 * 인쇄해서 쓰는 종이 (TASK-KL-316 / 35)
 *
 * 「PDF」 작업대의 **만들기** 칸(들고 온 파일이 없어도 된다). 자리 셈은 `core/printkit`.
 * 화면에는 SVG 로 그대로 보여 주고, 저장은 PDF 로 한다 — 둘 다 **같은 mm 자리**를 쓰기 때문에
 * 「화면에선 맞는데 인쇄하면 어긋나는」 일이 안 생긴다.
 */
import { calendar, dots, grid, labels, manuscript, staff, type Sheet } from '../../core/printkit';
import { escapeHtml as esc } from './shared/text';
import { loadPdfLib, pdfBlob } from './shared/pdf';
import { markLive } from './shared/say';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {

  const MM_TO_PT = 72 / 25.4;

  Toolbox.register({
    id: 'printkit',
    title: t('widgets.printkit.title', undefined, '인쇄용 종이'),
    category: 'tool',
    desc: t(
      'widgets-desc.printkit.desc',
      undefined,
      '모눈·점모눈·원고지·오선지·달력·라벨을 PDF 로 만듭니다. mm 로 그려 어느 프린터에서도 자리가 맞습니다'
    ),
    layout: 'wide',
    icon: '<rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.3" opacity=".8"/>',
    tabs: [
      {
        id: 'app',
        label: t('printkit.tab', undefined, '종이'),
        build: function (container: HTMLElement): void {
          void loadNamespace('printkit').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('printkit.mdd') });
    const now = new Date();
    container.innerHTML = `
      <div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; margin-bottom:10px;">
        <div>
          <label class="field-label" for="prKind">${esc(t('printkit.label.kind'))}</label>
          <select id="prKind" name="kind" aria-label="${esc(t('printkit.label.kind'))}">
            <option value="grid">${esc(t('printkit.kind.grid'))}</option>
            <option value="dots">${esc(t('printkit.kind.dots'))}</option>
            <option value="manuscript">${esc(t('printkit.kind.manuscript'))}</option>
            <option value="staff">${esc(t('printkit.kind.staff'))}</option>
            <option value="calendar">${esc(t('printkit.kind.calendar'))}</option>
            <option value="label">${esc(t('printkit.kind.label'))}</option>
          </select>
        </div>
        <div>
          <label class="field-label" for="prPaper">${esc(t('printkit.label.paper'))}</label>
          <select id="prPaper" name="paper" aria-label="${esc(t('printkit.label.paper'))}">
            <option value="a4">A4</option>
            <option value="a5">A5</option>
            <option value="b5">B5</option>
            <option value="letter">Letter</option>
          </select>
        </div>
        <div id="prSizeBox">
          <div class="tool-sublabel">${esc(t('printkit.label.size'))} <span id="prSizeVal" class="range-value">5 mm</span></div>
          <input type="range" id="prSize" name="size" aria-label="${esc(t('printkit.label.size'))}" min="2" max="20" value="5" style="width:180px;">
        </div>
        <div id="prMonthBox" style="display:none;">
          <label class="field-label" for="prMonth">${esc(t('printkit.label.month'))}</label>
          <input type="month" id="prMonth" name="month" aria-label="${esc(t('printkit.label.month'))}" value="${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}">
        </div>
        <div id="prLabelBox" style="display:none;">
          <label class="field-label" for="prLabel">${esc(t('printkit.label.labelKind'))}</label>
          <select id="prLabel" name="label" aria-label="${esc(t('printkit.label.labelKind'))}">
            <option value="24">24 (63.5×33.9)</option>
            <option value="21">21 (63.5×38.1)</option>
            <option value="12">12 (63.5×72)</option>
            <option value="65">65 (38.1×21.2)</option>
          </select>
        </div>
        <button class="btn btn-primary" id="prPdf">${esc(t('printkit.btn.pdf'))}</button>
      </div>
      <div id="prPreview" style="overflow:auto; background:rgba(128,128,128,.06); border-radius:10px; padding:10px;"></div>
      <div class="tool-status" id="prStatus">${esc(t('printkit.status.idle'))}</div>
      <p class="tool-hint">${esc(t('printkit.note.margin'))}</p>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const status = $<HTMLElement>('#prStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    let sheet: Sheet | undefined;

    function build(): Sheet {
      const kind = $<HTMLSelectElement>('#prKind').value;
      const paper = $<HTMLSelectElement>('#prPaper').value as Parameters<typeof grid>[0];
      const size = Number($<HTMLInputElement>('#prSize').value);
      if (kind === 'dots') return dots(paper, size);
      if (kind === 'manuscript') return manuscript(paper);
      if (kind === 'staff') return staff(paper);
      if (kind === 'label') return labels($<HTMLSelectElement>('#prLabel').value);
      if (kind === 'calendar') {
        const [year, month] = $<HTMLInputElement>('#prMonth').value.split('-').map(Number);
        return calendar(year, month, paper);
      }
      return grid(paper, size);
    }

    function render(): void {
      const kind = $<HTMLSelectElement>('#prKind').value;
      $<HTMLElement>('#prSizeBox').style.display = kind === 'grid' || kind === 'dots' ? '' : 'none';
      $<HTMLElement>('#prMonthBox').style.display = kind === 'calendar' ? '' : 'none';
      $<HTMLElement>('#prLabelBox').style.display = kind === 'label' ? '' : 'none';
      $<HTMLElement>('#prSizeVal').textContent = $<HTMLInputElement>('#prSize').value + ' mm';

      sheet = build();
      const weekdays = [t('printkit.weekday.sun'), t('printkit.weekday.mon'), t('printkit.weekday.tue'), t('printkit.weekday.wed'), t('printkit.weekday.thu'), t('printkit.weekday.fri'), t('printkit.weekday.sat')];
      const parts: string[] = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + sheet.widthMm + ' ' + sheet.heightMm + '" width="100%" style="max-width:520px; background:#fff; display:block; margin:0 auto;" font-family="system-ui, sans-serif">'
      ];
      for (const line of sheet.lines) {
        parts.push(
          '<line x1="' + line.x1 + '" y1="' + line.y1 + '" x2="' + line.x2 + '" y2="' + line.y2 +
            '" stroke="' + (line.faint === true ? 'rgba(0,0,0,.22)' : 'rgba(0,0,0,.55)') + '" stroke-width="' + (line.weight ?? 0.18) + '"/>'
        );
      }
      for (const box of sheet.boxes) {
        parts.push('<rect x="' + box.x + '" y="' + box.y + '" width="' + box.w + '" height="' + box.h + '" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="0.2"/>');
      }
      for (const label of sheet.labels) {
        const text = label.text.startsWith('#weekday') ? weekdays[Number(label.text.slice(8))] : label.text;
        parts.push('<text x="' + label.x + '" y="' + label.y + '" font-size="' + label.size + '" fill="#111"' + (label.text.startsWith('#weekday') ? ' text-anchor="middle"' : '') + '>' + esc(text) + '</text>');
      }
      parts.push('</svg>');
      $<HTMLElement>('#prPreview').innerHTML = parts.join('');
      status.textContent = t('printkit.status.ok', { w: Math.round(sheet.widthMm), h: Math.round(sheet.heightMm) });
    }

    container.querySelectorAll('select, input').forEach((el) => el.addEventListener('input', render));

    $<HTMLButtonElement>('#prPdf').onclick = async (): Promise<void> => {
      if (sheet === undefined) return;
      status.textContent = t('printkit.status.making');
      try {
        const library = await loadPdfLib();
        if (library === null) throw new Error(t('printkit.err.pdfLib'));
        const doc = await library.PDFDocument.create();
        const page = doc.addPage([sheet.widthMm * MM_TO_PT, sheet.heightMm * MM_TO_PT]);
        const flip = (y: number): number => (sheet as Sheet).heightMm * MM_TO_PT - y * MM_TO_PT;
        for (const line of sheet.lines) {
          page.drawLine({
            start: { x: line.x1 * MM_TO_PT, y: flip(line.y1) },
            end: { x: line.x2 * MM_TO_PT, y: flip(line.y2) },
            thickness: (line.weight ?? 0.18) * MM_TO_PT,
            opacity: line.faint === true ? 0.35 : 0.7
          });
        }
        for (const box of sheet.boxes) {
          page.drawRectangle({
            x: box.x * MM_TO_PT,
            y: flip(box.y + box.h),
            width: box.w * MM_TO_PT,
            height: box.h * MM_TO_PT,
            borderWidth: 0.2 * MM_TO_PT,
            borderOpacity: 0.6,
            opacity: 0
          });
        }
        /* 글자는 숫자·영문만 넣는다 — 한글을 넣으려면 글꼴을 통째로 심어야 하고, 그건 파일이 커진다.
           요일 이름은 화면에서만 말로 보여 주고, PDF 에는 첫 글자만 넣는다. */
        for (const label of sheet.labels) {
          const text = label.text.startsWith('#weekday') ? 'SMTWTFS'[Number(label.text.slice(8))] : label.text;
          page.drawText(text, { x: label.x * MM_TO_PT, y: flip(label.y), size: label.size * MM_TO_PT });
        }
        const blob = pdfBlob(await doc.save());
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = sheet.what + '.pdf';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        status.textContent = t('printkit.status.saved');
        Toolbox.offerResult?.({ blob, name: sheet.what + '.pdf', from: 'printkit' });
      } catch (e) {
        status.textContent = String((e as Error).message);
      }
    };

    render();
  }
})();
