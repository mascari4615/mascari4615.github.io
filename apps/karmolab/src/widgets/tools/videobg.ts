/**
 * 영상 배경 빼기 (흡혈 원장 16 unscreen / TASK-KL-337)
 *
 * 영상 작업대의 할 일 한 칸. 셈은 `lib/ai-cutout`. **14 와 같은 바닥**이다.
 * 프레임을 하나씩 꺼내 오려내고 다시 묶는다. 그뿐이다.
 *
 * ★ 투명 영상 나옵니다라고 안 적는다. 브라우저가 못 만든다.
 * WebM 은 형식상 알파를 담을 수 있지만 `MediaRecorder` 는 알파를 담아 주지 않는다. 그래서
 * 내보내기를 둘로 가른다: **새 바탕 위에 얹은 영상**(바로 올릴 때)과 **투명 PNG 연속**
 * (편집 프로그램으로 가져갈 때). 못 하는 것을 되는 척하면 그게 제일 나쁘다.
 *
 * ★ 담기는 **두 판에 나눠** 한다.
 * 한 프레임에 모델을 한 번 돌리므로 실제 시간보다 훨씬 느리다. 그 속도 그대로 `MediaRecorder`
 * 에 밀어 넣으면 10초짜리가 3분짜리 영상으로 나온다(벽시계로 재기 때문이다).
 * 그래서 ① 다 오려내 모아 두고 ② **제 속도로 다시 틀면서** 담는다. 담는 판은 원래 길이만큼만
 * 걸린다.
 *
 * ★ 소리는 안 담긴다. 재생을 지나가는 게 아니라 장면을 하나씩 찍는 방식이라 소리가 지나갈
 * 자리가 없다. 화면에 그렇게 적는다.
 */
import { attachVideo, download, metaOf, pickRecordType, seekTo } from './shared/video';
import { encode } from './shared/image';
import { escapeHtml as esc } from './shared/text';
import { markLive } from './shared/say';
import { t, loadNamespace } from '../../lib/i18n';
import { AiGate } from '../../lib/ai-gate';
import { loadEngine, webgpuAvailable } from '../../lib/ai-engine';
import { CUTOUT_MODELS, alphaOf, applyAlpha, cutout, planFrames, resampleAlpha, sizeMbFor, type CutoutKind } from '../../lib/ai-cutout';

