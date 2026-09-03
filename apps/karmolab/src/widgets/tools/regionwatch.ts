/**
 * 화면 영역 지켜보기
 *
 * - 화면 한 곳을 골라 두고, 그 자리가 **기준 모습과 같아지거나 달라지면** 소리로 알림
 * - 남은 초 모드: 그 자리의 숫자를 읽어 N초 이하로 내려오면 알림 (tesseract, 동일 출처 vendor)
 * - 쓰임: 빌드 진행 막대, 내려받기 완료, 대시보드 숫자 변화처럼 눈으로 지키기 아까운 자리
 * - 입력: 브라우저 화면 공유(`getDisplayMedia`). 화면 녹화와 같은 길
 * - 프레임은 **이 탭 안에서만** 비교, 외부 전송 0. 기준 그림과 영역은 localStorage
 * - 판정 로직은 `shared/regionwatch-core.ts`. 화면 없이 `scripts/test-regionwatch.mjs` 가 실행
 * - 캡처, 숫자 읽기, 떠 있는 창은 공용 부품 `shared/screen-capture`, `shared/ocr-digits`, `shared/pip-panel`
 * - 덮어 둔 탭: 프레임 스트림이 오는 대로 판정, 시계 없음 (공용 부품이 처리)
 * - 시험용 신호: `regionwatch:fire`, `regionwatch:read` CustomEvent (window)
 */
import { escapeHtml as esc } from './shared/text';
import { statusLine } from './shared/say';
import { audioCtx, loadAudio } from './shared/media';
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
  parseNumber,
  slopePerSec,
  secondsToTarget,
  gateReading,
  foldSamples,
  isIdle,
  formatDuration,
  type Sample,
  type GateState
} from './shared/regionwatch-core';
import { download } from './shared/video';
import { startDisplayCapture, displayCaptureSupported, type CaptureHandle } from './shared/screen-capture';
import { ensureDigitReader, prepareForOcr, type DigitReader } from './shared/ocr-digits';
import { openPipPanel, pipSupported, type PipPanel } from './shared/pip-panel';

type Sound = 'ping' | 'double' | 'chime' | 'custom1' | 'custom2' | 'custom3';
const CUSTOM_SOUNDS: Sound[] = ['custom1', 'custom2', 'custom3'];

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
  /** 추세 기록: 목표 값. null 이면 없음 */
  target: number | null;
  /** 추세 기록: 값이 이 초 동안 안 바뀌면 알림. 0 이면 끔 */
  idleSec: number;
  sound: Sound;
  /** 다시 무장까지 초 */
  rearm: number;
  randomDelay: boolean;
}

type SavedSlot = Omit<Slot, 'ref'> & { ref: string | null };

interface Saved {
  sw: number;
  sh: number;
  volume: number;
  notify: boolean;
  /** 마지막으로 쓴 슬롯. 화면 크기를 아직 모를 때의 기본값 */
  slots: SavedSlot[];
  /** 화면 크기("1920x1080")마다 슬롯 한 벌. 창 크기가 바뀌어도 영역을 다시 안 끌게 */
  profiles?: Record<string, SavedSlot[]>;
}

