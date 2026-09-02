/**
 * 화면 영역 지켜보기
 *
 * - 화면 한 곳을 골라 두고, 그 자리가 **기준 모습과 같아지거나 달라지면** 소리로 알림
 * - 남은 초 모드: 그 자리의 숫자를 읽어 N초 이하로 내려오면 알림 (tesseract, 동일 출처 vendor)
 * - 쓰임: 빌드 진행 막대, 내려받기 완료, 대시보드 숫자 변화처럼 눈으로 지키기 아까운 자리
 * - 입력: 브라우저 화면 공유(`getDisplayMedia`). 화면 녹화와 같은 길
 * - 프레임은 **이 탭 안에서만** 비교, 외부 전송 0. 기준 그림과 영역은 localStorage
 * - 판정 로직은 `shared/regionwatch-core.ts`. 화면 없이 `scripts/test-regionwatch.mjs` 가 실행
 * - 덮어 둔 탭: `MediaStreamTrackProcessor` 프레임 스트림, 시계 없음. 없는 브라우저는 워커 시계
 * - 떠 있는 창(Document Picture-in-Picture): 상태 판을 다른 창 위에
 * - 시험용 신호: `regionwatch:fire`, `regionwatch:read` CustomEvent (window)
 */
import { escapeHtml as esc } from './shared/text';
import { statusLine } from './shared/say';
import { audioCtx } from './shared/media';
import { t, loadNamespace } from '../../lib/i18n';
import {
  type Rect,
  type Mode,
  type EdgeState,
  type CountState,
  similarity,
  smallSize,
  decideEdge,
  decideCount,
  parseSeconds,
  binarize
} from './shared/regionwatch-core';

type Sound = 'ping' | 'double' | 'chime';

interface Slot {
  name: string;
  enabled: boolean;
  rect: Rect | null;
  /** 기준 그림. 작게 줄인 픽셀 */
  ref: Uint8ClampedArray | null;
  /** 보여 주는 용 작은 그림 */
  thumb: string;
  mode: Mode;
  /** 0.5 ~ 0.99 */
  threshold: number;
  /** 남은 초 모드: 이 값 이하가 되면 */
  lead: number;
  sound: Sound;
  /** 다시 무장까지 초 */
  rearm: number;
  randomDelay: boolean;
}

interface Saved {
  sw: number;
  sh: number;
  volume: number;
  notify: boolean;
  slots: Array<Omit<Slot, 'ref'> & { ref: string | null }>;
}

/* 브라우저 전용 API. lib.dom 에 아직 없는 것만 여기서 좁게 선언 */
interface VideoFrameLike {
  close(): void;
  displayWidth: number;
  displayHeight: number;
}
interface TrackProcessorLike {
  readable: ReadableStream<VideoFrameLike>;
}
interface PipWindowLike extends Window {
  document: Document;
}
interface DocPipLike {
  requestWindow(o: { width: number; height: number }): Promise<PipWindowLike>;
}
interface OcrWorker {
  setParameters(p: Record<string, string>): Promise<unknown>;
  recognize(img: HTMLCanvasElement): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
}
interface TesseractLike {
  createWorker(lang: string, oem: number, opts: Record<string, unknown>): Promise<OcrWorker>;
}

