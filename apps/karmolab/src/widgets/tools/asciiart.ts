/**
 * 이미지·영상 → 아스키 아트 (TASK-KL-088 / 영상 = TASK-KL-244)
 *
 * 캔버스로 축소 → 픽셀 밝기를 글자 농도에 매핑. 두 가지가 결과를 좌우한다:
 *  1) 글자는 세로로 길다 — 가로:세로 비를 보정하지 않으면 그림이 위아래로 늘어난다 (CHAR_ASPECT)
 *  2) 밝기 = 단순 평균이 아니라 시감 가중(0.299/0.587/0.114). 평균을 쓰면 초록이 지나치게 밝게 잡힌다
 *
 * 영상을 넣으면 `badapple` 묶음으로 넘어간다 — 거기에 이미 「영상 → 격자 → 한 파일 → 재생」이
 * 다 있고, 여기서 다시 짜면 두 벌이 된다. 이 도구가 더하는 것은 **계조와 색**이다(평면 확장).
 * 굽는 것도 트는 것도 브라우저 안에서만 돈다 — 영상은 아무 데도 안 올라간다.
 *
 * 영상 미리보기가 `<pre>` 가 아니라 캔버스인 이유: 색을 켜면 칸마다 `<span>` 이 필요한데
 * 100×40 이면 4천 개다. 그걸 매 프레임 새로 만들면 브라우저가 못 따라온다. 캔버스는 같은
 * 색이 이어지는 동안 붓을 안 바꾸므로 실제로 색이 몇 개 안 되는 아스키 그림에 잘 맞는다.
 */
import { AsciiSurface, decode, encode, Player, sampleVideo, type AsciiFrame } from 'badapple';

import { acceptPastedFiles } from './shared/paste';

import { t, loadNamespace, locale } from '../../lib/i18n';