(function (): void {
  const SLOTS_MIN = 6;
  const SLOTS_MAX = 12;
  const SOUND_DB = 'regionwatch-sounds';
  const SOUND_MAX_BYTES = 2 * 1024 * 1024;
  const CHECK_MS = 250;
  const READ_MS = 1000;
  const STORE = 'regionwatch.v1';
  const MAX_DELAY_MS = 3000;

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
      target: null,
      idleSec: 180,
      sound: (['ping', 'double', 'chime'] as Sound[])[i % 3],
      rearm: 5,
      randomDelay: false
    };
  }

  /* 내 알림음. IndexedDB 에 파일 바이트, 메모리에 풀어 둔 버퍼 */
  const soundBuffers = new Map<Sound, AudioBuffer>();
  const soundNames = new Map<Sound, string>();

  function soundDb(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(SOUND_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }

  async function loadSounds(): Promise<void> {
    const db = await soundDb();
    if (!db) return;
    await Promise.all(
      CUSTOM_SOUNDS.map(
        (key) =>
          new Promise<void>((resolve) => {
            const req = db.transaction('files').objectStore('files').get(key);
            req.onsuccess = () => {
              const v = req.result as { name: string; bytes: ArrayBuffer } | undefined;
              if (!v) return resolve();
              soundNames.set(key, v.name);
              loadAudio(new Blob([v.bytes]))
                .then((buf) => {
                  soundBuffers.set(key, buf);
                  resolve();
                })
                .catch(() => resolve());
            };
            req.onerror = () => resolve();
          })
      )
    );
  }

  async function saveSound(key: Sound, file: File): Promise<boolean> {
    const db = await soundDb();
    if (!db) return false;
    const bytes = await file.arrayBuffer();
    try {
      soundBuffers.set(key, await loadAudio(file));
    } catch {
      return false;
    }
    soundNames.set(key, file.name);
    return new Promise((resolve) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put({ name: file.name, bytes }, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  function play(kind: Sound, volume: number): void {
    try {
      const ctx = audioCtx();
      if (ctx.state === 'suspended') void ctx.resume();
      const custom = soundBuffers.get(kind);
      if (custom) {
        const srcNode = ctx.createBufferSource();
        const gain = ctx.createGain();
        srcNode.buffer = custom;
        gain.gain.value = Math.max(0.001, volume);
        srcNode.connect(gain);
        gain.connect(ctx.destination);
        srcNode.start();
        return;
      }
      if (CUSTOM_SOUNDS.includes(kind)) kind = 'ping';
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
    const slotRowHtml = (i: number): string => `
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
            <option value="trend">${esc(t('regionwatch.mode.trend'))}</option>
          </select>
          <span class="rw-if-edge">
            <label class="tool-sublabel">${esc(t('regionwatch.label.threshold'))} <output data-o="threshold">92%</output></label>
            <input type="range" min="50" max="99" step="1" data-k="threshold" aria-label="${esc(t('regionwatch.label.threshold'))}">
          </span>
          <span class="rw-if-count">
            <label class="tool-sublabel">${esc(t('regionwatch.label.lead'))}</label>
            <input type="number" class="mono-input rw-rearm" min="0" max="3600" step="1" data-k="lead" aria-label="${esc(t('regionwatch.label.lead'))}">
          </span>
          <span class="rw-if-trend">
            <label class="tool-sublabel">${esc(t('regionwatch.label.target'))}</label>
            <input type="number" class="mono-input rw-target" step="any" data-k="target" aria-label="${esc(t('regionwatch.label.target'))}">
            <label class="tool-sublabel">${esc(t('regionwatch.label.idle'))}</label>
            <input type="number" class="mono-input rw-rearm" min="0" max="86400" step="1" data-k="idleSec" aria-label="${esc(t('regionwatch.label.idle'))}">
          </span>
          <select data-k="sound" aria-label="${esc(t('regionwatch.label.sound'))}">
            <option value="ping">${esc(t('regionwatch.sound.ping'))}</option>
            <option value="double">${esc(t('regionwatch.sound.double'))}</option>
            <option value="chime">${esc(t('regionwatch.sound.chime'))}</option>
            ${CUSTOM_SOUNDS.map((k, n) => `<option value="${k}">${esc(t('regionwatch.sound.custom').replace('{n}', String(n + 1)))}</option>`).join('')}
          </select>
          <label class="tool-sublabel">${esc(t('regionwatch.label.rearm'))}</label>
          <input type="number" class="mono-input rw-rearm" min="0" max="3600" step="1" data-k="rearm" aria-label="${esc(t('regionwatch.label.rearm'))}">
          <label class="tool-chip"><input type="checkbox" data-k="randomDelay"> ${esc(t('regionwatch.opt.randomDelay'))}</label>
        </div>
      </div>`;
    const slotRows = Array.from({ length: SLOTS_MIN }, (_, i) => slotRowHtml(i)).join('');

    container.innerHTML = `
      <div class="tool-actions tight">
        <button class="btn btn-primary" id="rwStart">${esc(t('regionwatch.btn.start'))}</button>
        <button class="btn btn-ghost" id="rwStop" disabled>${esc(t('regionwatch.btn.stop'))}</button>
        <button class="btn btn-ghost" id="rwPip" disabled>${esc(t('regionwatch.btn.pip'))}</button>
        <button class="btn btn-ghost" id="rwTest">${esc(t('regionwatch.btn.test'))}</button>
        <label class="tool-chip"><input type="checkbox" id="rwNotify"> ${esc(t('regionwatch.opt.notify'))}</label>
        <label class="tool-sublabel rw-vol">${esc(t('regionwatch.label.volume'))} <input type="range" id="rwVolume" min="0" max="100" step="5" aria-label="${esc(t('regionwatch.label.volume'))}"></label>
        <label class="btn btn-ghost rw-file">${esc(t('regionwatch.btn.sounds'))}<input type="file" id="rwSoundFile" accept="audio/*" multiple hidden aria-label="${esc(t('regionwatch.btn.sounds'))}"></label>
        <span class="tool-hint" id="rwSounds"></span>
        <span class="tool-hint">${esc(t('regionwatch.hint.hotkey'))}</span>
      </div>
      <div class="rw-grid">
        <div class="rw-left">
          <canvas id="rwPreview" class="rw-preview"></canvas>
          <div class="tool-hint" id="rwHint">${esc(t('regionwatch.hint.idle'))}</div>
        </div>
        <div class="rw-right">
          <div class="rw-right" id="rwSlots">${slotRows}</div>
          <div class="tool-actions tight"><button class="btn btn-ghost btn-sm" id="rwAddSlot">${esc(t('regionwatch.btn.addSlot'))}</button></div>
        </div>
      </div>
      <div class="rw-trend" id="rwTrend" hidden>
        <div class="rw-trend-head">
          <label class="tool-sublabel">${esc(t('regionwatch.label.window'))}
            <select id="rwWindow" aria-label="${esc(t('regionwatch.label.window'))}">
              <option value="300">5</option><option value="900">15</option><option value="3600">60</option>
            </select>
          </label>
        </div>
        <div class="rw-trend-rows" id="rwTrendRows"></div>
        <canvas id="rwChart" class="rw-chart" width="900" height="160"></canvas>
      </div>
      <div class="tool-status" id="rwStatus">${esc(t('regionwatch.status.idle'))}</div>
      <div class="tool-hint" id="rwRate"></div>
      <div class="tool-hint" id="rwProfile"></div>
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
    const addSlotBtn = $<HTMLButtonElement>('#rwAddSlot');
    const soundFile = $<HTMLInputElement>('#rwSoundFile');
    const soundsEl = $<HTMLElement>('#rwSounds');
    const rateEl = $<HTMLElement>('#rwRate');
    const profileEl = $<HTMLElement>('#rwProfile');
    const trendBox = $<HTMLElement>('#rwTrend');
    const trendRows = $<HTMLElement>('#rwTrendRows');
    const windowSel = $<HTMLSelectElement>('#rwWindow');
    const chart = $<HTMLCanvasElement>('#rwChart');
    const cctx = chart.getContext('2d') as CanvasRenderingContext2D;
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

    const slots: Slot[] = Array.from({ length: SLOTS_MIN }, (_, i) => newSlot(i));
    let savedSize: [number, number] = [0, 0];
    let vol = 0.7;

    /* 도는 동안의 상태 */
    let stream: MediaStream | null = null;
    let capture: CaptureHandle | null = null;
    let lastCheck = 0;
    let lastRead = 0;
    let picking = -1;
    let drag: { x0: number; y0: number; x1: number; y1: number } | null = null;
    const edge: EdgeState[] = Array.from({ length: SLOTS_MIN }, () => ({ wasHit: false, firedAt: -1e9 }));
    const count: CountState[] = Array.from({ length: SLOTS_MIN }, () => ({ last: null, streak: 0, firedAt: -1e9, done: false }));
    const lastSim: number[] = new Array(SLOTS_MIN).fill(-1);
    /* 기준을 찍은 직후나 시작 직후의 첫 판정은 상태만 맞추고 침묵. 기준은 지금 모습이라 늘 같음 */
    const primed: boolean[] = new Array(SLOTS_MIN).fill(false);
    const pending: Array<number | null> = new Array(SLOTS_MIN).fill(null);
    let pip: PipPanel | null = null;
    let ocr: DigitReader | null = null;
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
      pip?.setFooter(text);
    }

    /* ── 저장, 복구 ───────────────────────────────────────── */
    let profiles: Record<string, SavedSlot[]> = {};
    let profileKey = '';

    const pack = (): SavedSlot[] => slots.map((s) => ({ ...s, ref: s.ref ? btoa(String.fromCharCode(...Array.from(s.ref))) : null }));
    function unpack(list: SavedSlot[]): void {
      while (slots.length < Math.min(list.length, SLOTS_MAX)) addSlot();
      list.slice(0, SLOTS_MAX).forEach((s, i) => {
        const ref = s.ref ? Uint8ClampedArray.from(atob(s.ref), (c) => c.charCodeAt(0)) : null;
        slots[i] = { ...newSlot(i), ...s, ref };
      });
    }

    function paintProfile(): void {
      const n = Object.keys(profiles).length;
      profileEl.textContent = profileKey ? t('regionwatch.label.profile').replace('{size}', profileKey).replace('{n}', String(n)) : '';
    }

    function save(): void {
      const packed = pack();
      if (profileKey) profiles[profileKey] = packed;
      const data: Saved = { sw: src.width, sh: src.height, volume: vol, notify: notifyBox.checked, slots: packed, profiles };
      try {
        localStorage.setItem(STORE, JSON.stringify(data));
      } catch {
        /* 저장 공간 부족. 도는 데는 지장 없음 */
      }
      paintProfile();
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
        profiles = d.profiles && typeof d.profiles === 'object' ? d.profiles : {};
        if (d.slots) unpack(d.slots);
      } catch {
        /* 옛 저장이 깨졌으면 새로 시작 */
      }
    }

    /* 화면 크기를 알게 된 순간. 그 크기의 프로필이 있으면 슬롯을 통째로 교체 */
    function enterProfile(w: number, h: number): void {
      profileKey = `${w}x${h}`;
      const mine = profiles[profileKey];
      if (mine) {
        unpack(mine);
        for (let i = 0; i < slots.length; i++) resetState(i);
        say(t('regionwatch.say.profile').replace('{size}', profileKey).replace('{n}', String(mine.filter((s) => s.rect).length)), 'ok');
      } else if (savedSize[0] && (savedSize[0] !== w || savedSize[1] !== h)) {
        say(t('regionwatch.warn.size').replace('{a}', `${savedSize[0]}x${savedSize[1]}`).replace('{b}', profileKey), 'error');
      }
      savedSize = [w, h];
      save();
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
      (el.querySelector('[data-k="target"]') as HTMLInputElement).value = s.target === null ? '' : String(s.target);
      (el.querySelector('[data-k="idleSec"]') as HTMLInputElement).value = String(s.idleSec);
      (el.querySelector('[data-k="sound"]') as HTMLSelectElement).value = s.sound;
      (el.querySelector('[data-k="rearm"]') as HTMLInputElement).value = String(s.rearm);
      (el.querySelector('[data-k="randomDelay"]') as HTMLInputElement).checked = s.randomDelay;
      const pick = el.querySelector('[data-act="pick"]') as HTMLButtonElement;
      pick.textContent = s.rect ? `${s.rect.w}x${s.rect.h}` : t('regionwatch.btn.pick');
      pick.classList.toggle('is-on', picking === i);
      const thumb = el.querySelector('.rw-thumb') as HTMLElement;
      thumb.innerHTML = s.thumb ? `<img src="${s.thumb}" alt="">` : '';
      (el.querySelector('[data-act="ref"]') as HTMLButtonElement).disabled = !s.rect || !stream || s.mode === 'count' || s.mode === 'trend';
      el.classList.toggle('is-off', !s.enabled);
      el.classList.toggle('is-count', s.mode === 'count');
      el.classList.toggle('is-trend', s.mode === 'trend');
    }

    function paintSim(i: number, sim: number, hit: boolean, label?: string): void {
      const el = slotEl(i).querySelector('.rw-sim') as HTMLElement;
      const bar = el.querySelector('i') as HTMLElement;
      const txt = el.querySelector('b') as HTMLElement;
      const text = label ?? (sim < 0 ? '-' : Math.round(sim * 100) + '%');
      bar.style.width = sim < 0 ? '0' : Math.round(clamp(sim, 0, 1) * 100) + '%';
      txt.textContent = text;
      el.classList.toggle('is-hit', hit);
      pip?.setRow(i, text, hit);
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
        if ((s.mode === 'count' || s.mode === 'trend') && stream) void ensureOcr();
        trend[i] = newTrend();
        paintTrend(performance.now() / 1000);
      } else if (k === 'threshold') {
        s.threshold = clamp(Number(target.value) / 100, 0.5, 0.99);
        (el.querySelector('[data-o="threshold"]') as HTMLOutputElement).value = target.value + '%';
      } else if (k === 'lead') s.lead = clamp(Number(target.value) || 0, 0, 3600);
      else if (k === 'target') s.target = target.value.trim() === '' ? null : Number(target.value);
      else if (k === 'idleSec') s.idleSec = clamp(Number(target.value) || 0, 0, 86400);
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
        for (let j = 0; j < slots.length; j++) paintSlot(j);
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
      hint.textContent = s.mode === 'count' ? t('regionwatch.hint.count') : s.mode === 'trend' ? t('regionwatch.hint.trend') : t('regionwatch.hint.running');
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
        if (s.mode === 'count' || s.mode === 'trend') return;
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
    function ensureOcr(): Promise<DigitReader | null> {
      if (ocr) return Promise.resolve(ocr);
      return ensureDigitReader((state, detail) => {
        if (state === 'loading') say(t('regionwatch.ocr.loading'));
        else if (state === 'ready') say(t('regionwatch.ocr.ready'), 'ok');
        else say(t('regionwatch.ocr.fail') + (detail || ''), 'error');
      }).then((r) => {
        ocr = r;
        return r;
      });
    }

    async function readCounts(now: number): Promise<void> {
      if (reading) return;
      const targets = slots.map((s, i) => ({ s, i })).filter(({ s }) => (s.mode === 'count' || s.mode === 'trend') && s.enabled && s.rect);
      if (!targets.length) return;
      const w = await ensureOcr();
      if (!w || !stream) return;
      reading = true;
      try {
        for (const { s, i } of targets) {
          if (!stream || !s.rect) break;
          prepareForOcr(src, s.rect, ocrCanvas, ocrCtx);
          const text = await w.recognize(ocrCanvas);
          bump('reads', performance.now());
          if (s.mode === 'trend') {
            const value = parseNumber(text);
            window.dispatchEvent(new CustomEvent('regionwatch:read', { detail: { slot: i, text: text.trim(), secs: null, value } }));
            onTrendReading(i, value, now);
            continue;
          }
          const secs = parseSeconds(text);
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

    /* ── 추세 기록 ────────────────────────────────────────── */
    interface TrendState {
      samples: Sample[];
      gate: GateState;
      startT: number;
      startV: number | null;
      lastV: number | null;
      idleFired: boolean;
      targetFired: boolean;
      foldedAt: number;
    }
    const newTrend = (): TrendState => ({ samples: [], gate: { recent: [], pendingCount: 0, pendingValue: null }, startT: 0, startV: null, lastV: null, idleFired: false, targetFired: false, foldedAt: 0 });
    const trend: TrendState[] = Array.from({ length: SLOTS_MIN }, newTrend);

    /* 슬롯 하나 더. 상태 배열 전부 같이 자란다. 최대 SLOTS_MAX */
    function addSlot(): boolean {
      if (slots.length >= SLOTS_MAX) return false;
      const i = slots.length;
      slots.push(newSlot(i));
      edge.push({ wasHit: false, firedAt: -1e9 });
      count.push({ last: null, streak: 0, firedAt: -1e9, done: false });
      lastSim.push(-1);
      primed.push(false);
      pending.push(null);
      trend.push(newTrend());
      slotsBox.insertAdjacentHTML('beforeend', slotRowHtml(i));
      paintSlot(i);
      addSlotBtn.disabled = slots.length >= SLOTS_MAX;
      return true;
    }
    let windowSec = 300;
    const trendSlots = (): number[] => slots.map((s, i) => (s.mode === 'trend' && s.enabled && s.rect ? i : -1)).filter((i) => i >= 0);
    const fmtNum = (v: number): string => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : String(Math.round(v * 100) / 100));

    function onTrendReading(i: number, raw: number | null, now: number): void {
      const s = slots[i];
      const st = trend[i];
      const sec = now / 1000;
      const g = gateReading(st.gate, raw);
      st.gate = g.state;
      if (g.accepted !== null) {
        if (st.startV === null) {
          st.startV = g.accepted;
          st.startT = sec;
        }
        st.samples.push({ t: sec, v: g.accepted });
        st.lastV = g.accepted;
        if (sec - st.foldedAt > 60) {
          st.samples = foldSamples(st.samples, sec);
          st.foldedAt = sec;
        }
        if (s.target !== null && !st.targetFired) {
          const dir = st.startV !== null && s.target < st.startV ? -1 : 1;
          if ((dir > 0 && g.accepted >= s.target) || (dir < 0 && g.accepted <= s.target)) {
            st.targetFired = true;
            fire(i, { value: g.accepted, reason: 'target' });
          }
        }
      }
      const idle = s.idleSec > 0 && isIdle(st.samples, sec, s.idleSec);
      if (idle && !st.idleFired) {
        st.idleFired = true;
        fire(i, { value: st.lastV, reason: 'idle' });
      } else if (!idle) st.idleFired = false;
      paintTrend(sec);
    }

    function metricsOf(i: number, sec: number): { now: number | null; perMin: number | null; eta: number | null; idle: boolean } {
      const s = slots[i];
      const st = trend[i];
      const k = slopePerSec(st.samples, windowSec, sec);
      const perMin = k === null ? null : k * 60;
      const eta = st.lastV === null || s.target === null ? null : secondsToTarget(st.lastV, s.target, k);
      return { now: st.lastV, perMin, eta, idle: s.idleSec > 0 && isIdle(st.samples, sec, s.idleSec) };
    }

    function paintTrend(sec: number): void {
      const ids = trendSlots();
      trendBox.hidden = ids.length === 0;
      if (!ids.length) return;
      const rows = ids.map((i) => {
        const s = slots[i];
        const m = metricsOf(i, sec);
        const st = trend[i];
        const since = st.startV === null || st.lastV === null ? '' : `${esc(t('regionwatch.trend.since'))} ${formatDuration(sec - st.startT)}, ${st.lastV - st.startV >= 0 ? '+' : ''}${fmtNum(st.lastV - st.startV)}`;
        const etaText = m.eta === null ? '-' : m.eta === 0 ? '0' : formatDuration(m.eta);
        const label = m.now === null ? t('regionwatch.trend.none') : `${fmtNum(m.now)} (${m.perMin === null ? '-' : (m.perMin >= 0 ? '+' : '') + fmtNum(m.perMin)}/${t('regionwatch.trend.perMin')})`;
        paintSim(i, m.now === null ? -1 : 0.5, m.idle, label);
        return `<div class="rw-trend-row${m.idle ? ' is-idle' : ''}" data-i="${i}">
          <b>${esc(s.name)}</b>
          <span><i>${esc(t('regionwatch.trend.now'))}</i> ${m.now === null ? '-' : fmtNum(m.now)}</span>
          <span><i>${esc(t('regionwatch.trend.perMin'))}</i> ${m.perMin === null ? '-' : (m.perMin >= 0 ? '+' : '') + fmtNum(m.perMin)}</span>
          <span><i>${esc(t('regionwatch.trend.perHour'))}</i> ${m.perMin === null ? '-' : (m.perMin >= 0 ? '+' : '') + fmtNum(m.perMin * 60)}</span>
          <span><i>${esc(t('regionwatch.trend.eta'))}</i> ${etaText}</span>
          ${m.idle ? `<span class="rw-idle">${esc(t('regionwatch.trend.idle'))}</span>` : ''}
          <span class="rw-since">${since}</span>
          <button class="btn btn-sm btn-ghost" data-tact="segment">${esc(t('regionwatch.btn.segment'))}</button>
          <button class="btn btn-sm btn-ghost" data-tact="csv">${esc(t('regionwatch.btn.csv'))}</button>
        </div>`;
      });
      trendRows.innerHTML = rows.join('');
      if (!document.hidden) paintChart(ids, sec);
      window.dispatchEvent(new CustomEvent('regionwatch:trend', { detail: ids.map((i) => ({ slot: i, ...metricsOf(i, sec) })) }));
    }

    function paintChart(ids: number[], sec: number): void {
      const W = chart.width;
      const H = chart.height;
      cctx.clearRect(0, 0, W, H);
      const from = sec - windowSec;
      const colors = ['#a99bf5', '#3ddc84', '#ffb020', '#4ea1ff', '#ff5d5d', '#e6e6e6'];
      ids.forEach((i, n) => {
        const pts = trend[i].samples.filter((p) => p.t >= from);
        if (pts.length < 2) return;
        let lo = Infinity;
        let hi = -Infinity;
        for (const p of pts) {
          lo = Math.min(lo, p.v);
          hi = Math.max(hi, p.v);
        }
        if (hi === lo) hi = lo + 1;
        const x = (tt: number): number => ((tt - from) / windowSec) * (W - 20) + 10;
        const y = (v: number): number => H - 10 - ((v - lo) / (hi - lo)) * (H - 20);
        cctx.strokeStyle = colors[n % colors.length];
        cctx.lineWidth = 2;
        cctx.beginPath();
        pts.forEach((p, k) => (k ? cctx.lineTo(x(p.t), y(p.v)) : cctx.moveTo(x(p.t), y(p.v))));
        cctx.stroke();
        const target = slots[i].target;
        if (target !== null && target >= lo && target <= hi) {
          cctx.setLineDash([4, 3]);
          cctx.beginPath();
          cctx.moveTo(10, y(target));
          cctx.lineTo(W - 10, y(target));
          cctx.stroke();
          cctx.setLineDash([]);
        }
      });
    }

    trendRows.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest('[data-tact]') as HTMLButtonElement | null;
      if (!btn) return;
      const i = Number((btn.closest('.rw-trend-row') as HTMLElement).dataset.i);
      const st = trend[i];
      if (btn.dataset.tact === 'segment') {
        const fresh = newTrend();
        fresh.gate = st.gate;
        fresh.lastV = st.lastV;
        if (st.lastV !== null) {
          fresh.startV = st.lastV;
          fresh.startT = performance.now() / 1000;
          fresh.samples = [{ t: fresh.startT, v: st.lastV }];
        }
        trend[i] = fresh;
        say(t('regionwatch.say.segment').replace('{name}', slots[i].name).replace('{value}', st.lastV === null ? '-' : fmtNum(st.lastV)), 'ok');
        paintTrend(performance.now() / 1000);
      } else if (btn.dataset.tact === 'csv') {
        const base = Date.now() - performance.now();
        const lines = ['time,value', ...st.samples.map((p) => `${new Date(base + p.t * 1000).toISOString()},${p.v}`)];
        download(new Blob([lines.join('\n')], { type: 'text/csv' }), `${slots[i].name}-${new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}.csv`);
      }
    });
    windowSel.onchange = (): void => {
      windowSec = Number(windowSel.value) || 300;
      paintTrend(performance.now() / 1000);
    };

    function fire(i: number, detail: { sim?: number; secs?: number | null; value?: number | null; reason?: 'target' | 'idle' }): void {
      const s = slots[i];
      const delay = s.randomDelay ? Math.random() * MAX_DELAY_MS : 0;
      if (pending[i] !== null) window.clearTimeout(pending[i] as number);
      pending[i] = window.setTimeout(() => {
        pending[i] = null;
        play(s.sound, vol);
        const msg =
          detail.reason === 'target'
            ? t('regionwatch.say.target').replace('{name}', s.name).replace('{target}', s.target === null ? '' : fmtNum(s.target))
            : detail.reason === 'idle'
              ? t('regionwatch.say.idle').replace('{name}', s.name).replace('{sec}', String(s.idleSec))
              : detail.secs !== undefined && detail.secs !== null
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
        enterProfile(w, h);
        for (let i = 0; i < slots.length; i++) paintSlot(i);
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
      if (!displayCaptureSupported()) {
        say(t('regionwatch.err.unsupported'), 'error');
        return;
      }
      const c = await startDisplayCapture({
        frameRate: 10,
        tickMs: CHECK_MS,
        onFrame: (f) => onFrame(() => f.draw(sctx), f.width, f.height),
        onEnded: () => stop()
      });
      if (!c) {
        say(t('regionwatch.err.notStarted'));
        return;
      }
      capture = c;
      stream = c.stream;
      startBtn.disabled = true;
      stopBtn.disabled = false;
      pipBtn.disabled = !pipSupported();
      hint.textContent = t('regionwatch.hint.running');
      say(t('regionwatch.say.running'), 'ok');
      if (notifyBox.checked && typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => undefined);
      }
      lastCheck = 0;
      lastRead = 0;
      for (let i = 0; i < slots.length; i++) resetState(i);
      if (slots.some((x) => (x.mode === 'count' || x.mode === 'trend') && x.enabled)) void ensureOcr();
    }

    function stop(): void {
      capture?.stop();
      capture = null;
      stream = null;
      pending.forEach((p, i) => {
        if (p !== null) window.clearTimeout(p);
        pending[i] = null;
      });
      startBtn.disabled = false;
      stopBtn.disabled = true;
      pipBtn.disabled = true;
      picking = -1;
      drag = null;
      for (let i = 0; i < slots.length; i++) {
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
      for (let i = 0; i < slots.length; i++) trend[i] = newTrend();
      trendBox.hidden = true;
      closePip();
    }

    /* ── 떠 있는 창 ───────────────────────────────────────── */
    async function openPip(): Promise<void> {
      if (!pipSupported()) return;
      const rows = slots.map((s, i) => ({
        label: s.name,
        value: lastSim[i] < 0 ? '-' : Math.round(lastSim[i] * 100) + '%',
        dim: !s.enabled || !s.rect
      }));
      const panel = await openPipPanel(rows, rateEl.textContent || '', () => {
        pip = null;
        pipBtn.classList.remove('is-on');
      });
      if (!panel) {
        say(t('regionwatch.err.pip'), 'error');
        return;
      }
      pip = panel;
    }

    function closePip(): void {
      pip?.close();
      pip = null;
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
    addSlotBtn.onclick = (): void => {
      if (addSlot()) save();
    };

    function paintSounds(): void {
      const names = CUSTOM_SOUNDS.map((k, n) => (soundNames.has(k) ? `${n + 1}: ${soundNames.get(k)}` : '')).filter(Boolean);
      soundsEl.textContent = names.join(', ');
    }
    soundFile.onchange = (): void => {
      const files = Array.from(soundFile.files || []).slice(0, CUSTOM_SOUNDS.length);
      soundFile.value = '';
      void (async () => {
        let saved = 0;
        for (let n = 0; n < files.length; n++) {
          const f = files[n];
          if (f.size > SOUND_MAX_BYTES) {
            say(t('regionwatch.err.soundTooBig').replace('{name}', f.name), 'error');
            continue;
          }
          if (await saveSound(CUSTOM_SOUNDS[n], f)) saved++;
          else say(t('regionwatch.err.soundBad').replace('{name}', f.name), 'error');
        }
        paintSounds();
        if (saved) say(t('regionwatch.say.soundsSaved').replace('{n}', String(saved)), 'ok');
      })();
    };

    /* 단축키. 이 탭이 앞에 있을 때만 (브라우저 페이지는 전역 단축키를 못 받는다) */
    const onKey = (ev: KeyboardEvent): void => {
      if (!ev.altKey || !ev.shiftKey) return;
      const tag = (ev.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (ev.code === 'KeyS') {
        ev.preventDefault();
        if (stream) stop();
        else startBtn.click();
      } else if (ev.code === 'KeyP' && !pipBtn.disabled) {
        ev.preventDefault();
        pipBtn.click();
      }
    };
    window.addEventListener('keydown', onKey);
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
    void loadSounds().then(paintSounds);
    addSlotBtn.disabled = slots.length >= SLOTS_MAX;
    volume.value = String(Math.round(vol * 100));
    for (let i = 0; i < slots.length; i++) paintSlot(i);
    relayout();

    Toolbox.onDispose?.(() => {
      ro?.disconnect();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
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
      .rw-preview{width:100%;height:auto;display:block;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:var(--radius-md);cursor:crosshair}
      .rw-right{display:grid;gap:6px;align-content:start}
      .rw-slot{border:1px solid var(--border);border-radius:var(--radius-md);padding:6px 8px;display:grid;gap:6px}
      .rw-slot.is-off{opacity:.5}
      .rw-slot-head,.rw-slot-body{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
      .rw-if-edge,.rw-if-count,.rw-if-trend{display:contents}
      .rw-slot.is-count .rw-if-edge,.rw-slot.is-trend .rw-if-edge,.rw-slot:not(.is-count) .rw-if-count,.rw-slot:not(.is-trend) .rw-if-trend{display:none}
      .rw-target{width:8em}
      .rw-trend{margin-top:var(--space-md,12px);display:grid;gap:6px}
      .rw-trend[hidden]{display:none}
      .rw-trend-head{display:flex;gap:8px;align-items:center}
      .rw-trend-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font:12px var(--font-mono);padding:4px 8px;border:1px solid var(--border);border-radius:var(--radius-sm)}
      .rw-trend-row i{font-style:normal;color:var(--text-tertiary);margin-right:4px}
      .rw-trend-row.is-idle{border-color:var(--accent)}
      .rw-trend-row .rw-idle{color:var(--accent-ink,var(--accent))}
      .rw-trend-row .rw-since{color:var(--text-tertiary);flex:1 1 auto}
      .rw-chart{width:100%;height:auto;display:block;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:var(--radius-md)}
      .rw-name{width:7em}
      .rw-rearm{width:4.5em}
      .rw-thumb{display:inline-block;width:32px;height:24px;border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;background:var(--bg-tertiary)}
      .rw-thumb img{width:100%;height:100%;object-fit:contain;display:block}
      .rw-sim{position:relative;flex:1 1 60px;min-width:60px;height:16px;border-radius:var(--radius-sm);background:var(--bg-tertiary);overflow:hidden;font:11px var(--font-mono);text-align:right}
      .rw-sim i{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--accent);opacity:.35;transition:width .2s}
      .rw-sim b{position:relative;padding:0 6px;line-height:16px;color:var(--text-primary)}
      .rw-sim.is-hit i{opacity:.8}
      .rw-slot-body input[type=range]{flex:1 1 80px;min-width:80px}
      .rw-vol input[type=range]{width:90px;vertical-align:middle}
      .rw-file{cursor:pointer}
    `;
    document.head.appendChild(st);
  }
})();
