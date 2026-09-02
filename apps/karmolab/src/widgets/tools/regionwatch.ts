/**
 * 화면 영역 지켜보기
 *
 * - 화면 한 곳을 골라 두고, 그 자리가 **기준 모습과 같아지거나 달라지면** 소리로 알림
 * - 쓰임: 빌드 진행 막대, 내려받기 완료, 대시보드 숫자 변화처럼 눈으로 지키기 아까운 자리
 * - 입력: 브라우저 화면 공유(`getDisplayMedia`). 화면 녹화와 같은 길
 * - 프레임은 **이 탭 안에서만** 비교, 외부 전송 0. 기준 그림과 영역은 localStorage
 * - 비교: 작게 줄인 두 그림의 평균 색 차이. 라이브러리 없이 canvas 만
 * - 슬롯 여섯. 슬롯마다 영역, 기준 그림, 같아지면/달라지면, 닮은 정도 문턱, 소리, 다시 무장 시간
 * - 덮어 둔 탭: `MediaStreamTrackProcessor` 프레임 스트림, 시계 없음. 없는 브라우저는 워커 시계
 * - 떠 있는 창(Document Picture-in-Picture): 상태 판을 다른 창 위에
 */
import { escapeHtml as esc } from './shared/text';
import { statusLine } from './shared/say';
import { audioCtx } from './shared/media';
import { t, loadNamespace } from '../../lib/i18n';

interface Rect { x: number; y: number; w: number; h: number }

type Mode = 'match' | 'change';
type Sound = 'ping' | 'double' | 'chime';