(function (): void {
  const SLOTS = 6;
  const CHECK_MS = 250;
  const READ_MS = 1000;
  const STORE = 'regionwatch.v1';
  const MAX_DELAY_MS = 3000;
  const VENDOR = '/apps/karmolab/js/vendor/tesseract/';

  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

  function newSlot(i: number): Slot {
    return {
      name: t('regionwatch.slot.default', undefined, '자리') + ' ' + (i + 1),
      enabled: true,
      rect: null,
      ref: null,
      thumb: '',
      mode: 'match',
      threshold: 0.92,
      lead: 5,
      sound: (['ping', 'double', 'chime'] as Sound[])[i % 3],
      rearm: 5,
      randomDelay: false
    };
  }

  function play(kind: Sound, volume: number): void {
    try {
      const ctx = audioCtx();
      if (ctx.state === 'suspended') void ctx.resume();
      const notes: Array<[number, number]> =
        kind === 'ping' ? [[880, 0]] : kind === 'double' ? [[880, 0], [880, 0.28]] : [[660, 0], [880, 0.18], [1100, 0.36]];
      for (const [hz, at0] of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const at = ctx.currentTime + at0;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(hz, at);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.4 * volume), at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 0.32);
      }
    } catch {
      /* 소리가 막힌 자리. 알림은 화면과 토스트로 */
    }
  }

  Toolbox.register({
    id: 'regionwatch',
    title: t('widgets.regionwatch.title', undefined, '화면 영역 지켜보기'),
    category: 'av',
    desc: t('widgets-desc.regionwatch.desc', undefined, '화면 한 곳을 지켜보다가 기준 모습과 같아지거나 달라지면 소리로 알립니다. 화면은 브라우저를 벗어나지 않습니다'),
    layout: 'wide',
    icon: '<rect x="3" y="4" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="8" y="8" width="8" height="5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-dasharray="2 1.5"/><path d="M8 21h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('regionwatch.tab', undefined, '지켜보기'),
        build: function (container: HTMLElement): void {
          void loadNamespace('regionwatch').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    injectStyles();
    const slotRows = Array.from({ length: SLOTS }, (_, i) => `
      <div class="rw-slot" data-i="${i}">
        <div class="rw-slot-head">
          <label class="tool-chip rw-on"><input type="checkbox" data-k="enabled" checked> ${i + 1}</label>
          <input type="text" class="mono-input rw-name" data-k="name" maxlength="16" aria-label="${esc(t('regionwatch.label.name'))}">
          <button class="btn btn-sm btn-outline" data-act="pick">${esc(t('regionwatch.btn.pick'))}</button>
          <button class="btn btn-sm btn-outline" data-act="ref">${esc(t('regionwatch.btn.ref'))}</button>
          <span class="rw-thumb" title="${esc(t('regionwatch.label.ref'))}"></span>
          <span class="rw-sim"><i></i><b>-</b></span>
        </div>
        <div class="rw-slot-body">
          <select data-k="mode" aria-label="${esc(t('regionwatch.label.mode'))}">
            <option value="match">${esc(t('regionwatch.mode.match'))}</option>
            <option value="change">${esc(t('regionwatch.mode.change'))}</option>
            <option value="count">${esc(t('regionwatch.mode.count'))}</option>
          </select>
          <span class="rw-if-edge">
            <label class="tool-sublabel">${esc(t('regionwatch.label.threshold'))} <output data-o="threshold">92%</output></label>
            <input type="range" min="50" max="99" step="1" data-k="threshold" aria-label="${esc(t('regionwatch.label.threshold'))}">
          </span>
          <span class="rw-if-count">
            <label class="tool-sublabel">${esc(t('regionwatch.label.lead'))}</label>
            <input type="number" class="mono-input rw-rearm" min="0" max="3600" step="1" data-k="lead" aria-label="${esc(t('regionwatch.label.lead'))}">
          </span>
          <select data-k="sound" aria-label="${esc(t('regionwatch.label.sound'))}">
            <option value="ping">${esc(t('regionwatch.sound.ping'))}</option>
            <option value="double">${esc(t('regionwatch.sound.double'))}</option>
            <option value="chime">${esc(t('regionwatch.sound.chime'))}</option>
          </select>
          <label class="tool-sublabel">${esc(t('regionwatch.label.rearm'))}</label>
          <input type="number" class="mono-input rw-rearm" min="0" max="3600" step="1" data-k="rearm" aria-label="${esc(t('regionwatch.label.rearm'))}">
          <label class="tool-chip"><input type="checkbox" data-k="randomDelay"> ${esc(t('regionwatch.opt.randomDelay'))}</label>
        </div>
      </div>`).join('');

    container.innerHTML = `
      <div class="tool-actions tight">
        <button class="btn btn-primary" id="rwStart">${esc(t('regionwatch.btn.start'))}</button>
        <button class="btn btn-ghost" id="rwStop" disabled>${esc(t('regionwatch.btn.stop'))}</button>
        <button class="btn btn-ghost" id="rwPip" disabled>${esc(t('regionwatch.btn.pip'))}</button>
        <button class="btn btn-ghost" id="rwTest">${esc(t('regionwatch.btn.test'))}</button>
        <label class="tool-chip"><input type="checkbox" id="rwNotify"> ${esc(t('regionwatch.opt.notify'))}</label>
        <label class="tool-sublabel rw-vol">${esc(t('regionwatch.label.volume'))} <input type="range" id="rwVolume" min="0" max="100" step="5" aria-label="${esc(t('regionwatch.label.volume'))}"></label>
      </div>
      <div class="rw-grid">
        <div class="rw-left">
          <canvas id="rwPreview" class="rw-preview"></canvas>
          <div class="tool-hint" id="rwHint">${esc(t('regionwatch.hint.idle'))}</div>
        </div>
        <div class="rw-right" id="rwSlots">${slotRows}</div>
      </div>
      <div class="tool-status" id="rwStatus">${esc(t('regionwatch.status.idle'))}</div>
      <div class="tool-hint" id="rwRate"></div>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const startBtn = $<HTMLButtonElement>('#rwStart');
    const stopBtn = $<HTMLButtonElement>('#rwStop');
    const pipBtn = $<HTMLButtonElement>('#rwPip');
    const testBtn = $<HTMLButtonElement>('#rwTest');
    const notifyBox = $<HTMLInputElement>('#rwNotify');
    const volume = $<HTMLInputElement>('#rwVolume');
    const preview = $<HTMLCanvasElement>('#rwPreview');
    const hint = $<HTMLElement>('#rwHint');
    const slotsBox = $<HTMLElement>('#rwSlots');
    const rateEl = $<HTMLElement>('#rwRate');
    const say = statusLine($<HTMLElement>('#rwStatus'));

    const pctx = preview.getContext('2d') as CanvasRenderingContext2D;
    /* 원본 크기 그림. 자르고 비교하는 자리 */
    const src = document.createElement('canvas');
    const sctx = src.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    const small = document.createElement('canvas');
    const smctx = small.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    /* 숫자 읽기용. 키워서 이진화 */
    const ocrCanvas = document.createElement('canvas');
    const ocrCtx = ocrCanvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;

    const slots: Slot[] = Array.from({ length: SLOTS }, (_, i) => newSlot(i));
    let savedSize: [number, number] = [0, 0];
    let vol = 0.7;

    /* 도는 동안의 상태 */
    let stream: MediaStream | null = null;
    let video: HTMLVideoElement | null = null;
    let stopFrames: (() => void) | null = null;
    let lastCheck = 0;
    let lastRead = 0;
    let picking = -1;
    let drag: { x0: number; y0: number; x1: number; y1: number } | null = null;
    const edge: EdgeState[] = Array.from({ length: SLOTS }, () => ({ wasHit: false, firedAt: -1e9 }));
    const count: CountState[] = Array.from({ length: SLOTS }, () => ({ last: null, streak: 0, firedAt: -1e9, done: false }));
    const lastSim: number[] = new Array(SLOTS).fill(-1);
    /* 기준을 찍은 직후나 시작 직후의 첫 판정은 상태만 맞추고 침묵. 기준은 지금 모습이라 늘 같음 */
    const primed: boolean[] = new Array(SLOTS).fill(false);
    const pending: Array<number | null> = new Array(SLOTS).fill(null);
    let pip: PipWindowLike | null = null;
    let pipBody: HTMLElement | null = null;
    let pipRate: HTMLElement | null = null;
    let ocr: OcrWorker | null = null;
    let ocrLoading: Promise<OcrWorker | null> | null = null;
    let reading = false;
    /* 덮어 둔 탭에서도 도는지 사용자가 눈으로 확인하는 수치. 최근 1분의 판정과 읽기 횟수 */
    const stamps: { checks: number[]; reads: number[] } = { checks: [], reads: [] };
    let rateAt = 0;

    function bump(kind: 'checks' | 'reads', now: number): void {
      const arr = stamps[kind];
      arr.push(now);
      while (arr.length && now - arr[0] > 60000) arr.shift();
      if (now - rateAt < 1000) return;
      rateAt = now;
      const text = t('regionwatch.label.rate').replace('{checks}', String(stamps.checks.length)).replace('{reads}', String(stamps.reads.length));
      rateEl.textContent = text;
      if (pipRate) pipRate.textContent = text;
    }

    /* ── 저장, 복구 ───────────────────────────────────────── */
    function save(): void {
      const data: Saved = {
        sw: src.width,
        sh: src.height,
        volume: vol,
        notify: notifyBox.checked,
        slots: slots.map((s) => ({ ...s, ref: s.ref ? btoa(String.fromCharCode(...Array.from(s.ref))) : null }))
      };
      try {
        localStorage.setItem(STORE, JSON.stringify(data));
      } catch {
        /* 저장 공간 부족. 도는 데는 지장 없음 */
      }
    }

    function load(): void {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(STORE);
      } catch {
        return;
      }
      if (!raw) return;
      try {
        const d = JSON.parse(raw) as Saved;
        savedSize = [d.sw || 0, d.sh || 0];
        vol = typeof d.volume === 'number' ? d.volume : vol;
        notifyBox.checked = !!d.notify;
        d.slots?.slice(0, SLOTS).forEach((s, i) => {
          const ref = s.ref ? Uint8ClampedArray.from(atob(s.ref), (c) => c.charCodeAt(0)) : null;
          slots[i] = { ...newSlot(i), ...s, ref };
        });
      } catch {
        /* 옛 저장이 깨졌으면 새로 시작 */
      }
    }

    /* ── 슬롯 화면 ────────────────────────────────────────── */
    function slotEl(i: number): HTMLElement {
      return slotsBox.children[i] as HTMLElement;
    }

    function paintSlot(i: number): void {
      const s = slots[i];
      const el = slotEl(i);
      (el.querySelector('[data-k="enabled"]') as HTMLInputElement).checked = s.enabled;
      (el.querySelector('[data-k="name"]') as HTMLInputElement).value = s.name;
      (el.querySelector('[data-k="mode"]') as HTMLSelectElement).value = s.mode;
      (el.querySelector('[data-k="threshold"]') as HTMLInputElement).value = String(Math.round(s.threshold * 100));
      (el.querySelector('[data-o="threshold"]') as HTMLOutputElement).value = Math.round(s.threshold * 100) + '%';
      (el.querySelector('[data-k="lead"]') as HTMLInputElement).value = String(s.lead);
      (el.querySelector('[data-k="sound"]') as HTMLSelectElement).value = s.sound;
      (el.querySelector('[data-k="rearm"]') as HTMLInputElement).value = String(s.rearm);
      (el.querySelector('[data-k="randomDelay"]') as HTMLInputElement).checked = s.randomDelay;
      const pick = el.querySelector('[data-act="pick"]') as HTMLButtonElement;
      pick.textContent = s.rect ? `${s.rect.w}x${s.rect.h}` : t('regionwatch.btn.pick');
      pick.classList.toggle('is-on', picking === i);
      const thumb = el.querySelector('.rw-thumb') as HTMLElement;
      thumb.innerHTML = s.thumb ? `<img src="${s.thumb}" alt="">` : '';
      (el.querySelector('[data-act="ref"]') as HTMLButtonElement).disabled = !s.rect || !stream || s.mode === 'count';
      el.classList.toggle('is-off', !s.enabled);
      el.classList.toggle('is-count', s.mode === 'count');
    }

    function paintSim(i: number, sim: number, hit: boolean, label?: string): void {
      const el = slotEl(i).querySelector('.rw-sim') as HTMLElement;
      const bar = el.querySelector('i') as HTMLElement;
      const txt = el.querySelector('b') as HTMLElement;
      const text = label ?? (sim < 0 ? '-' : Math.round(sim * 100) + '%');
      bar.style.width = sim < 0 ? '0' : Math.round(clamp(sim, 0, 1) * 100) + '%';
      txt.textContent = text;
      el.classList.toggle('is-hit', hit);
      if (pipBody) {
        const row = pipBody.children[i] as HTMLElement | undefined;
        if (row) {
          (row.querySelector('b') as HTMLElement).textContent = text;
          row.classList.toggle('is-hit', hit);
        }
      }
    }

    slotsBox.addEventListener('input', (ev) => {
      const target = ev.target as HTMLInputElement | HTMLSelectElement;
      const el = target.closest('.rw-slot') as HTMLElement | null;
      if (!el) return;
      const i = Number(el.dataset.i);
      const s = slots[i];
      const k = target.dataset.k;
      if (k === 'enabled') s.enabled = (target as HTMLInputElement).checked;
      else if (k === 'name') s.name = target.value;
      else if (k === 'mode') {
        s.mode = target.value as Mode;
        paintSlot(i);
        if (s.mode === 'count' && stream) void ensureOcr();
      } else if (k === 'threshold') {
        s.threshold = clamp(Number(target.value) / 100, 0.5, 0.99);
        (el.querySelector('[data-o="threshold"]') as HTMLOutputElement).value = target.value + '%';
      } else if (k === 'lead') s.lead = clamp(Number(target.value) || 0, 0, 3600);
      else if (k === 'sound') s.sound = target.value as Sound;
      else if (k === 'rearm') s.rearm = clamp(Number(target.value) || 0, 0, 3600);
      else if (k === 'randomDelay') s.randomDelay = (target as HTMLInputElement).checked;
      resetState(i);
      el.classList.toggle('is-off', !s.enabled);
      save();
    });

    slotsBox.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest('[data-act]') as HTMLButtonElement | null;
      if (!btn) return;
      const el = btn.closest('.rw-slot') as HTMLElement;
      const i = Number(el.dataset.i);
      if (btn.dataset.act === 'pick') {
        picking = picking === i ? -1 : i;
        for (let j = 0; j < SLOTS; j++) paintSlot(j);
        hint.textContent = picking >= 0 ? t('regionwatch.hint.pick') : stream ? t('regionwatch.hint.running') : t('regionwatch.hint.idle');
      } else if (btn.dataset.act === 'ref') {
        takeRef(i);
      }
    });

    function resetState(i: number): void {
      edge[i] = { wasHit: false, firedAt: edge[i].firedAt };
      count[i] = { last: null, streak: 0, firedAt: count[i].firedAt, done: false };
      primed[i] = false;
    }

    /* ── 기준 그림 ────────────────────────────────────────── */
    function cropSmall(r: Rect): Uint8ClampedArray {
      const [w, h] = smallSize(r);
      small.width = w;
      small.height = h;
      smctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, w, h);
      return smctx.getImageData(0, 0, w, h).data;
    }

    function takeRef(i: number): void {
      const s = slots[i];
      if (!s.rect || !src.width) return;
      s.ref = cropSmall(s.rect);
      const th = document.createElement('canvas');
      const k = Math.min(1, 96 / Math.max(s.rect.w, s.rect.h));
      th.width = Math.max(1, Math.round(s.rect.w * k));
      th.height = Math.max(1, Math.round(s.rect.h * k));
      (th.getContext('2d') as CanvasRenderingContext2D).drawImage(src, s.rect.x, s.rect.y, s.rect.w, s.rect.h, 0, 0, th.width, th.height);
      s.thumb = th.toDataURL('image/png');
      resetState(i);
      paintSlot(i);
      save();
      say(t('regionwatch.say.ref').replace('{name}', s.name), 'ok');
    }

    /* ── 영역 고르기 (미리보기 위에서 끌기) ───────────────── */
    const toPreview = (ev: MouseEvent): [number, number] => {
      const b = preview.getBoundingClientRect();
      return [clamp(ev.clientX - b.left, 0, b.width), clamp(ev.clientY - b.top, 0, b.height)];
    };
    preview.addEventListener('mousedown', (ev) => {
      if (picking < 0 || !stream) return;
      const [x, y] = toPreview(ev);
      drag = { x0: x, y0: y, x1: x, y1: y };
      ev.preventDefault();
    });
    const onMove = (ev: MouseEvent): void => {
      if (!drag) return;
      [drag.x1, drag.y1] = toPreview(ev);
      if (!document.hidden) paintPreview();
    };
    const onUp = (): void => {
      if (!drag || picking < 0) {
        drag = null;
        return;
      }
      const b = preview.getBoundingClientRect();
      const kx = src.width / b.width;
      const ky = src.height / b.height;
      const x = Math.round(Math.min(drag.x0, drag.x1) * kx);
      const y = Math.round(Math.min(drag.y0, drag.y1) * ky);
      const w = Math.round(Math.abs(drag.x1 - drag.x0) * kx);
      const h = Math.round(Math.abs(drag.y1 - drag.y0) * ky);
      drag = null;
      if (w < 4 || h < 4) return;
      const s = slots[picking];
      s.rect = { x, y, w, h };
      s.ref = null;
      s.thumb = '';
      const i = picking;
      picking = -1;
      paintSlot(i);
      if (s.mode !== 'count') takeRef(i);
      hint.textContent = s.mode === 'count' ? t('regionwatch.hint.count') : t('regionwatch.hint.running');
      save();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    /* ── 그리기 ───────────────────────────────────────────── */
    function fitPreview(): void {
      const box = preview.parentElement as HTMLElement;
      const w = Math.max(200, Math.min(box.clientWidth || 640, 960));
      const h = src.width ? Math.round((w * src.height) / src.width) : Math.round((w * 9) / 16);
      if (preview.width !== w || preview.height !== h) {
        preview.width = w;
        preview.height = h;
      }
    }

    function paintPreview(): void {
      fitPreview();
      pctx.clearRect(0, 0, preview.width, preview.height);
      if (src.width) pctx.drawImage(src, 0, 0, preview.width, preview.height);
      const kx = preview.width / (src.width || 1);
      const ky = preview.height / (src.height || 1);
      pctx.lineWidth = 2;
      pctx.font = '12px var(--font-mono, monospace)';
      slots.forEach((s, i) => {
        if (!s.rect) return;
        const hot = s.mode === 'count' ? count[i].done : edge[i].wasHit;
        pctx.strokeStyle = hot ? '#3ddc84' : s.enabled ? '#ffb020' : '#888';
        pctx.strokeRect(s.rect.x * kx, s.rect.y * ky, s.rect.w * kx, s.rect.h * ky);
        pctx.fillStyle = pctx.strokeStyle;
        pctx.fillText(String(i + 1), s.rect.x * kx + 3, s.rect.y * ky + 13);
      });
      if (drag) {
        pctx.strokeStyle = '#4ea1ff';
        pctx.setLineDash([4, 3]);
        pctx.strokeRect(Math.min(drag.x0, drag.x1), Math.min(drag.y0, drag.y1), Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0));
        pctx.setLineDash([]);
      }
    }

    /* ── 판정 ─────────────────────────────────────────────── */
    function check(now: number): void {
      slots.forEach((s, i) => {
        if (s.mode === 'count') return;
        if (!s.enabled || !s.rect || !s.ref) {
          if (lastSim[i] !== -1) {
            lastSim[i] = -1;
            paintSim(i, -1, false);
          }
          return;
        }
        const sim = similarity(cropSmall(s.rect), s.ref);
        const r = decideEdge(edge[i], sim, { mode: s.mode, threshold: s.threshold, rearm: s.rearm }, now);
        lastSim[i] = sim;
        paintSim(i, sim, r.hit);
        if (!primed[i]) {
          primed[i] = true;
          edge[i] = { wasHit: r.hit, firedAt: edge[i].firedAt };
          return;
        }
        edge[i] = r.state;
        if (r.fire) fire(i, { sim });
      });
    }

    /* ── 숫자 읽기 ────────────────────────────────────────── */
    function ensureOcr(): Promise<OcrWorker | null> {
      if (ocr) return Promise.resolve(ocr);
      if (ocrLoading) return ocrLoading;
      say(t('regionwatch.ocr.loading'));
      ocrLoading = (async () => {
        try {
          await Toolbox.ensureScript('vendor/tesseract/tesseract.min');
          const T = (window as unknown as { Tesseract?: TesseractLike }).Tesseract;
          if (!T) throw new Error('Tesseract global');
          const w = await T.createWorker('eng', 1, {
            workerPath: VENDOR + 'worker.min.js',
            corePath: VENDOR + 'tesseract-core-simd-lstm.wasm.js',
            langPath: VENDOR + 'lang',
            workerBlobURL: false,
            gzip: true
          });
          await w.setParameters({ tessedit_char_whitelist: '0123456789:', tessedit_pageseg_mode: '7' });
          ocr = w;
          say(t('regionwatch.ocr.ready'), 'ok');
          return w;
        } catch (err) {
          say(t('regionwatch.ocr.fail') + (err as Error).message, 'error');
          return null;
        } finally {
          ocrLoading = null;
        }
      })();
      return ocrLoading;
    }

    async function readCounts(now: number): Promise<void> {
      if (reading) return;
      const targets = slots.map((s, i) => ({ s, i })).filter(({ s }) => s.mode === 'count' && s.enabled && s.rect);
      if (!targets.length) return;
      const w = await ensureOcr();
      if (!w || !stream) return;
      reading = true;
      try {
        for (const { s, i } of targets) {
          if (!stream || !s.rect) break;
          const r = s.rect;
          const k = Math.max(1, Math.min(6, Math.round(96 / Math.max(1, r.h))));
          /* 글자 인식기는 글자가 칸을 꽉 채우면 못 읽음. 키운 뒤 흰 여백 */
          const pad = Math.round(r.h * k * 0.4);
          const cw = r.w * k;
          const ch = r.h * k;
          ocrCanvas.width = cw + pad * 2;
          ocrCanvas.height = ch + pad * 2;
          ocrCtx.imageSmoothingEnabled = true;
          ocrCtx.drawImage(src, r.x, r.y, r.w, r.h, pad, pad, cw, ch);
          const img = ocrCtx.getImageData(pad, pad, cw, ch);
          binarize(img.data);
          ocrCtx.fillStyle = '#fff';
          ocrCtx.fillRect(0, 0, ocrCanvas.width, ocrCanvas.height);
          ocrCtx.putImageData(img, pad, pad);
          let text = '';
          try {
            text = (await w.recognize(ocrCanvas)).data.text;
          } catch {
            text = '';
          }
          const secs = parseSeconds(text);
          bump('reads', performance.now());
          window.dispatchEvent(new CustomEvent('regionwatch:read', { detail: { slot: i, text: text.trim(), secs } }));
          const res = decideCount(count[i], secs, { lead: s.lead, rearm: s.rearm }, now);
          count[i] = res.state;
          const shown = secs === null ? t('regionwatch.read.none') : `${secs}s`;
          paintSim(i, secs === null ? -1 : clamp(1 - secs / Math.max(1, s.lead * 4), 0.05, 1), res.state.done, shown);
          if (res.fire) fire(i, { secs });
        }
      } finally {
        reading = false;
      }
    }

    function fire(i: number, detail: { sim?: number; secs?: number | null }): void {
      const s = slots[i];
      const delay = s.randomDelay ? Math.random() * MAX_DELAY_MS : 0;
      if (pending[i] !== null) window.clearTimeout(pending[i] as number);
      pending[i] = window.setTimeout(() => {
        pending[i] = null;
        play(s.sound, vol);
        const msg =
          detail.secs !== undefined && detail.secs !== null
            ? t('regionwatch.say.count').replace('{name}', s.name).replace('{secs}', String(detail.secs))
            : t('regionwatch.say.fired').replace('{name}', s.name);
        say(msg, 'ok');
        if (notifyBox.checked && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            new Notification(t('regionwatch.notify.title'), { body: msg, silent: true });
          } catch {
            /* 알림이 막힌 자리 */
          }
        }
        window.dispatchEvent(new CustomEvent('regionwatch:fire', { detail: { slot: i, name: s.name, mode: s.mode, ...detail } }));
        Toolbox.trackUse?.('fire');
      }, delay);
    }

    /* ── 프레임 받기 ──────────────────────────────────────── */
    function onFrame(paint: () => void, w: number, h: number): void {
      if (src.width !== w || src.height !== h) {
        src.width = w;
        src.height = h;
        if (savedSize[0] && (savedSize[0] !== w || savedSize[1] !== h)) {
          say(t('regionwatch.warn.size').replace('{a}', `${savedSize[0]}x${savedSize[1]}`).replace('{b}', `${w}x${h}`), 'error');
          savedSize = [0, 0];
        }
        for (let i = 0; i < SLOTS; i++) paintSlot(i);
      }
      paint();
      const now = performance.now();
      if (now - lastCheck < CHECK_MS) return;
      lastCheck = now;
      check(now);
      bump('checks', now);
      if (now - lastRead >= READ_MS) {
        lastRead = now;
        void readCounts(now);
      }
      if (!document.hidden) paintPreview();
    }

    async function start(): Promise<void> {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        say(t('regionwatch.err.unsupported'), 'error');
        return;
      }
      let s: MediaStream;
      try {
        s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 10 }, audio: false });
      } catch {
        say(t('regionwatch.err.notStarted'));
        return;
      }
      stream = s;
      const track = s.getVideoTracks()[0];
      track.addEventListener('ended', () => stop());
      startBtn.disabled = true;
      stopBtn.disabled = false;
      pipBtn.disabled = !('documentPictureInPicture' in window);
      hint.textContent = t('regionwatch.hint.running');
      say(t('regionwatch.say.running'), 'ok');
      if (notifyBox.checked && typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => undefined);
      }
      lastCheck = 0;
      lastRead = 0;
      for (let i = 0; i < SLOTS; i++) resetState(i);
      if (slots.some((x) => x.mode === 'count' && x.enabled)) void ensureOcr();

      const Proc = (window as unknown as { MediaStreamTrackProcessor?: new (o: { track: MediaStreamTrack }) => TrackProcessorLike }).MediaStreamTrackProcessor;
      if (Proc) {
        /* 프레임이 오는 대로. 덮어 둔 탭에서도 시계 없이 동작 */
        const reader = new Proc({ track }).readable.getReader();
        let alive = true;
        stopFrames = (): void => {
          alive = false;
          void reader.cancel().catch(() => undefined);
        };
        void (async () => {
          while (alive) {
            const { value, done } = await reader.read();
            if (done || !value) break;
            try {
              onFrame(() => sctx.drawImage(value as unknown as CanvasImageSource, 0, 0), value.displayWidth, value.displayHeight);
            } finally {
              value.close();
            }
          }
        })();
        return;
      }
      /* 없는 브라우저: 영상 요소 + 워커 시계. 워커 시계는 덮어 둔 탭에서도 안 느려짐 */
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.srcObject = s;
      video = v;
      await v.play().catch(() => undefined);
      const worker = new Worker(URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${CHECK_MS});`], { type: 'text/javascript' })));
      worker.onmessage = (): void => {
        if (!v.videoWidth) return;
        onFrame(() => sctx.drawImage(v, 0, 0), v.videoWidth, v.videoHeight);
      };
      stopFrames = (): void => worker.terminate();
    }

    function stop(): void {
      stopFrames?.();
      stopFrames = null;
      stream?.getTracks().forEach((tr) => tr.stop());
      stream = null;
      if (video) {
        video.srcObject = null;
        video = null;
      }
      pending.forEach((p, i) => {
        if (p !== null) window.clearTimeout(p);
        pending[i] = null;
      });
      startBtn.disabled = false;
      stopBtn.disabled = true;
      pipBtn.disabled = true;
      picking = -1;
      drag = null;
      for (let i = 0; i < SLOTS; i++) {
        resetState(i);
        lastSim[i] = -1;
        paintSim(i, -1, false);
        paintSlot(i);
      }
      hint.textContent = t('regionwatch.hint.idle');
      say(t('regionwatch.status.idle'));
      stamps.checks.length = 0;
      stamps.reads.length = 0;
      rateEl.textContent = '';
      closePip();
    }

    /* ── 떠 있는 창 ───────────────────────────────────────── */
    async function openPip(): Promise<void> {
      const api = (window as unknown as { documentPictureInPicture?: DocPipLike }).documentPictureInPicture;
      if (!api) return;
      try {
        pip = await api.requestWindow({ width: 260, height: 40 + SLOTS * 26 });
      } catch {
        say(t('regionwatch.err.pip'), 'error');
        return;
      }
      const d = pip.document;
      d.body.style.cssText = 'margin:0;font:12px system-ui,sans-serif;background:#111;color:#eee;';
      const box = d.createElement('div');
      box.style.cssText = 'padding:6px 8px;display:grid;gap:4px;';
      slots.forEach((s, i) => {
        const row = d.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;gap:8px;padding:2px 6px;border-radius:4px;';
        row.innerHTML = `<span>${esc(s.name)}</span><b>${lastSim[i] < 0 ? '-' : Math.round(lastSim[i] * 100) + '%'}</b>`;
        if (!s.enabled || !s.rect) row.style.opacity = '0.4';
        box.appendChild(row);
      });
      const style = d.createElement('style');
      style.textContent = '.is-hit{background:#1f6b3a}';
      d.head.appendChild(style);
      d.body.appendChild(box);
      const rate = d.createElement('div');
      rate.style.cssText = 'padding:2px 14px 6px;font-size:11px;opacity:.7;';
      rate.textContent = rateEl.textContent || '';
      d.body.appendChild(rate);
      pipBody = box;
      pipRate = rate;
      pip.addEventListener('pagehide', () => {
        pip = null;
        pipBody = null;
        pipRate = null;
        pipBtn.classList.remove('is-on');
      });
    }

    function closePip(): void {
      try {
        pip?.close();
      } catch {
        /* 이미 닫힌 창 */
      }
      pip = null;
      pipBody = null;
      pipRate = null;
      pipBtn.classList.remove('is-on');
    }

    /* ── 버튼 ─────────────────────────────────────────────── */
    startBtn.onclick = (): void => {
      void start().catch((err: Error) => {
        stop();
        say(t('regionwatch.err.run') + err.message, 'error');
      });
    };
    stopBtn.onclick = stop;
    pipBtn.onclick = (): void => {
      if (pip) closePip();
      else void openPip().then(() => pipBtn.classList.toggle('is-on', !!pip));
    };
    testBtn.onclick = (): void => play('chime', vol);
    volume.oninput = (): void => {
      vol = Number(volume.value) / 100;
      save();
    };
    notifyBox.onchange = (): void => {
      if (notifyBox.checked && typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => undefined);
      }
      save();
    };

    /* 묶음 안에서는 오른쪽 칸이 좁음. 칸 폭을 보고 미리보기 아래에 슬롯 두 줄 */
    const grid = $<HTMLElement>('.rw-grid');
    const relayout = (): void => {
      const w = container.clientWidth || 0;
      grid.classList.toggle('is-narrow', w > 0 && w < 900);
      grid.classList.toggle('is-two', w >= 560 && w < 900);
      if (!document.hidden) paintPreview();
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(relayout) : null;
    ro?.observe(container);

    load();
    volume.value = String(Math.round(vol * 100));
    for (let i = 0; i < SLOTS; i++) paintSlot(i);
    relayout();

    Toolbox.onDispose?.(() => {
      ro?.disconnect();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      stop();
      const w = ocr;
      ocr = null;
      void w?.terminate();
    });
  }

  let styled = false;
  function injectStyles(): void {
    if (styled) return;
    styled = true;
    const st = document.createElement('style');
    st.textContent = `
      .rw-grid{display:grid;grid-template-columns:minmax(240px,3fr) minmax(300px,2fr);gap:var(--space-md,12px);margin-top:var(--space-md,12px)}
      .rw-grid.is-narrow{grid-template-columns:1fr}
      .rw-grid.is-two .rw-right{grid-template-columns:1fr 1fr}
      .rw-preview{width:100%;height:auto;display:block;background:var(--bg-tertiary);border:1px solid var(--border-color,var(--border));border-radius:var(--radius-md);cursor:crosshair}
      .rw-right{display:grid;gap:6px;align-content:start}
      .rw-slot{border:1px solid var(--border-color,var(--border));border-radius:var(--radius-md);padding:6px 8px;display:grid;gap:6px}
      .rw-slot.is-off{opacity:.5}
      .rw-slot-head,.rw-slot-body{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
      .rw-if-edge,.rw-if-count{display:contents}
      .rw-slot.is-count .rw-if-edge,.rw-slot:not(.is-count) .rw-if-count{display:none}
      .rw-name{width:7em}
      .rw-rearm{width:4.5em}
      .rw-thumb{display:inline-block;width:32px;height:24px;border:1px solid var(--border-color,var(--border));border-radius:var(--radius-sm);overflow:hidden;background:var(--bg-tertiary)}
      .rw-thumb img{width:100%;height:100%;object-fit:contain;display:block}
      .rw-sim{position:relative;flex:1 1 60px;min-width:60px;height:16px;border-radius:var(--radius-sm);background:var(--bg-tertiary);overflow:hidden;font:11px var(--font-mono);text-align:right}
      .rw-sim i{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--accent);opacity:.35;transition:width .2s}
      .rw-sim b{position:relative;padding:0 6px;line-height:16px;color:var(--text-primary)}
      .rw-sim.is-hit i{opacity:.8}
      .rw-slot-body input[type=range]{flex:1 1 80px;min-width:80px}
      .rw-vol input[type=range]{width:90px;vertical-align:middle}
    `;
    document.head.appendChild(st);
  }
})();