(function (): void {
  /** 한 판에 오려낼 수 있는 상한. 없으면 3분짜리를 넣고 브라우저를 잃는다. */
  const MAX_FRAMES = 150;
  /** 내보내는 긴 변. 원본 그대로 돌리면 모델이 느린 게 아니라 **메모리가 안 버틴다**. */
  const MAX_W = 480;

  Toolbox.register({
    id: 'videobg',
    title: t('widgets.videobg.title', undefined, '영상 배경 빼기'),
    category: 'ai',
    desc: t(
      'widgets-desc.videobg.desc',
      undefined,
      '짧은 영상에서 사람이나 물체만 남깁니다. 영상이 브라우저를 벗어나지 않습니다'
    ),
    layout: 'wide',
    icon:
      '<rect x="2.5" y="5" width="19" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-dasharray="3 3"/>' +
      '<circle cx="12" cy="10" r="2.2" stroke="currentColor" stroke-width="1.5" fill="none"/>' +
      '<path d="M7.5 16.5c1.2-2.2 7.8-2.2 9 0" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('videobg.tab', undefined, '배경'),
        build: function (container: HTMLElement): void {
          void loadNamespace('videobg').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('videobg.mdd') });
    container.innerHTML = `
      <div class="field-group">
        <label class="field-label" for="vbFile">${esc(t('videobg.label.file'))}</label>
        <input type="file" id="vbFile" name="video" accept="video/*" aria-label="${esc(t('videobg.label.file'))}">
      </div>
      <video id="vbVideo" playsinline muted style="display:none"></video>
      <div class="tool-grid-2">
        <div>
          <div class="tool-sublabel">${esc(t('videobg.label.start'))} <span id="vbStartVal" class="range-value">0.0s</span></div>
          <input type="range" id="vbStart" name="start" aria-label="${esc(t('videobg.label.start'))}" min="0" max="1000" value="0">
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('videobg.label.len'))} <span id="vbLenVal" class="range-value">6s</span></div>
          <input type="range" id="vbLen" name="length" aria-label="${esc(t('videobg.label.len'))}" min="1" max="20" value="6">
        </div>
      </div>
      <div class="tool-grid-2">
        <div>
          <div class="tool-sublabel">${esc(t('videobg.label.fps'))} <span id="vbFpsVal" class="range-value">12</span></div>
          <input type="range" id="vbFps" name="fps" aria-label="${esc(t('videobg.label.fps'))}" min="4" max="24" step="2" value="12">
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('videobg.label.bg'))}</div>
          <div style="display:flex; gap:8px; align-items:center;">
            <input type="color" id="vbColor" name="background" value="#12b886" aria-label="${esc(t('videobg.label.bg'))}"
                   style="width:56px; height:38px; padding:2px; background:var(--bg-secondary); border:1px solid var(--border);">
            <label class="tool-checkline"><input type="checkbox" id="vbKeep" name="keepAlpha"> ${esc(t('videobg.opt.keepAlpha'))}</label>
          </div>
        </div>
      </div>
      <div style="display:flex; gap:10px; margin:10px 0; flex-wrap:wrap; align-items:center;">
        <button class="btn btn-ghost" id="vbTry">${esc(t('videobg.btn.try'))}</button>
        <button class="btn btn-primary" id="vbRun">${esc(t('videobg.btn.run'))}</button>
        <button class="btn btn-ghost" id="vbStop" style="display:none">${esc(t('videobg.btn.stop'))}</button>
        <button class="btn btn-ghost" id="vbSave" style="display:none">${esc(t('videobg.btn.save'))}</button>
      </div>
      <div style="background-image:linear-gradient(45deg,rgba(128,128,128,.25) 25%,transparent 25%,transparent 75%,rgba(128,128,128,.25) 75%),linear-gradient(45deg,rgba(128,128,128,.25) 25%,transparent 25%,transparent 75%,rgba(128,128,128,.25) 75%); background-size:16px 16px; background-position:0 0,8px 8px; border-radius:10px; padding:8px; overflow:auto;">
        <canvas id="vbCanvas" style="max-width:100%; display:block; margin:0 auto;"></canvas>
      </div>
      <div class="tool-status" id="vbStatus">${esc(t('videobg.status.idle'))}</div>
      <p class="tool-hint" id="vbCost"></p>
      <p class="tool-hint tool-note">${esc(t('videobg.note.limits'))}</p>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const video = $<HTMLVideoElement>('#vbVideo');
    const canvas = $<HTMLCanvasElement>('#vbCanvas');
    const status = $<HTMLElement>('#vbStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). 긴 작업이라 더욱. */
    markLive(status);

    let duration = 0;
    let outW = 0;
    let outH = 0;
    /** 오려낸 장면들. **PNG 덩어리로** 들고 있는다. 날 픽셀로 쥐면 백 장에 60MB 가 넘는다. */
    let frames: Blob[] = [];
    /** 취소 깃발. 누른 뒤에도 도구가 멀쩡해야 한다. 안 그러면 아무도 다시 안 누른다. */
    let cancelled = false;
    let working = false;
    let gate: AiGate | null = null;

    const num = (id: string): number => Number($<HTMLInputElement>(id).value);
    const startSec = (): number => (num('#vbStart') / 1000) * Math.max(0, duration);
    const kind = (): CutoutKind => 'person';

    /** 몇 장을 돌리게 되나. **누르기 전에** 숫자로 보여 준다. 셈은 `lib/ai-cutout` (검사됨). */
    function plan(): { count: number; fps: number; len: number } {
      const fps = num('#vbFps');
      const got = planFrames(duration - startSec(), num('#vbLen'), fps, MAX_FRAMES);
      return { count: got.count, fps, len: got.seconds };
    }

    function showCost(): void {
      $<HTMLElement>('#vbStartVal').textContent = `${startSec().toFixed(1)}s`;
      $<HTMLElement>('#vbLenVal').textContent = `${num('#vbLen')}s`;
      $<HTMLElement>('#vbFpsVal').textContent = String(num('#vbFps'));
      if (duration <= 0) return;
      const p = plan();
      const capped = p.count >= MAX_FRAMES;
      $<HTMLElement>('#vbCost').textContent = capped
        ? t('videobg.cost.capped', { n: p.count, sec: p.len.toFixed(1) })
        : t('videobg.cost.plain', { n: p.count });
    }

    container
      .querySelectorAll('input[type="range"]')
      .forEach((el) => el.addEventListener('input', showCost));

    $<HTMLInputElement>('#vbFile').addEventListener('change', (): void => {
      const file = $<HTMLInputElement>('#vbFile').files?.[0];
      if (file === undefined) return;
      status.textContent = t('videobg.status.reading');
      void attachVideo(video, file)
        .then(() => {
          const meta = metaOf(video);
          duration = meta.duration;
          const k = Math.min(1, MAX_W / Math.max(1, meta.width));
          outW = Math.max(2, Math.round(meta.width * k));
          outH = Math.max(2, Math.round(meta.height * k));
          canvas.width = outW;
          canvas.height = outH;
          frames = [];
          $<HTMLButtonElement>('#vbSave').style.display = 'none';
          showCost();
          status.textContent = t('videobg.status.ready', { sec: duration.toFixed(1) });
        })
        .catch(() => {
          status.textContent = t('videobg.status.badVideo');
        });
    });

    /** 그 시각 장면을 캔버스 크기로 한 장. */
    async function plateAt(time: number): Promise<HTMLCanvasElement> {
      await seekTo(video, time);
      const c = document.createElement('canvas');
      c.width = outW;
      c.height = outH;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (ctx === null) throw new Error(t('videobg.err.canvas'));
      ctx.drawImage(video, 0, 0, outW, outH);
      return c;
    }

    /**
     * 한 장을 오려낸다. **색은 원본에서, 모양만 모델에서**. 14 에서 세운 규율 그대로.
     * 돌려주는 것은 투명 PNG 한 덩어리다.
     */
    async function cutFrame(engine: Parameters<typeof cutout>[0], time: number): Promise<Blob> {
      const plate = await plateAt(time);
      const got = await cutout(engine, plate.toDataURL('image/png'), kind(), { webgpu: webgpuAvailable() });
      const alpha = resampleAlpha(alphaOf(got.rgba), got.width, got.height, outW, outH);
      const ctx = plate.getContext('2d', { willReadFrequently: true });
      if (ctx === null) throw new Error(t('videobg.err.canvas'));
      const src = ctx.getImageData(0, 0, outW, outH);
      const out = applyAlpha(src.data, alpha);
      const shown = ctx.createImageData(outW, outH);
      shown.data.set(out);
      ctx.putImageData(shown, 0, 0);
      /* 내보내기는 `shared/image` 를 거친다. 형식별 규칙(JPG 흰 바탕 등)이 거기 한 곳에 있다. */
      return await encode(plate, 'png');
    }

    /** 한 장을 화면에. 바탕을 깔지 말지는 투명 그대로 손잡이가 정한다. */
    async function paint(blob: Blob, transparent: boolean): Promise<void> {
      const bmp = await createImageBitmap(blob);
      const ctx = canvas.getContext('2d');
      if (ctx === null) return;
      ctx.clearRect(0, 0, outW, outH);
      if (!transparent) {
        ctx.fillStyle = $<HTMLInputElement>('#vbColor').value;
        ctx.fillRect(0, 0, outW, outH);
      }
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
    }

    /** 모델을 데려온다. AI 켜기 게이트는 14 와 같은 것을 쓴다. */
    async function withEngine(run: (engine: Parameters<typeof cutout>[0]) => Promise<void>): Promise<boolean> {
      gate ??= new AiGate({
        sizeMb: sizeMbFor(CUTOUT_MODELS[kind()], webgpuAvailable()),
        fetch: async (_onProgress) => {
          const engine = await loadEngine();
          await run(engine);
        },
        onChange: (v) => {
          if (v.state !== 'ready') status.textContent = v.say;
        }
      });
      return await gate.accept();
    }

    $<HTMLButtonElement>('#vbTry').onclick = (): void => {
      if (duration <= 0 || working) return;
      working = true;
      status.textContent = t('videobg.status.trying');
      void withEngine(async (engine) => {
        const blob = await cutFrame(engine, startSec());
        await paint(blob, $<HTMLInputElement>('#vbKeep').checked);
        status.textContent = t('videobg.status.tried');
      }).then(() => {
        working = false;
      });
    };

    $<HTMLButtonElement>('#vbRun').onclick = (): void => {
      if (duration <= 0 || working) return;
      working = true;
      cancelled = false;
      frames = [];
      $<HTMLButtonElement>('#vbStop').style.display = '';
      $<HTMLButtonElement>('#vbSave').style.display = 'none';
      const p = plan();
      void withEngine(async (engine) => {
        for (let i = 0; i < p.count; i++) {
          if (cancelled) break;
          const at = startSec() + i / p.fps;
          const blob = await cutFrame(engine, at);
          frames.push(blob);
          await paint(blob, $<HTMLInputElement>('#vbKeep').checked);
          status.textContent = t('videobg.status.working', { i: i + 1, n: p.count });
        }
        /* 취소는 실패가 아니다. 여태 오려낸 것은 그대로 쓸 수 있게 둔다. */
        status.textContent = cancelled
          ? t('videobg.status.stopped', { n: frames.length })
          : t('videobg.status.done', { n: frames.length });
      }).then(() => {
        working = false;
        $<HTMLButtonElement>('#vbStop').style.display = 'none';
        $<HTMLButtonElement>('#vbSave').style.display = frames.length ? '' : 'none';
      });
    };

    $<HTMLButtonElement>('#vbStop').onclick = (): void => {
      cancelled = true;
      status.textContent = t('videobg.status.stopping');
    };

    /**
     * 내보내기. 투명 그대로면 PNG 연속을 묶어 주고, 아니면 **제 속도로 다시 틀면서** 담는다.
     * 담기가 오려내기와 갈라져 있는 이유가 여기다. 벽시계로 재는 담기에 느린 오려내기를
     * 물리면 길이가 늘어난다.
     */
    $<HTMLButtonElement>('#vbSave').onclick = (): void => {
      if (!frames.length || working) return;
      const fps = plan().fps;
      if ($<HTMLInputElement>('#vbKeep').checked) {
        void saveZip();
        return;
      }
      void saveVideo(fps);
    };

    async function saveZip(): Promise<void> {
      working = true;
      status.textContent = t('videobg.status.zipping');
      try {
        await Toolbox.ensureScript?.('vendor/jszip.min');
        const Z = (window as unknown as { JSZip?: new () => { file: (n: string, b: Blob) => void; generateAsync: (o: unknown) => Promise<Blob> } }).JSZip;
        if (!Z) throw new Error(t('videobg.err.zip'));
        const zip = new Z();
        frames.forEach((b, i) => zip.file(`frame-${String(i).padStart(4, '0')}.png`, b));
        const blob = await zip.generateAsync({ type: 'blob' });
        download(blob, 'no-background-frames.zip');
        status.textContent = t('videobg.status.savedZip', { n: frames.length });
        Toolbox.offerResult?.({ blob, name: 'no-background-frames.zip', from: 'videobg' });
      } catch (_) {
        status.textContent = t('videobg.err.zip');
      } finally {
        working = false;
      }
    }

    async function saveVideo(fps: number): Promise<void> {
      working = true;
      status.textContent = t('videobg.status.recording');
      try {
        const ctx = canvas.getContext('2d');
        if (ctx === null) throw new Error(t('videobg.err.canvas'));
        /* 0 = 내가 밀어 넣을 때만 한 장. 그래야 장 수가 정확히 맞는다. */
        const stream = canvas.captureStream(0);
        const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
        const type = pickRecordType();
        const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
        const chunks: Blob[] = [];
        rec.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        const stopped = new Promise<void>((res) => {
          rec.onstop = () => res();
        });
        rec.start();

        const gap = 1000 / fps;
        for (let i = 0; i < frames.length; i++) {
          const t0 = performance.now();
          await paint(frames[i], false);
          track.requestFrame?.();
          /* **제 속도로** 기다린다. 이 판이 곧 결과 영상의 시간축이다. */
          const rest = gap - (performance.now() - t0);
          if (rest > 0) await new Promise((r) => setTimeout(r, rest));
        }
        rec.stop();
        await stopped;
        const blob = new Blob(chunks, { type: type || 'video/webm' });
        download(blob, 'no-background.webm');
        status.textContent = t('videobg.status.savedVideo', { sec: (frames.length / fps).toFixed(1) });
        Toolbox.offerResult?.({ blob, name: 'no-background.webm', from: 'videobg' });
      } catch (_) {
        status.textContent = t('videobg.err.record');
      } finally {
        working = false;
      }
    }
  }
})();
