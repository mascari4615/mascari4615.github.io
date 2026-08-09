/**
 * 사진 정보 보기·지우기 (TASK-KL-088)
 *
 * 폰으로 찍은 사진에는 **찍은 곳의 좌표**가 들어 있다. 중고 거래 사진 한 장으로 집을 찾아낸
 * 이야기가 흔한 이유다. 그런데 그걸 지우겠다고 사진을 낯선 사이트에 올리는 건 앞뒤가 안 맞는다.
 *
 * 지우는 방식이 중요하다. 캔버스로 다시 그리면 정보는 사라지지만 **화질이 한 번 더 깎인다**.
 * 그래서 JPEG 안의 정보 구획만 잘라 낸다 — 그림 데이터는 한 바이트도 건드리지 않는다.
 *
 * 무엇이 들어 있었는지 먼저 보여 준다. 「지웠다」는 말만으로는 사람이 안심하지 못한다.
 */
import { acceptPastedFiles } from './shared/paste';

import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  interface Info {
    date?: string;
    camera?: string;
    lens?: string;
    gps?: string;
    orientation?: number;
    software?: string;
  }

  /** JPEG 은 0xFFxx 표시로 구획이 나뉜다. 그 구조를 따라 걸으며 정보 구획을 찾는다. */
  function walkSegments(bytes: Uint8Array): Array<{ marker: number; start: number; end: number }> {
    const out: Array<{ marker: number; start: number; end: number }> = [];
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return out; // JPEG 아님
    let i = 2;
    while (i < bytes.length - 1) {
      if (bytes[i] !== 0xff) break;
      const marker = bytes[i + 1];
      // 그림 데이터 시작(SOS) 뒤로는 구획이 아니라 압축 데이터다 — 여기서 멈춘다
      if (marker === 0xda || marker === 0xd9) break;
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      out.push({ marker, start: i, end: i + 2 + len });
      i += 2 + len;
    }
    return out;
  }

  const TAGS: Record<number, keyof Info> = {
    0x0132: 'date', // DateTime
    0x9003: 'date', // DateTimeOriginal (이쪽이 더 정확해 나중에 덮어쓴다)
    0x010f: 'camera', // Make
    0x0110: 'camera', // Model
    0xa434: 'lens',
    0x0112: 'orientation',
    0x0131: 'software'
  };

  /** EXIF 를 읽어 사람이 알아볼 항목만 뽑는다. 전부 해석할 필요는 없다. */
  function readExif(bytes: Uint8Array, seg: { start: number; end: number }): Info {
    const info: Info = {};
    const base = seg.start + 4 + 6; // 표시(2) + 길이(2) + "Exif\0\0"(6)
    if (base + 8 > bytes.length) return info;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // 바이트 순서가 파일마다 다르다 — 여기서 정하지 않으면 숫자가 전부 엉뚱해진다
    const little = view.getUint16(base) === 0x4949;
    const ifdOffset = view.getUint32(base + 4, little);

    const readAscii = (off: number, count: number): string => {
      let s = '';
      for (let i = 0; i < count - 1; i++) s += String.fromCharCode(bytes[off + i]);
      return s.trim();
    };

    const readRational = (off: number): number => {
      const a = view.getUint32(off, little);
      const b = view.getUint32(off + 4, little);
      return b ? a / b : 0;
    };

    const readIfd = (offset: number, gps = false): number => {
      const at = base + offset;
      if (at + 2 > bytes.length) return 0;
      const count = view.getUint16(at, little);
      let exifSub = 0;
      const gpsVals: Record<number, number[]> = {};
      const gpsRefs: Record<number, string> = {};
      for (let i = 0; i < count; i++) {
        const e = at + 2 + i * 12;
        if (e + 12 > bytes.length) break;
        const tag = view.getUint16(e, little);
        const type = view.getUint16(e + 2, little);
        const num = view.getUint32(e + 4, little);
        const sizeOf: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
        const bytesLen = (sizeOf[type] || 1) * num;
        const valOff = bytesLen > 4 ? base + view.getUint32(e + 8, little) : e + 8;

        if (gps) {
          if (type === 5 && (tag === 0x0002 || tag === 0x0004)) {
            gpsVals[tag] = [readRational(valOff), readRational(valOff + 8), readRational(valOff + 16)];
          } else if (type === 2 && (tag === 0x0001 || tag === 0x0003)) {
            gpsRefs[tag] = readAscii(valOff, num);
          }
          continue;
        }

        if (tag === 0x8769) exifSub = view.getUint32(e + 8, little); // Exif SubIFD
        else if (tag === 0x8825) readIfd(view.getUint32(e + 8, little), true); // GPS IFD
        else if (TAGS[tag]) {
          const key = TAGS[tag];
          if (type === 2) {
            const s = readAscii(valOff, num);
            if (!s) continue;
            if (key === 'camera') info.camera = info.camera ? `${info.camera} ${s}`.trim() : s;
            else if (key === 'date') info.date = tag === 0x9003 ? s : info.date || s;
            else info[key] = s as never;
          } else if (type === 3 && key === 'orientation') {
            info.orientation = view.getUint16(valOff, little);
          }
        }
      }

      if (gps && gpsVals[0x0002] && gpsVals[0x0004]) {
        const dms = (v: number[]): number => v[0] + v[1] / 60 + v[2] / 3600;
        const lat = dms(gpsVals[0x0002]) * (gpsRefs[0x0001] === 'S' ? -1 : 1);
        const lon = dms(gpsVals[0x0004]) * (gpsRefs[0x0003] === 'W' ? -1 : 1);
        info.gps = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
      }
      return exifSub;
    };

    const sub = readIfd(ifdOffset);
    if (sub) readIfd(sub);
    return info;
  }

  /** 정보 구획(APP1/APP13 등)만 빼고 다시 잇는다 — 그림 데이터는 그대로다. */
  function strip(bytes: Uint8Array): Uint8Array {
    const segs = walkSegments(bytes);
    // 지울 것: Exif(APP1) · Photoshop(APP13) · 주석(COM). APP0(JFIF)는 두어야 열리는 프로그램이 있다.
    const drop = segs.filter((s) => s.marker === 0xe1 || s.marker === 0xed || s.marker === 0xfe);
    if (!drop.length) return bytes;
    const keep: Array<[number, number]> = [];
    let cur = 0;
    for (const d of drop.sort((a, b) => a.start - b.start)) {
      keep.push([cur, d.start]);
      cur = d.end;
    }
    keep.push([cur, bytes.length]);
    const size = keep.reduce((a, [s, e]) => a + (e - s), 0);
    const out = new Uint8Array(size);
    let off = 0;
    for (const [s, e] of keep) {
      out.set(bytes.subarray(s, e), off);
      off += e - s;
    }
    return out;
  }

  const size = (n: number): string =>
    n >= 1048576 ? `${(n / 1048576).toFixed(2)}MB` : n >= 1024 ? `${(n / 1024).toFixed(0)}KB` : `${n}B`;

  Toolbox.register({
    id: 'exifclean',
    // 다른 도구가 만든 그림을 그대로 받는다 (TASK-KL-133)
    accepts: ['image/jpeg'],
    title: t('widgets.exifclean.title', undefined, '사진 정보 지우기'),
    category: 'tool',
    desc: t(
      'widgets-desc.exifclean.desc',
      undefined,
      '사진에 든 위치·카메라 정보를 보여 주고 지웁니다. 화질을 건드리지 않고, 사진이 브라우저를 벗어나지 않습니다'
    ),
    layout: 'wide',
    icon: '<rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 6l1.5-2h5L16 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M18.5 4.5 5.5 21" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('exifclean.tab', undefined, '정보 지우기'),
        build: function (container: HTMLElement): void {
          void loadNamespace('exifclean').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에. */
  function draw(container: HTMLElement): void {
          /* 번역 글에 꺾쇠·따옴표가 들어와도 화면이 안 깨지게 — 그리기 **전**에 있어야 한다. */
          const esc = (v: string): string =>
            v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          container.innerHTML = `
            <div class="tool-drop" id="exDrop">
              <input type="file" id="exFile" accept="image/jpeg" hidden>
              ${esc(t('exifclean.drop'))}
            </div>

            <div id="exEditor" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-list" id="exList"></div>
              <div class="cc-stats" id="exStats"></div>

              <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
                <button class="btn btn-primary" id="exRun">${esc(t('exifclean.btn.run'))}</button>
              </div>
            </div>

            <div class="tool-status" id="exStatus">${esc(t('exifclean.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#exDrop');
          const fileInput = $<HTMLInputElement>('#exFile');
          const editor = $<HTMLElement>('#exEditor');
          const listEl = $<HTMLElement>('#exList');
          const stats = $<HTMLElement>('#exStats');
          const status = $<HTMLElement>('#exStatus');

          let fileName = '';
          let raw: Uint8Array | null = null;

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          /* 방향 이름은 **찾을 때** 정한다 — 표를 만들 때 정하면 열쇠가 굳는다. */
          const orientName = (n: number): string => t(`exifclean.orient.${n}`);

          async function load(f: File): Promise<void> {
            fileName = f.name;
            raw = new Uint8Array(await f.arrayBuffer());
            if (raw[0] !== 0xff || raw[1] !== 0xd8) {
              say(t('exifclean.err.jpgOnly'), 'error');
              editor.style.display = 'none';
              return;
            }
            editor.style.display = '';

            const segs = walkSegments(raw);
            const exifSeg = segs.find((s) => s.marker === 0xe1);
            const info = exifSeg ? readExif(raw, exifSeg) : {};
            const rows: Array<[string, string]> = [];
            if (info.gps) rows.push([t('exifclean.row.gps'), t('exifclean.row.gpsNote', { v: info.gps })]);
            if (info.date) rows.push([t('exifclean.row.date'), info.date]);
            if (info.camera) rows.push([t('exifclean.row.camera'), info.camera]);
            if (info.lens) rows.push([t('exifclean.row.lens'), info.lens]);
            if (info.software) rows.push([t('exifclean.row.software'), info.software]);
            if (info.orientation)
              rows.push([t('exifclean.row.orientation'), orientName(info.orientation) || String(info.orientation)]);

            listEl.innerHTML = rows.length
              ? rows
                  .map(
                    ([k, v]) =>
                      `<div class="tool-list-row"><span class="tool-list-key">${esc(k)}</span><span class="tool-list-val">${esc(v)}</span></div>`
                  )
                  .join('')
              : `<div class="tool-list-row"><span class="tool-list-val">${esc(t('exifclean.none'))}</span></div>`;

            const cleaned = strip(raw);
            stats.innerHTML =
              stat(t('exifclean.stat.before'), size(raw.length), true) +
              stat(t('exifclean.stat.after'), size(cleaned.length)) +
              stat(t('exifclean.stat.gps'), t(info.gps ? 'exifclean.value.has' : 'exifclean.value.none'));

            if (info.gps) say(t('exifclean.say.gps'), 'error');
            else if (rows.length) say(t('exifclean.say.someInfo'), 'ok');
            else say(t('exifclean.say.clean'), 'ok');
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) void load(fileInput.files[0]);
          };

          /* 옆 도구가 방금 만든 그림이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133).
           * 한 번만 집어 간다 — 두 번 집으면 같은 것이 다시 들어와 방금 한 일을 덮는다. */
          {
              Toolbox.onHandoff?.('exifclean', (f: File) => void load(f));
          }
          drop.addEventListener('dragover', (e) => {
            e.preventDefault();
            drop.classList.add('over');
          });
          drop.addEventListener('dragleave', () => drop.classList.remove('over'));
          drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('over');
            const f = e.dataTransfer?.files?.[0];
            if (f) void load(f);
          });
          // 화면 캡처를 바로 붙여넣는 것이 가장 잦은 쓰임이다
          acceptPastedFiles(container, (files) => { void load(files[0]); });

          $<HTMLButtonElement>('#exRun').onclick = () => {
            if (!raw) return;
            const cleaned = strip(raw);
            const blob = new Blob([cleaned as unknown as BlobPart], { type: 'image/jpeg' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = fileName.replace(/\.[^.]+$/, '') + t('exifclean.file.suffix') + '.jpg';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            say(`정보를 지워 받았어요 (${size(raw.length)} → ${size(cleaned.length)}). 그림 자체는 그대로입니다.`, 'ok');
            // 이어서 할 일을 그 자리에 띄운다 (TASK-KL-133) — 받을 도구가 없으면 안 생긴다.
            Toolbox.offerNext?.(status, { blob: blob, name: a.download, from: 'exifclean' });
            Toolbox.trackUse?.('strip');
          };
  }
})();