(function (): void {
  /** 이미 있는 GIF 인코더(`tools/gifenc`)를 그대로 쓴다 — 두 벌 짜지 않는다. */
  interface GifApi {
    encodeAsync: (o: {
      width: number;
      height: number;
      frames: Array<{ data: Uint8ClampedArray; delayMs: number }>;
      maxColors?: number;
      dither?: boolean;
      onProgress?: (ratio: number) => void;
    }) => Promise<Blob>;
  }

  /** 진한 → 옅은 순. 폭이 넓을수록 계조가 부드럽다. */
  const RAMPS: Record<string, string> = {
    detail: '@%#*+=-:. ',
    block: '█▓▒░ ',
    simple: '#+-. ',
    binary: '#. ',
    braille: '⣿⣷⣯⣟⡿⢿⣻⣽⣾⠿⠟⠏⠆⠄ '
  };
  /** 고정폭 글자 한 칸의 가로/세로 비 — 이 값으로 세로 샘플 수를 줄인다 */
  const CHAR_ASPECT = 0.5;

  /**
   * 위 램프는 **진한 것부터**인데 `AsciiSurface` 규약은 **어두운 것부터**다. 뒤집어 넘긴다.
   * 안 뒤집어도 그림은 그럴듯하게 나오고 밝고 어두움만 반대가 된다 — 그래서 눈으로는
   * 한참 못 잡는다. 변환을 한 군데로 몰아 둔다.
   */
  const toDarkFirst = (ramp: string): string => [...ramp].reverse().join('');

  /**
   * 글자판 + 칸 색 → 터미널이 색으로 읽는 글 (24비트 ANSI).
   *
   * 왜 넣나: 이 그림의 원래 자리는 터미널이다. `.txt` 로 내보내면 색이 통째로 사라지고,
   * HTML 로 내보내면 터미널에서는 태그가 그대로 보인다. 둘 다 「글자로 그린 그림」을
   * 원래 자리에 못 갖다 놓는다.
   *
   * 줄 끝마다 초기화(`\u001b[0m`)를 넣는다 — 안 넣으면 마지막 칸 색이 그 뒤 셸 프롬프트까지
   * 물들인다. 색이 안 바뀌는 동안은 코드를 다시 안 적어서, 대개 원본보다 짧다.
   */
  function toAnsi(text: string, cols: number, colors: Int32Array | null): string {
    const lines = text.split(String.fromCharCode(10));
    if (!colors) return text;
    const out: string[] = [];
    for (let y = 0; y < lines.length; y++) {
      const line = lines[y] ?? '';
      let painted = '';
      let brush = -1;
      for (let x = 0; x < line.length; x++) {
        const tone = colors[y * cols + x] ?? 0;
        if (tone !== brush) {
          brush = tone;
          painted += `\u001b[38;2;${(tone >> 16) & 255};${(tone >> 8) & 255};${tone & 255}m`;
        }
        painted += line[x];
      }
      out.push(`${painted}\u001b[0m`);
    }
    return out.join(String.fromCharCode(10));
  }

  Toolbox.register({
    id: 'asciiart',
    title: t('widgets.asciiart.title', undefined, '이미지 → 아스키 아트'),
    category: 'tool',
    desc: t(
      'widgets-desc.asciiart.desc',
      undefined,
      '사진이나 그림을 글자로 그린 아스키 아트로 바꿉니다. 폭·문자 세트·반전 조절'
    ),
    layout: 'wide',
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 9h3M6 12h6M6 15h4M14 9h4M15 12h3M13 15h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('asciiart.tab', undefined, '아스키 아트'),
        build: function (container: HTMLElement): void {
          void loadNamespace('asciiart').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에. */
  function draw(container: HTMLElement): void {
          const esc = (v: string): string =>
            v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          Mdd.linePreset('tool_run', { msg: t('asciiart.mdd') });
          container.innerHTML = `
            <div class="field-group">
              <div id="aaDrop" class="tool-drop">
                <input type="file" id="aaFile" accept="image/*,video/*" style="display:none;">
                <div>${esc(t('asciiart.drop'))} <button class="btn btn-ghost" id="aaPick" type="button">${esc(
                  t('asciiart.btn.pick')
                )}</button> ${esc(t('asciiart.drop.paste'))}</div>
                <div class="tool-status" id="aaName">${esc(t('asciiart.name.empty'))}</div>
              </div>
            </div>

            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('asciiart.label.width'))} <span id="aaWidthVal" class="range-value">${esc(
                    t('asciiart.value.chars', { n: 100 })
                  )}</span></div>
                  <input type="range" id="aaWidth" aria-label="${esc(t('asciiart.label.width'))}" min="20" max="300" step="2" value="100">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('asciiart.label.ramp'))}</div>
                  <select id="aaRamp" aria-label="${esc(t('asciiart.label.ramp'))}">
                    <option value="detail">${esc(t('asciiart.ramp.detail'))}</option>
                    <option value="block">${esc(t('asciiart.ramp.block'))}</option>
                    <option value="simple">${esc(t('asciiart.ramp.simple'))}</option>
                    <option value="binary">${esc(t('asciiart.ramp.binary'))}</option>
                    <option value="braille">${esc(t('asciiart.ramp.braille'))}</option>
                  </select>
                </div>
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">${esc(t('asciiart.label.bright'))} <span id="aaBrightVal" class="range-value">0</span></div>
                  <input type="range" id="aaBright" aria-label="${esc(t('asciiart.label.bright'))}" min="-100" max="100" value="0">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('asciiart.label.contrast'))} <span id="aaContrastVal" class="range-value">0</span></div>
                  <input type="range" id="aaContrast" aria-label="${esc(t('asciiart.label.contrast'))}" min="-100" max="100" value="0">
                </div>
              </div>
              <div style="display:flex; gap:14px; margin-top:10px; flex-wrap:wrap;">
                <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                  <input type="checkbox" id="aaInvert" style="width:auto;"> ${esc(t('asciiart.opt.invert'))}
                </label>
                <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                  <input type="checkbox" id="aaColor" style="width:auto;"> ${esc(t('asciiart.opt.color'))}
                </label>
              </div>
            </div>

            <div class="field-group" id="aaVideoBox" hidden>
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('asciiart.label.fps'))} <span id="aaFpsVal" class="range-value">12</span></div>
                  <input type="range" id="aaFps" aria-label="${esc(t('asciiart.label.fps'))}" min="4" max="30" step="1" value="12">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('asciiart.label.span'))} <span id="aaSpanVal" class="range-value">10s</span></div>
                  <input type="range" id="aaSpan" aria-label="${esc(t('asciiart.label.span'))}" min="1" max="60" step="1" value="10">
                </div>
              </div>
              <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-top:10px;">
                <button class="btn btn-primary" id="aaBake">${esc(t('asciiart.btn.bake'))}</button>
                <button class="btn btn-secondary" id="aaPlay" disabled>${esc(t('asciiart.btn.play'))}</button>
                <input type="range" id="aaSeek" aria-label="${esc(t('asciiart.label.seek'))}" min="0" max="0" value="0" style="flex:1; min-width:140px;" disabled>
              </div>
            </div>

            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:var(--space-md);">
              <button class="btn btn-primary" id="aaCopy">${esc(t('asciiart.btn.copy'))}</button>
              <button class="btn btn-secondary" id="aaTxt">${esc(t('asciiart.btn.txt'))}</button>
              <button class="btn btn-secondary" id="aaPng">${esc(t('asciiart.btn.png'))}</button>
              <button class="btn btn-secondary" id="aaAnsi">${esc(t('asciiart.btn.ansi'))}</button>
              <button class="btn btn-secondary" id="aaGif" hidden>${esc(t('asciiart.btn.gif'))}</button>
              <button class="btn btn-ghost" id="aaBab" hidden>${esc(t('asciiart.btn.bab'))}</button>
              <button class="btn btn-ghost" id="aaSample">${esc(t('asciiart.btn.sample'))}</button>
            </div>

            <pre id="aaOut" class="aa-out">${esc(t('asciiart.out.empty'))}</pre>
            <canvas id="aaCanvas" class="aa-canvas" hidden></canvas>
            <div class="tool-status" id="aaStatus">${esc(t('asciiart.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#aaDrop');
          const fileInput = $<HTMLInputElement>('#aaFile');
          const nameEl = $<HTMLElement>('#aaName');
          const out = $<HTMLElement>('#aaOut');
          const status = $<HTMLElement>('#aaStatus');
          const widthInput = $<HTMLInputElement>('#aaWidth');
          const stageCanvas = $<HTMLCanvasElement>('#aaCanvas');
          const videoBox = $<HTMLElement>('#aaVideoBox');
          const bakeBtn = $<HTMLButtonElement>('#aaBake');
          const playBtn = $<HTMLButtonElement>('#aaPlay');
          const seek = $<HTMLInputElement>('#aaSeek');
          const gifBtn = $<HTMLButtonElement>('#aaGif');
          const babBtn = $<HTMLButtonElement>('#aaBab');
          let image: HTMLImageElement | null = null;
          let plainText = '';
          /** 지금 화면에 있는 그림의 칸 색 — ANSI 로 낼 때 쓴다. 색을 안 켰으면 `null`. */
          let cellColors: Int32Array | null = null;

          // ── 영상 ─────────────────────────────────────────────────────────
          /** 고른 영상. 아직 안 구웠어도 여기 들어 있다. */
          let video: HTMLVideoElement | null = null;
          let player: Player | null = null;
          let raf = 0;
          let clipFrames = 0;
          /** 마지막으로 그려진 한 장 — 복사·저장은 「지금 화면」을 낸다. */
          let current: AsciiFrame | null = null;
          let baking = false;
          /** 구운 클립의 초당 장수 — 재생 위치를 장 번호로 바꿀 때 쓴다. */
          let clipFps = 12;

          const isVideoMode = (): boolean => video !== null;

          /**
           * 아스키 한 장을 캔버스에 찍는다. 같은 색이 이어지는 동안 붓을 안 바꾼다 —
           * 붓 교체가 글자 찍기보다 훨씬 비싸서, 이 한 줄이 색을 켠 재생을 살린다.
           */
          function paintCanvas(frame: AsciiFrame): void {
            const size = Math.max(6, Math.min(16, Math.floor(1100 / Math.max(1, frame.cols))));
            const charWidth = size * 0.6;
            const lineHeight = size;
            const width = Math.ceil(frame.cols * charWidth);
            const height = frame.rows * lineHeight;
            if (stageCanvas.width !== width || stageCanvas.height !== height) {
              stageCanvas.width = width;
              stageCanvas.height = height;
            }
            const ctx = stageCanvas.getContext('2d');
            if (!ctx) return;
            const invert = $<HTMLInputElement>('#aaInvert').checked;
            ctx.fillStyle = invert ? '#fff' : '#0b0d12';
            ctx.fillRect(0, 0, width, height);
            ctx.font = `${size}px ui-monospace, monospace`;
            ctx.textBaseline = 'top';

            const lines = frame.text.split(String.fromCharCode(10));
            if (!frame.colors) {
              ctx.fillStyle = invert ? '#0b0d12' : '#e8ecf4';
              lines.forEach((line, y) => ctx.fillText(line, 0, y * lineHeight));
              return;
            }
            let brush = -1;
            for (let y = 0; y < lines.length; y++) {
              const line = lines[y] ?? '';
              for (let x = 0; x < line.length; x++) {
                const color = frame.colors[y * frame.cols + x] ?? 0;
                if (color !== brush) {
                  brush = color;
                  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
                }
                ctx.fillText(line[x] ?? ' ', x * charWidth, y * lineHeight);
              }
            }
          }

          /** 구운 클립을 재생기에 걸고 화면을 영상 모드로 바꾼다. */
          function mount(bytes: Uint8Array): void {
            stopLoop();
            player?.dispose();
            const clip = decode(bytes);
            clipFrames = clip.frameCount;
            clipFps = clip.fps;
            player = new Player(clip, { loop: true });
            const cols = parseInt(widthInput.value, 10);
            const rows = Math.max(1, Math.round((cols * clip.height) / clip.width));
            player.stage.add(
              new AsciiSurface({
                cols,
                rows,
                ramp: toDarkFirst(RAMPS[$<HTMLSelectElement>('#aaRamp').value] || RAMPS.detail),
                color: $<HTMLInputElement>('#aaColor').checked,
                write: (frame) => {
                  current = frame;
                  plainText = frame.text;
                  cellColors = frame.colors;
                  paintCanvas(frame);
                }
              })
            );
            out.hidden = true;
            stageCanvas.hidden = false;
            seek.max = String(Math.max(0, clip.frameCount - 1));
            seek.value = '0';
            seek.disabled = false;
            playBtn.disabled = false;
            gifBtn.hidden = false;
            babBtn.hidden = false;
            // 첫 장을 바로 보여 준다 — 굽고 나서 검은 화면이면 실패한 줄 안다.
            player.seek(0, performance.now());
            player.play(performance.now());
            startLoop();
            status.textContent = t('asciiart.status.baked', {
              cols,
              rows,
              frames: clip.frameCount,
              fps: clip.fps,
              kb: Math.max(1, Math.round(bytes.length / 1024)).toLocaleString(locale())
            });
            status.className = 'tool-status ok';
          }

          function startLoop(): void {
            if (raf) return;
            const tick = (now: number): void => {
              raf = requestAnimationFrame(tick);
              if (!player) return;
              if (player.tick(now)) seek.value = String(Math.min(clipFrames - 1, Math.floor(player.positionSec * clipFps)));
            };
            raf = requestAnimationFrame(tick);
            playBtn.textContent = t('asciiart.btn.pause');
          }

          function stopLoop(): void {
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
            playBtn.textContent = t('asciiart.btn.play');
          }

          /** 영상 → 격자 → 한 파일. 오래 걸리므로 진행 상황을 그대로 적는다. */
          async function bake(): Promise<void> {
            if (!video || baking) return;
            baking = true;
            bakeBtn.disabled = true;
            const cols = parseInt(widthInput.value, 10);
            const rows = Math.max(1, Math.round((cols * video.videoHeight) / Math.max(1, video.videoWidth) * CHAR_ASPECT));
            const fps = parseInt($<HTMLInputElement>('#aaFps').value, 10);
            const span = parseInt($<HTMLInputElement>('#aaSpan').value, 10);
            try {
              const sampled = await sampleVideo(video, {
                width: cols,
                height: rows,
                fps,
                endSec: span,
                invert: $<HTMLInputElement>('#aaInvert').checked,
                levels: true,
                colors: $<HTMLInputElement>('#aaColor').checked,
                onProgress: (done, total) => {
                  status.textContent = t('asciiart.status.baking', { done, total });
                  status.className = 'tool-status';
                }
              });
              const bytes = encode(
                sampled.frames,
                { width: sampled.width, height: sampled.height, fps: sampled.fps },
                { levels: sampled.levels, colors: sampled.colors }
              );
              baked = bytes;
              Toolbox.trackUse?.('convert');
              mount(bytes);
            } catch {
              status.textContent = t('asciiart.err.bake');
              status.className = 'tool-status err';
            } finally {
              baking = false;
              bakeBtn.disabled = false;
            }
          }

          /** 마지막으로 구운 파일 — `.bab` 저장에 쓴다. */
          let baked: Uint8Array | null = null;

          /**
           * 재생이 켜지면 이 도구도 **자기 문자 세트로** 한 조각을 그린다 (TASK-KL-131).
           *
           * 재생기가 도는지 여기서는 모른다 — 신고만 해 두면 창구가 알아서 붙였다 뗀다.
           * 이미지를 넣어 쓰는 중이면 `null` 을 답해 빠진다: 남의 작업물을 덮으면 안 된다.
           */
          const idlePlaceholder = out.textContent ?? '';
          const stopDrawing = window.KarmoLabBadApple?.add({
            measure: () => {
              if (image || isVideoMode()) return null; // 쓰는 중 — 이번 판은 빠진다
              const cols = Math.max(20, Math.min(160, parseInt(widthInput.value, 10) || 100));
              return { cols, rows: Math.max(8, Math.round(cols * CHAR_ASPECT * 0.75)) };
            },
            paint: (p) => {
              const ramp = RAMPS[$<HTMLSelectElement>('#aaRamp').value] || RAMPS.detail;
              const on = ramp[0] ?? '#';
              const off = ramp[ramp.length - 1] ?? ' ';
              const lines: string[] = [];
              for (let y = 0; y < p.rows; y++) {
                let line = '';
                for (let x = 0; x < p.cols; x++) line += p.at(x, y) ? on : off;
                lines.push(line);
              }
              out.textContent = lines.join('\n');
            },
            restore: () => {
              if (!image) out.textContent = idlePlaceholder;
            }
          });
          Toolbox.onDispose?.(() => {
            stopDrawing?.();
            // 화면 갱신 고리와 영상 주소는 위젯이 사라져도 안 죽는다 — 직접 걷는다.
            resetVideo();
          });

          function render(): void {
            if (!image) return;
            const cols = parseInt(widthInput.value, 10);
            const ramp = RAMPS[$<HTMLSelectElement>('#aaRamp').value] || RAMPS.detail;
            const invert = $<HTMLInputElement>('#aaInvert').checked;
            const colorize = $<HTMLInputElement>('#aaColor').checked;
            const bright = parseInt($<HTMLInputElement>('#aaBright').value, 10);
            const contrast = parseInt($<HTMLInputElement>('#aaContrast').value, 10);
            const rows = Math.max(1, Math.round((cols * image.naturalHeight) / image.naturalWidth * CHAR_ASPECT));

            const canvas = document.createElement('canvas');
            canvas.width = cols;
            canvas.height = rows;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;
            ctx.drawImage(image, 0, 0, cols, rows);
            const data = ctx.getImageData(0, 0, cols, rows).data;

            // 대비 계수 — 표준 대비 곡선
            const c = (259 * (contrast + 255)) / (255 * (259 - contrast));
            const lines: string[] = [];
            const colorLines: string[] = [];
            // 색을 켰을 때만 칸 색을 들고 있는다 — ANSI 로 낼 때 쓴다.
            const tones = colorize ? new Int32Array(cols * rows) : null;

            for (let y = 0; y < rows; y++) {
              let line = '';
              let colorLine = '';
              for (let x = 0; x < cols; x++) {
                const i = (y * cols + x) * 4;
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const a = data[i + 3] / 255;
                // 투명한 곳은 공백 (배경으로 남긴다)
                let lum = (0.299 * r + 0.587 * g + 0.114 * b) * a + 255 * (1 - a);
                lum = c * (lum - 128) + 128 + bright;
                lum = Math.max(0, Math.min(255, lum));
                const norm = invert ? 255 - lum : lum;
                const idx = Math.min(ramp.length - 1, Math.floor((norm / 256) * ramp.length));
                const ch = ramp[idx];
                line += ch;
                if (tones) tones[y * cols + x] = (r << 16) | (g << 8) | b;
                if (colorize) {
                  const esc = ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '&' ? '&amp;' : ch;
                  colorLine += `<span style="color:rgb(${r},${g},${b})">${esc}</span>`;
                }
              }
              lines.push(line);
              if (colorize) colorLines.push(colorLine);
            }

            plainText = lines.join('\n');
            cellColors = tones;
            if (colorize) {
              out.innerHTML = colorLines.join('\n');
            } else {
              out.textContent = plainText;
            }
            status.textContent = t('asciiart.status.done', {
              cols,
              rows,
              chars: plainText.length.toLocaleString(locale())
            });
            status.className = 'tool-status ok';
          }

          function load(src: string, label: string): void {
            const img = new Image();
            img.onload = () => {
              image = img;
              nameEl.textContent = `${label} · ${img.naturalWidth}×${img.naturalHeight}`;
              Toolbox.trackUse?.('convert');
              render();
            };
            img.onerror = () => {
              nameEl.textContent = t('asciiart.err.read');
            };
            img.src = src;
          }

          function loadFile(file: File): void {
            if (file.type.startsWith('video/')) {
              loadVideo(file);
              return;
            }
            if (!file.type.startsWith('image/')) {
              nameEl.textContent = t('asciiart.err.notMedia');
              return;
            }
            resetVideo();
            const reader = new FileReader();
            reader.onload = () => load(String(reader.result), file.name);
            reader.readAsDataURL(file);
          }

          /** 영상 모드에서 이미지로 돌아올 때 — 틀어 놓은 것과 캔버스를 걷는다. */
          function resetVideo(): void {
            stopLoop();
            player?.dispose();
            player = null;
            current = null;
            cellColors = null;
            baked = null;
            if (video) URL.revokeObjectURL(video.src);
            video = null;
            videoBox.hidden = true;
            stageCanvas.hidden = true;
            out.hidden = false;
            seek.disabled = true;
            playBtn.disabled = true;
            gifBtn.hidden = true;
            babBtn.hidden = true;
          }

          /**
           * 영상은 파일을 통째로 글자로 바꾸지 않고 **주소만** 만들어 건다 —
           * 몇십 MB 짜리를 base64 로 펴면 그 자리에서 탭이 죽는다.
           */
          function loadVideo(file: File): void {
            resetVideo();
            image = null;
            const element = document.createElement('video');
            element.muted = true;
            element.playsInline = true;
            element.preload = 'auto';
            element.src = URL.createObjectURL(file);
            element.addEventListener('loadedmetadata', () => {
              video = element;
              videoBox.hidden = false;
              const seconds = Number.isFinite(element.duration) ? element.duration : 0;
              const span = $<HTMLInputElement>('#aaSpan');
              // 구간 상한을 영상 길이에 맞춘다 — 없는 뒤쪽을 굽겠다고 하면 빈 장이 나온다.
              span.max = String(Math.max(1, Math.ceil(seconds)));
              span.value = String(Math.max(1, Math.min(10, Math.floor(seconds) || 1)));
              $<HTMLElement>('#aaSpanVal').textContent = t('asciiart.value.seconds', { n: span.value });
              nameEl.textContent = t('asciiart.name.video', {
                name: file.name,
                w: element.videoWidth,
                h: element.videoHeight,
                sec: seconds.toFixed(1)
              });
              out.textContent = t('asciiart.out.bakeFirst');
              status.textContent = t('asciiart.status.videoIdle');
              status.className = 'tool-status';
            });
            element.addEventListener('error', () => {
              nameEl.textContent = t('asciiart.err.video');
            });
          }

          $<HTMLButtonElement>('#aaPick').onclick = () => fileInput.click();
          fileInput.addEventListener('change', () => {
            const f = fileInput.files && fileInput.files[0];
            if (f) loadFile(f);
          });
          drop.addEventListener('dragover', (e) => {
            e.preventDefault();
            drop.classList.add('over');
          });
          drop.addEventListener('dragleave', () => drop.classList.remove('over'));
          drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('over');
            const f = e.dataTransfer?.files?.[0];
            if (f) loadFile(f);
          });
          // 파일을 바로 붙여넣는 것이 잦다
          acceptPastedFiles(container, (files) => { loadFile(files[0]); }, (f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
          document.addEventListener('paste', (e) => {
            const page = container.closest('.tool-page');
            if (page && !page.classList.contains('active')) return;
            const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
            const f = item?.getAsFile();
            if (f) loadFile(f);
          });

          container.querySelectorAll('input[type="range"], select, input[type="checkbox"]').forEach((el) => {
            el.addEventListener('input', () => {
              $<HTMLElement>('#aaWidthVal').textContent = t('asciiart.value.chars', { n: widthInput.value });
              $<HTMLElement>('#aaBrightVal').textContent = $<HTMLInputElement>('#aaBright').value;
              $<HTMLElement>('#aaContrastVal').textContent = $<HTMLInputElement>('#aaContrast').value;
              $<HTMLElement>('#aaFpsVal').textContent = $<HTMLInputElement>('#aaFps').value;
              $<HTMLElement>('#aaSpanVal').textContent = t('asciiart.value.seconds', { n: $<HTMLInputElement>('#aaSpan').value });
              // 이미 구운 게 있으면 글자 수·램프·색은 **다시 굽지 않고** 표면만 갈아 끼우면 된다.
              // 초당 장수·구간은 파일 자체를 바꾸므로 그때만 다시 굽는다.
              if (baked) mount(baked);
              render();
            });
            el.addEventListener('change', render);
          });

          bakeBtn.onclick = () => void bake();
          playBtn.onclick = () => {
            if (!player) return;
            if (raf) {
              player.pause(performance.now());
              stopLoop();
            } else {
              player.play(performance.now());
              startLoop();
            }
          };
          seek.addEventListener('input', () => {
            if (!player) return;
            player.seek(parseInt(seek.value, 10) / Math.max(1, clipFps), performance.now());
            // 멈춰 있어도 그 자리 한 장은 보여 준다 — 안 그러면 끌어도 화면이 안 변한다.
            const wasStopped = raf === 0;
            if (wasStopped) {
              player.play(performance.now());
              player.tick(performance.now());
              player.pause(performance.now());
            }
          });

          $<HTMLButtonElement>('#aaCopy').onclick = async () => {
            if (!plainText) return;
            await Toolbox.copyText?.(plainText, { message: t('asciiart.copy.done') });
          };
          $<HTMLButtonElement>('#aaTxt').onclick = () => {
            if (!plainText) return;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([plainText], { type: 'text/plain;charset=utf-8' }));
            a.download = 'ascii-art.txt';
            Toolbox.trackUse?.('save-txt');
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          };
          $<HTMLButtonElement>('#aaPng').onclick = () => {
            if (isVideoMode()) {
              if (!current) return;
              const a = document.createElement('a');
              a.href = stageCanvas.toDataURL('image/png');
              a.download = 'ascii-frame.png';
              Toolbox.trackUse?.('save-png');
              a.click();
              return;
            }
            if (!plainText) return;
            const lines = plainText.split('\n');
            const fontSize = 10;
            const lineHeight = fontSize;
            const charWidth = fontSize * 0.6;
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(lines[0].length * charWidth) + 20;
            canvas.height = lines.length * lineHeight + 20;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const invert = $<HTMLInputElement>('#aaInvert').checked;
            ctx.fillStyle = invert ? '#000' : '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = invert ? '#fff' : '#000';
            ctx.font = `${fontSize}px monospace`;
            ctx.textBaseline = 'top';
            lines.forEach((line, i) => ctx.fillText(line, 10, 10 + i * lineHeight));
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = 'ascii-art.png';
            Toolbox.trackUse?.('save-png');
            a.click();
          };
          function save(blob: Blob, name: string): void {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = name;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          }

          $<HTMLButtonElement>('#aaAnsi').onclick = async () => {
            if (!plainText) return;
            const cols = current ? current.cols : parseInt(widthInput.value, 10);
            const text = toAnsi(plainText, cols, cellColors);
            Toolbox.trackUse?.('copy-ansi');
            await Toolbox.copyText?.(text, {
              message: cellColors ? t('asciiart.copy.ansi') : t('asciiart.copy.ansiPlain')
            });
          };

          babBtn.onclick = () => {
            if (!baked) return;
            Toolbox.trackUse?.('save-bab');
            save(new Blob([baked.slice().buffer as ArrayBuffer], { type: 'application/octet-stream' }), 'ascii-video.bab');
          };

          /**
           * 구운 것을 GIF 한 장으로. **글자판을 다시 그리지 않고** 재생기를 한 장씩 몰아
           * 화면에 나오는 그림 그대로를 걷는다 — 화면과 저장물이 어긋날 자리를 안 만든다.
           */
          gifBtn.onclick = async () => {
            const gif = (window as unknown as { KarmoGif?: GifApi }).KarmoGif;
            if (!player || !gif || clipFrames <= 0) {
              status.textContent = t('asciiart.err.gif');
              status.className = 'tool-status err';
              return;
            }
            const wasPlaying = raf !== 0;
            stopLoop();
            gifBtn.disabled = true;
            try {
              const ctx = stageCanvas.getContext('2d');
              if (!ctx) throw new Error('no ctx');
              const delayMs = Math.round(1000 / Math.max(1, clipFps));
              const frames: Array<{ data: Uint8ClampedArray; delayMs: number }> = [];
              const now = performance.now();
              for (let i = 0; i < clipFrames; i++) {
                player.seek(i / Math.max(1, clipFps), now);
                player.play(now);
                player.tick(now);
                player.pause(now);
                frames.push({ data: ctx.getImageData(0, 0, stageCanvas.width, stageCanvas.height).data, delayMs });
                if (i % 8 === 7) {
                  status.textContent = t('asciiart.status.gifFrames', { done: i + 1, total: clipFrames });
                  await new Promise((r) => setTimeout(r, 0));
                }
              }
              const blob = await gif.encodeAsync({
                width: stageCanvas.width,
                height: stageCanvas.height,
                frames,
                onProgress: (ratio) => {
                  status.textContent = t('asciiart.status.gifPacking', { pct: Math.round(ratio * 100) });
                }
              });
              save(blob, 'ascii-video.gif');
              Toolbox.trackUse?.('save-gif');
              status.textContent = t('asciiart.status.gifDone', {
                kb: Math.max(1, Math.round(blob.size / 1024)).toLocaleString(locale())
              });
              status.className = 'tool-status ok';
            } catch {
              status.textContent = t('asciiart.err.gif');
              status.className = 'tool-status err';
            } finally {
              gifBtn.disabled = false;
              if (wasPlaying && player) {
                player.play(performance.now());
                startLoop();
              }
            }
          };

          $<HTMLButtonElement>('#aaSample').onclick = () => {
            resetVideo();
            // 외부 요청 0 — 캔버스로 그린 도형을 샘플로 쓴다.
            const c = document.createElement('canvas');
            c.width = 240;
            c.height = 240;
            const g = c.getContext('2d');
            if (!g) return;
            g.fillStyle = '#ffffff';
            g.fillRect(0, 0, 240, 240);
            const grad = g.createRadialGradient(100, 90, 10, 120, 120, 130);
            grad.addColorStop(0, '#ffe08a');
            grad.addColorStop(1, '#1a1a2e');
            g.fillStyle = grad;
            g.beginPath();
            g.arc(120, 120, 90, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = '#12151c';
            g.beginPath();
            g.moveTo(20, 240);
            g.lineTo(110, 110);
            g.lineTo(200, 240);
            g.closePath();
            g.fill();
            load(c.toDataURL('image/png'), t('asciiart.sample.name'));
          };
  }
})();
