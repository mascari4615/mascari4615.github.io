/**
 * QR 코드 읽기 (TASK-KL-088)
 *
 * 화면에 뜬 QR 은 폰으로 찍을 수 없다. 캡처해 두고 「이거 뭐지」 하고 남는데, 읽어 보겠다고
 * 낯선 사이트에 올리는 건 곤란하다 — QR 에는 초대 링크·와이파이 비밀번호·계좌가 들어 있다.
 *
 * 두 갈래를 둔다: **그림 파일**(캡처·사진)과 **카메라**(눈앞의 QR).
 * 읽은 뒤에는 그냥 글자만 보여 주지 않고 **무엇인지 알려 준다** — 주소면 어디로 가는지,
 * 와이파이면 어느 망인지. QR 은 눈으로 확인할 수 없어서 그대로 누르면 위험하다.
 *
 * 해독은 브라우저에 그 기능이 있으면 그걸 쓰고(내려받을 것이 없다), 없을 때만 해독기를 받는다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  interface Detector {
    detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
  }
  interface JsQr {
    (data: Uint8ClampedArray, w: number, h: number): { data: string } | null;
  }

  /** 읽은 값이 무엇인지 알아본다 — 그대로 누르기 전에 사람이 판단할 수 있게. */
  function explain(text: string): Array<[string, string]> {
    const rows: Array<[string, string]> = [];
    const wifi = text.match(/^WIFI:(.*);;?$/i);
    if (wifi) {
      const parts: Record<string, string> = {};
      for (const seg of wifi[1].split(';')) {
        const i = seg.indexOf(':');
        if (i > 0) parts[seg.slice(0, i).toUpperCase()] = seg.slice(i + 1);
      }
      rows.push([t('qrread.kind'), t('qrread.kind.wifi')]);
      if (parts.S) rows.push([t('qrread.wifi.ssid'), parts.S]);
      if (parts.T) rows.push([t('qrread.wifi.security'), parts.T]);
      if (parts.P) rows.push([t('qrread.wifi.password'), parts.P]);
      return rows;
    }
    if (/^BEGIN:VCARD/i.test(text)) {
      rows.push([t('qrread.kind'), t('qrread.kind.contact')]);
      const name = text.match(/\nFN:(.*)/i);
      const tel = text.match(/\nTEL[^:]*:(.*)/i);
      if (name) rows.push([t('qrread.contact.name'), name[1].trim()]);
      if (tel) rows.push([t('qrread.contact.tel'), tel[1].trim()]);
      return rows;
    }
    if (/^(https?:)?\/\//i.test(text) || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(text)) {
      try {
        const u = new URL(/^https?:/i.test(text) ? text : 'https://' + text);
        rows.push([t('qrread.kind'), t('qrread.kind.url')]);
        rows.push([t('qrread.url.goesTo'), u.hostname]);
        if (u.protocol !== 'https:') rows.push([t('qrread.url.warnLabel'), t('qrread.url.warnHttp')]);
        return rows;
      } catch {
        /* 주소처럼 보였지만 아니었다 */
      }
    }
    if (/^mailto:/i.test(text)) return [[t('qrread.kind'), t('qrread.kind.mail')], [t('qrread.mail.to'), text.slice(7)]];
    if (/^tel:/i.test(text)) return [[t('qrread.kind'), t('qrread.kind.tel')], [t('qrread.tel.number'), text.slice(4)]];
    rows.push([t('qrread.kind'), t('qrread.kind.text')]);
    return rows;
  }

  Toolbox.register({
    id: 'qrread',
    /* 도구 큰제목이 이 값을 쓴다 — 목록의 이름 표는 여기까지 못 미친다(실측: 영어 장의
       큰제목만 한국어로 남았다). 등록 순간이라 기다릴 수 없어 원본을 기본값으로 함께 준다. */
    title: t('widgets.qrread.title', undefined, 'QR 코드 읽기'),
    category: 'tool',
    desc: '그림이나 카메라로 QR 을 읽고, 그 안에 무엇이 들었는지 알려 줍니다. 어디에도 올리지 않습니다',
    layout: 'wide',
    icon: '<rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M14 14h3v3h-3zM18 18h3v3h-3z" fill="currentColor"/>',
    tabs: [
      {
        id: 'app',
        /* 등록 순간에 쓰이는 유일한 글 — 기다릴 자리가 없어 원본을 기본값으로 함께 준다. */
        label: t('qrread.tab', undefined, 'QR 읽기'),
        /* 도구의 *자기 화면* 은 스크립트가 그린다 — 그래서 이 글은 찍을 때가 아니라 **여기서**
           갈아 끼워야 한다. 그 언어 장에는 이 묶음이 머리말에 미리 박혀 있어 기다림이 0 이고,
           앱 안(해시 주소)에서 열면 그때 한 번 받아온다. 받아온 **뒤에** 그리는 이유는
           안 기다리고 그리면 화면에 열쇠 이름이 그대로 뜨기 때문이다. */
        build: function (container: HTMLElement): void {
          void loadNamespace('qrread').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
          const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          container.innerHTML = `
            <div class="tool-drop" id="qrDrop">
              <input type="file" id="qrFile" accept="image/*" hidden>
              ${esc(t('qrread.drop'))}
            </div>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-ghost" id="qrCam">${esc(t('qrread.btn.camera'))}</button>
              <button class="btn btn-ghost" id="qrStop" style="display:none;">${esc(t('qrread.btn.cameraOff'))}</button>
            </div>

            <video id="qrVideo" playsinline muted style="display:none; width:100%; max-height:320px; background:#000; border-radius:8px;"></video>

            <div class="tool-list" id="qrInfo"></div>

            <div class="field-group" id="qrResultWrap" style="display:none;">
              <label class="field-label" for="qrOut">${esc(t('qrread.out.label'))}</label>
              <textarea id="qrOut" rows="4" spellcheck="false" style="width:100%;"></textarea>
              <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
                <button class="btn btn-ghost btn-sm" id="qrCopy">${esc(t('qrread.btn.copy'))}</button>
                <a class="btn btn-ghost btn-sm" id="qrOpen" target="_blank" rel="noopener noreferrer" style="display:none;">${esc(t('qrread.btn.open'))}</a>
              </div>
            </div>

            <div class="tool-status" id="qrStatus">${esc(t('qrread.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#qrDrop');
          const fileInput = $<HTMLInputElement>('#qrFile');
          const video = $<HTMLVideoElement>('#qrVideo');
          const infoEl = $<HTMLElement>('#qrInfo');
          const outEl = $<HTMLTextAreaElement>('#qrOut');
          const status = $<HTMLElement>('#qrStatus');
          const camBtn = $<HTMLButtonElement>('#qrCam');
          const stopBtn = $<HTMLButtonElement>('#qrStop');

          let detector: Detector | null = null;
          let jsqr: JsQr | null = null;
          let stream: MediaStream | null = null;
          let scanning = 0;

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };

          /** 브라우저에 읽는 기능이 있으면 그걸 쓴다 — 그러면 내려받을 것이 없다. */
          async function reader(): Promise<(cv: HTMLCanvasElement) => Promise<string | null>> {
            const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
            if (BD) {
              if (!detector) detector = new BD({ formats: ['qr_code'] });
              return async (cv) => {
                const found = await (detector as Detector).detect(cv);
                return found.length ? found[0].rawValue : null;
              };
            }
            if (!jsqr) {
              say(t('qrread.status.loadingDecoder'));
              await Toolbox.ensureScript?.('vendor/jsqr.min');
              jsqr = (window as unknown as { jsQR?: JsQr }).jsQR || null;
              if (!jsqr) throw new Error(t('qrread.error.decoderFailed'));
            }
            return async (cv) => {
              const ctx = cv.getContext('2d', { willReadFrequently: true });
              if (!ctx) return null;
              const img = ctx.getImageData(0, 0, cv.width, cv.height);
              const hit = (jsqr as JsQr)(img.data, cv.width, cv.height);
              return hit ? hit.data : null;
            };
          }

          function show(text: string): void {
            outEl.value = text;
            $<HTMLElement>('#qrResultWrap').style.display = '';
            const rows = explain(text);
            infoEl.innerHTML = rows
              .map(
                ([k, v]) =>
                  `<div class="tool-list-row"><span class="tool-list-key">${esc(k)}</span><span class="tool-list-val" style="word-break:break-all;">${esc(v)}</span></div>`
              )
              .join('');
            const link = $<HTMLAnchorElement>('#qrOpen');
            const isUrl = rows.some(([k]) => k === t('qrread.url.goesTo'));
            link.style.display = isUrl ? '' : 'none';
            if (isUrl) link.href = /^https?:/i.test(text) ? text : 'https://' + text;
            say(t('qrread.status.read'), 'ok');
            Toolbox.trackUse?.('read');
          }

          async function fromImage(src: Blob): Promise<void> {
            const read = await reader();
            const bitmap = await createImageBitmap(src);
            const cv = document.createElement('canvas');
            // 너무 작으면 못 읽고 너무 크면 느리다 — 적당한 크기로 맞춘다
            const scale = Math.min(1600 / Math.max(bitmap.width, bitmap.height), 1);
            cv.width = Math.round(bitmap.width * Math.max(scale, 0.2));
            cv.height = Math.round(bitmap.height * Math.max(scale, 0.2));
            const ctx = cv.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;
            ctx.drawImage(bitmap, 0, 0, cv.width, cv.height);
            const text = await read(cv);
            if (!text) {
              say(t('qrread.status.notFound'), 'error');
              return;
            }
            show(text);
          }

          async function startCam(): Promise<void> {
            const read = await reader();
            try {
              stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            } catch {
              say(t('qrread.status.noCamera'), 'error');
              return;
            }
            video.srcObject = stream;
            video.style.display = '';
            camBtn.style.display = 'none';
            stopBtn.style.display = '';
            await video.play();
            say(t('qrread.status.pointCamera'));

            const cv = document.createElement('canvas');
            const tick = async (): Promise<void> => {
              if (!stream) return;
              if (video.videoWidth) {
                cv.width = video.videoWidth;
                cv.height = video.videoHeight;
                const ctx = cv.getContext('2d', { willReadFrequently: true });
                ctx?.drawImage(video, 0, 0);
                const text = await read(cv);
                if (text) {
                  stopCam();
                  show(text);
                  return;
                }
              }
              scanning = window.setTimeout(() => void tick(), 250);
            };
            void tick();
          }

          function stopCam(): void {
            window.clearTimeout(scanning);
            stream?.getTracks().forEach((t) => t.stop());
            stream = null;
            video.style.display = 'none';
            camBtn.style.display = '';
            stopBtn.style.display = 'none';
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) void fromImage(fileInput.files[0]).catch((e: Error) => say(t('qrread.status.readError', { message: e.message }), 'error'));
          };
          drop.addEventListener('dragover', (e) => {
            e.preventDefault();
            drop.classList.add('over');
          });
          drop.addEventListener('dragleave', () => drop.classList.remove('over'));
          drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('over');
            const f = e.dataTransfer?.files?.[0];
            if (f) void fromImage(f).catch((err: Error) => say(t('qrread.status.readError', { message: err.message }), 'error'));
          });
          // 캡처를 그대로 붙여 넣는 게 가장 잦은 쓰임이다
          container.addEventListener('paste', (e) => {
            const item = Array.from((e as ClipboardEvent).clipboardData?.items || []).find((i) => i.type.startsWith('image/'));
            const f = item?.getAsFile();
            if (f) void fromImage(f).catch((err: Error) => say(t('qrread.status.readError', { message: err.message }), 'error'));
          });

          camBtn.onclick = () => void startCam().catch((e: Error) => say(t('qrread.status.cameraError', { message: e.message }), 'error'));
          stopBtn.onclick = () => {
            stopCam();
            say(t('qrread.status.cameraOff'));
          };
          $<HTMLButtonElement>('#qrCopy').onclick = () => {
            void Toolbox.copyText?.(outEl.value, { message: t('qrread.copied') });
          };
  }
})();