interface Slot {
  name: string;
  enabled: boolean;
  rect: Rect | null;
  /** 기준 그림. 작게 줄인 픽셀. */
  ref: Uint8ClampedArray | null;
  refW: number;
  refH: number;
  /** 보여 주는 용 작은 그림 */
  thumb: string;
  mode: Mode;
  /** 0.5 ~ 0.99 */
  threshold: number;
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
interface TrackProcessorLike {
  readable: ReadableStream<{ close(): void; displayWidth: number; displayHeight: number }>;
}
interface PipWindowLike extends Window { document: Document }
interface DocPipLike {
  requestWindow(o: { width: number; height: number }): Promise<PipWindowLike>;
}

(function (): void {
  const SLOTS = 6;
  const SMALL = 40;
  const CHECK_MS = 250;
  const STORE = 'regionwatch.v1';
  const MAX_DELAY_MS = 3000;

  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

  function newSlot(i: number): Slot {
    return {
      name: t('regionwatch.slot.default', undefined, '자리') + ' ' + (i + 1),
      enabled: true,
      rect: null,
      ref: null,
      refW: 0,
      refH: 0,
      thumb: '',
      mode: 'match',
      threshold: 0.92,
      sound: (['ping', 'double', 'chime'] as Sound[])[i % 3],
      rearm: 5,
      randomDelay: false
    };
  }

  /** 두 작은 그림의 닮은 정도. 1 이 같음. */
  function similarity(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
    const n = Math.min(a.length, b.length);
    if (!n) return 0;
    let sum = 0;
    let cnt = 0;
    for (let i = 0; i < n; i += 4) {
      sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      cnt += 3;
    }
    return 1 - sum / (cnt * 255);
  }

  function smallSize(r: Rect): [number, number] {
    const k = SMALL / Math.max(r.w, r.h);
    return [Math.max(1, Math.round(r.w * k)), Math.max(1, Math.round(r.h * k))];
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
          </select>
          <label class="tool-sublabel">${esc(t('regionwatch.label.threshold'))} <output data-o="threshold">92%</output></label>
          <input type="range" min="50" max="99" step="1" data-k="threshold" aria-label="${esc(t('regionwatch.label.threshold'))}">
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
    const say = statusLine($<HTMLElement>('#rwStatus'));

    const pctx = preview.getContext('2d') as CanvasRenderingContext2D;
    /* 원본 크기 그림. 자르고 비교하는 자리 */
    const src = document.createElement('canvas');
    const sctx = src.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    const small = document.createElement('canvas');
    const smctx = small.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;

    const slots: Slot[] = Array.from({ length: SLOTS }, (_, i) => newSlot(i));
    let savedSize: [number, number] = [0, 0];
    let vol = 0.7;

    /* 도는 동안의 상태 */
    let stream: MediaStream | null = null;
    let video: HTMLVideoElement | null = null;
    let stopFrames: (() => void) | null = null;
    let lastCheck = 0;
    let picking = -1;
    let drag: { x0: number; y0: number; x1: number; y1: number } | null = null;
    const wasHit: boolean[] = new Array(SLOTS).fill(false);
    const firedAt: number[] = new Array(SLOTS).fill(0);
    const lastSim: number[] = new Array(SLOTS).fill(-1);
    const pending: Array<number | null> = new Array(SLOTS).fill(null);
    let pip: PipWindowLike | null = null;
    let pipBody: HTMLElement | null = null;

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
      (el.querySelector('[data-k="sound"]') as HTMLSelectElement).value = s.sound;
      (el.querySelector('[data-k="rearm"]') as HTMLInputElement).value = String(s.rearm);
      (el.querySelector('[data-k="randomDelay"]') as HTMLInputElement).checked = s.randomDelay;
      const pick = el.querySelector('[data-act="pick"]') as HTMLButtonElement;
      pick.textContent = s.rect ? `${s.rect.w}x${s.rect.h}` : t('regionwatch.btn.pick');
      pick.classList.toggle('is-on', picking === i);
      const thumb = el.querySelector('.rw-thumb') as HTMLElement;
      thumb.innerHTML = s.thumb ? `<img src="${s.thumb}" alt="">` : '';
      (el.querySelector('[data-act="ref"]') as HTMLButtonElement).disabled = !s.rect || !stream;
      el.classList.toggle('is-off', !s.enabled);
    }

    function paintSim(i: number, sim: number, hit: boolean): void {
      const el = slotEl(i).querySelector('.rw-sim') as HTMLElement;
      const bar = el.querySelector('i') as HTMLElement;
      const txt = el.querySelector('b') as HTMLElement;
      if (sim < 0) {
        bar.style.width = '0';
        txt.textContent = '-';
        el.classList.remove('is-hit');
        return;
      }
      bar.style.width = Math.round(sim * 100) + '%';
      txt.textContent = Math.round(sim * 100) + '%';
      el.classList.toggle('is-hit', hit);
      if (pipBody) {
        const row = pipBody.children[i] as HTMLElement | undefined;
        if (row) {
          (row.querySelector('b') as HTMLElement).textContent = Math.round(sim * 100) + '%';
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
      else if (k === 'mode') s.mode = target.value as Mode;
      else if (k === 'threshold') {
        s.threshold = clamp(Number(target.value) / 100, 0.5, 0.99);
        (el.querySelector('[data-o="threshold"]') as HTMLOutputElement).value = target.value + '%';
      } else if (k === 'sound') s.sound = target.value as Sound;
      else if (k === 'rearm') s.rearm = clamp(Number(target.value) || 0, 0, 3600);
      else if (k === 'randomDelay') s.randomDelay = (target as HTMLInputElement).checked;
      wasHit[i] = false;
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
      [s.refW, s.refH] = smallSize(s.rect);
      const th = document.createElement('canvas');
      const k = 96 / Math.max(s.rect.w, s.rect.h);
      th.width = Math.max(1, Math.round(s.rect.w * Math.min(1, k)));
      th.height = Math.max(1, Math.round(s.rect.h * Math.min(1, k)));
      (th.getContext('2d') as CanvasRenderingContext2D).drawImage(src, s.rect.x, s.rect.y, s.rect.w, s.rect.h, 0, 0, th.width, th.height);
      s.thumb = th.toDataURL('image/png');
      wasHit[i] = false;
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
    window.addEventListener('mousemove', (ev) => {
      if (!drag) return;
      [drag.x1, drag.y1] = toPreview(ev);
      if (document.hidden) return;
      paintPreview();
    });
    window.addEventListener('mouseup', () => {
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
      takeRef(i);
      hint.textContent = t('regionwatch.hint.running');
      save();
    });

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
        pctx.strokeStyle = wasHit[i] ? '#3ddc84' : s.enabled ? '#ffb020' : '#888';
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
        if (!s.enabled || !s.rect || !s.ref) {
          if (lastSim[i] !== -1) {
            lastSim[i] = -1;
            paintSim(i, -1, false);
          }
          return;
        }
        const cur = cropSmall(s.rect);
        const sim = similarity(cur, s.ref);
        const hit = s.mode === 'match' ? sim >= s.threshold : sim < s.threshold;
        lastSim[i] = sim;
        paintSim(i, sim, hit);
        if (!hit) {
          wasHit[i] = false;
          return;
        }
        if (wasHit[i]) return;
        wasHit[i] = true;
        if (now - firedAt[i] < s.rearm * 1000) return;
        firedAt[i] = now;
        fire(i);
      });
    }

    function fire(i: number): void {
      const s = slots[i];
      const delay = s.randomDelay ? Math.random() * MAX_DELAY_MS : 0;
      if (pending[i] !== null) window.clearTimeout(pending[i] as number);
      pending[i] = window.setTimeout(() => {
        pending[i] = null;
        play(s.sound, vol);
        say(t('regionwatch.say.fired').replace('{name}', s.name), 'ok');
        if (notifyBox.checked && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            new Notification(t('regionwatch.notify.title'), { body: s.name, silent: true });
          } catch {
            /* 알림이 막힌 자리 */
          }
        }
        Toolbox.trackUse?.('fire');
      }, delay);
    }

    /* ── 프레임 받기 ──────────────────────────────────────── */
    function onFrame(draw: () => void, w: number, h: number): void {
      if (src.width !== w || src.height !== h) {
        src.width = w;
        src.height = h;
        if (savedSize[0] && (savedSize[0] !== w || savedSize[1] !== h)) {
          say(t('regionwatch.warn.size').replace('{a}', `${savedSize[0]}x${savedSize[1]}`).replace('{b}', `${w}x${h}`), 'error');
          savedSize = [0, 0];
        }
        for (let i = 0; i < SLOTS; i++) paintSlot(i);
      }
      draw();
      const now = performance.now();
      if (now - lastCheck < CHECK_MS) return;
      lastCheck = now;
      check(now);
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
        wasHit[i] = false;
        lastSim[i] = -1;
        paintSim(i, -1, false);
        paintSlot(i);
      }
      hint.textContent = t('regionwatch.hint.idle');
      say(t('regionwatch.status.idle'));
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
      pipBody = box;
      pip.addEventListener('pagehide', () => {
        pip = null;
        pipBody = null;
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
      pipBtn.classList.remove('is-on');
    }

    /* ── 버튼 ───────────────────────────────────────────── */
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
      stop();
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
