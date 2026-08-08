/**
 * ORBITA — MIDI COLOR SEQUENCER (TASK-KL-193)
 *
 * 순서를 **줄**이 아니라 **궤도**로 적는다. 고리마다 자기 속도로 행성이 돌고,
 * 12시 방향의 자오선(meridian)을 지나는 순간 소리가 난다. 고리마다 칸 수와 속도가
 * 다르므로 폴리리듬이 그냥 나온다 — 박자를 세지 않아도 어긋난 박자가 만들어진다.
 *
 * **색이 곧 음高**다. 팔레트에서 색을 집어 궤도에 찍으면 그 색의 음이 난다.
 * 그래서 화면을 보면 무슨 소리가 날지 읽힌다 (악보를 못 읽어도).
 *
 * 소리는 두 군데로 나간다:
 *   ① 브라우저 자체 신시사이저 (WebAudio) — 아무 장비 없이 바로 들린다
 *   ② Web MIDI 출력 — 장비/DAW 를 붙이면 그쪽이 연주한다 (고리 = MIDI 채널)
 *
 * 시간은 **오디오 시계**로 잡는다 (setInterval 로 소리를 내면 흔들린다).
 * 25ms 마다 깨어나 100ms 앞을 미리 예약하는 lookahead 스케줄러다.
 */
(function (): void {
  /* ── Web MIDI — lib.dom 의 타입을 쓴다. `requestMIDIAccess` 는 없는 브라우저가 있어
   *    Navigator 에서 optional 로 받아 존재를 먼저 확인한다. ───────────────── */
  type MidiPortLike = MIDIOutput;
  type MidiAccessLike = MIDIAccess;
  type NavigatorWithMidi = Navigator & {
    requestMIDIAccess?: (opts?: MIDIOptions) => Promise<MIDIAccess>;
  };

  /* ── 음계 ────────────────────────────────────────────────────────────────── */
  const SCALES: Array<{ id: string; label: string; steps: number[] }> = [
    { id: 'major', label: '메이저', steps: [0, 2, 4, 5, 7, 9, 11] },
    { id: 'minor', label: '내추럴 마이너', steps: [0, 2, 3, 5, 7, 8, 10] },
    { id: 'dorian', label: '도리안', steps: [0, 2, 3, 5, 7, 9, 10] },
    { id: 'penta', label: '펜타토닉', steps: [0, 3, 5, 7, 10] },
    { id: 'hexa', label: '온음 (whole tone)', steps: [0, 2, 4, 6, 8, 10] },
    { id: 'hirajoshi', label: '히라조시 (和)', steps: [0, 2, 3, 7, 8] }
  ];
  const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const WAVES: OscillatorType[] = ['triangle', 'sine', 'square', 'sawtooth'];
  const WAVE_LABEL: Record<string, string> = { triangle: '삼각', sine: '사인', square: '사각', sawtooth: '톱니' };

  /* ── 모델 ────────────────────────────────────────────────────────────────── */
  interface Slot {
    deg: number; // 음계 안 몇 번째 음인가 (색 = 이 값)
    vel: number; // 0.15 ~ 1
  }
  interface Ring {
    steps: number;
    rate: number; // 한 마디에 몇 바퀴 도는가 (폴리리듬의 정체)
    octave: number;
    wave: OscillatorType;
    channel: number; // MIDI 채널 1-16
    muted: boolean;
    slots: Array<Slot | null>;
  }
  interface Song {
    bpm: number;
    root: number;
    scale: string;
    rings: Ring[];
  }

  const STORE_KEY = 'karmolab_orbita_song_v1';
  const BEATS_PER_BAR = 4;

  function ring(steps: number, rate: number, octave: number, wave: OscillatorType, channel: number): Ring {
    return { steps, rate, octave, wave, channel, muted: false, slots: new Array(steps).fill(null) };
  }

  function defaultSong(): Song {
    const s: Song = {
      bpm: 96,
      root: 9, // A
      scale: 'hirajoshi',
      rings: [
        ring(16, 1, 5, 'triangle', 1),
        ring(12, 1, 4, 'sine', 2),
        ring(8, 1, 4, 'square', 3),
        ring(6, 0.5, 3, 'sawtooth', 4)
      ]
    };
    // 빈 화면으로 시작하지 않는다 — 열자마자 뭔가 돌고 있어야 「해보고 싶다」가 된다.
    s.rings[0].slots[0] = { deg: 0, vel: 0.9 };
    s.rings[0].slots[3] = { deg: 2, vel: 0.6 };
    s.rings[0].slots[6] = { deg: 4, vel: 0.7 };
    s.rings[0].slots[11] = { deg: 3, vel: 0.5 };
    s.rings[1].slots[0] = { deg: 0, vel: 0.8 };
    s.rings[1].slots[5] = { deg: 3, vel: 0.6 };
    s.rings[1].slots[8] = { deg: 1, vel: 0.7 };
    s.rings[2].slots[2] = { deg: 4, vel: 0.8 };
    s.rings[2].slots[6] = { deg: 2, vel: 0.6 };
    s.rings[3].slots[0] = { deg: 0, vel: 1 };
    s.rings[3].slots[4] = { deg: 1, vel: 0.7 };
    return s;
  }

  Mdd.injectCSS(
    'orbita',
    `
    .orbita { display:flex; flex-direction:column; gap:var(--space-md); }
    /* 궤도는 **정원**이어야 한다. 폭만 100% 로 두면 aspect-ratio 가 높이를 폭에 맞추고
       max-height 가 그걸 잘라 납작한 상자가 된다(실제로 그렇게 나왔다). 폭부터 묶는다. */
    .orbita-stage {
      position:relative; width:min(100%, 620px, 62vh); aspect-ratio:1/1;
      margin:0 auto; border:1px solid var(--border); border-radius:var(--radius-xl);
      background:
        radial-gradient(ellipse 70% 55% at 50% 40%, rgba(120,100,230,0.13), transparent 72%),
        var(--bg-void);
      overflow:hidden; touch-action:none;
    }
    .orbita-stage canvas { display:block; width:100%; height:100%; cursor:crosshair; }
    .orbita-hint {
      position:absolute; left:12px; bottom:10px; pointer-events:none;
      font-size:var(--font-size-2xs); color:var(--text-tertiary); letter-spacing:.02em;
    }
    .orbita-panel {
      display:flex; flex-wrap:wrap; align-items:center; gap:var(--space-sm);
      padding:var(--space-sm) var(--space-md); border:1px solid var(--border);
      border-radius:var(--radius-lg); background:var(--bg-secondary);
    }
    .orbita-panel label { font-size:var(--font-size-2xs); color:var(--text-tertiary); letter-spacing:.06em; text-transform:uppercase; }
    /* 셸의 폼 스타일이 select 를 100% 로 늘린다 (form 화면 기준). 여기는 한 줄에 여럿을
       놓는 계기판이라 폭을 되찾아야 한다 — 안 그러면 컨트롤 하나가 한 줄을 차지한다. */
    .orbita-panel select, .orbita-panel input[type=number],
    .orbita-ring-row select {
      width:auto; min-width:0; flex:0 0 auto; margin:0;
      background:var(--bg-primary); color:var(--text-primary); border:1px solid var(--border);
      border-radius:var(--radius-md); padding:4px 6px; font-size:var(--font-size-2xs); font-family:var(--font-mono);
    }
    .orbita-panel input[type=range] { accent-color:var(--accent); width:120px; flex:0 0 auto; margin:0; }
    .orbita-panel label, .orbita-ring-row label { margin:0; flex:0 0 auto; }
    .orbita-panel #orbitaMidi { flex:1 1 200px; max-width:320px; }
    .orbita-btn {
      background:var(--bg-tertiary); color:var(--text-primary); border:1px solid var(--border);
      border-radius:var(--radius-md); padding:6px 12px; cursor:pointer;
      font-size:var(--font-size-2xs); font-family:var(--font-mono); letter-spacing:.06em;
      transition:background var(--transition-fast), border-color var(--transition-fast);
    }
    .orbita-btn:hover { background:var(--bg-hover); border-color:var(--border-hover); }
    .orbita-btn.is-on { background:var(--accent-dim); border-color:var(--border-strong); color:var(--accent-hover); }
    .orbita-transport { min-width:92px; font-weight:600; }
    .orbita-readout { font-family:var(--font-mono); font-size:var(--font-size-2xs); color:var(--text-secondary); min-width:56px; text-align:right; }
    .orbita-swatches { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
    .orbita-sw {
      width:30px; height:30px; border-radius:50%; border:2px solid transparent; cursor:pointer;
      padding:0; position:relative; transition:transform var(--transition-fast);
    }
    .orbita-sw:hover { transform:scale(1.12); }
    .orbita-sw[aria-pressed="true"] { border-color:var(--text-primary); box-shadow:0 0 0 3px rgba(242,242,238,.10); }
    .orbita-rings { display:flex; flex-direction:column; gap:6px; }
    .orbita-ring-row {
      display:flex; flex-wrap:wrap; align-items:center; gap:var(--space-sm);
      padding:6px var(--space-sm); border:1px solid var(--border); border-radius:var(--radius-md);
      background:var(--bg-primary);
    }
    .orbita-ring-dot { width:12px; height:12px; border-radius:50%; flex:none; }
    .orbita-ring-name { font-family:var(--font-mono); font-size:var(--font-size-2xs); color:var(--text-secondary); min-width:58px; }
    .orbita-midi { font-size:var(--font-size-2xs); color:var(--text-tertiary); }
    `
  );

  Toolbox.register({
    ...(Toolbox.getLazyWidgetPublicMeta ? Toolbox.getLazyWidgetPublicMeta('orbita') : {}),
    id: 'orbita',
    title: 'ORBITA',
    category: 'lab',
    desc: '궤도에 색을 찍어 만드는 폴리리듬 시퀀서 — 브라우저 신스 + MIDI 출력',
    layout: 'full',
    icon: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".5"/><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".8"/><circle cx="12" cy="3" r="1.8" fill="currentColor"/><circle cx="17" cy="12" r="1.4" fill="currentColor"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/>',
    tabs: [
      {
        id: 'app',
        label: 'ORBITA',
        build: function (container: HTMLElement): void {
          /* ── 상태 ───────────────────────────────────────────────────────── */
          let song: Song = defaultSong();
          try {
            const raw = localStorage.getItem(STORE_KEY);
            if (raw) {
              const parsed = JSON.parse(raw) as Song;
              // 저장본을 그대로 믿지 않는다 — 칸 수와 배열 길이가 어긋나면 그리다 죽는다.
              if (parsed && Array.isArray(parsed.rings) && parsed.rings.length) {
                for (const r of parsed.rings) {
                  if (!Array.isArray(r.slots)) r.slots = [];
                  r.slots.length = r.steps;
                  for (let i = 0; i < r.steps; i++) if (r.slots[i] === undefined) r.slots[i] = null;
                }
                song = parsed;
              }
            }
          } catch (_) {
            /* 저장본이 깨졌으면 기본곡으로 간다 — 여기서 멈추면 도구가 안 열린다 */
          }

          let scaleSteps = (SCALES.find((s) => s.id === song.scale) || SCALES[0]).steps;
          let brushDeg = 0;
          let brushVel = 0.8;
          let playing = false;

          const save = (): void => {
            try {
              localStorage.setItem(STORE_KEY, JSON.stringify(song));
            } catch (_) {
              /* 사생활 모드 등 — 저장 못 해도 연주는 계속된다 */
            }
          };

          const hueOf = (deg: number): number => (deg / Math.max(1, scaleSteps.length)) * 300;
          const colorOf = (deg: number, a = 1): string =>
            a >= 1 ? `hsl(${hueOf(deg)} 90% 64%)` : `hsla(${hueOf(deg)} 90% 64% / ${a})`;
          const midiNote = (r: Ring, deg: number): number =>
            12 * (r.octave + 1) + song.root + scaleSteps[((deg % scaleSteps.length) + scaleSteps.length) % scaleSteps.length];
          const barDur = (): number => (60 / song.bpm) * BEATS_PER_BAR;

          /* ── 화면 ───────────────────────────────────────────────────────── */
          container.innerHTML = `
            <div class="orbita">
              <div class="orbita-stage">
                <canvas id="orbitaCanvas"></canvas>
                <div class="orbita-hint">클릭 = 찍기 · 위아래 드래그 = 음 바꾸기 · 휠 = 세기 · Shift+클릭 = 지우기</div>
              </div>

              <div class="orbita-panel">
                <button type="button" class="orbita-btn orbita-transport" id="orbitaPlay">▶ PLAY</button>
                <label for="orbitaBpm">BPM</label>
                <input type="range" id="orbitaBpm" min="40" max="200" step="1" aria-label="템포 (BPM)">
                <span class="orbita-readout" id="orbitaBpmOut"></span>
                <label for="orbitaRoot">ROOT</label>
                <select id="orbitaRoot" aria-label="으뜸음"></select>
                <label for="orbitaScale">SCALE</label>
                <select id="orbitaScale" aria-label="음계"></select>
                <button type="button" class="orbita-btn" id="orbitaRandom">✦ 흩뿌리기</button>
                <button type="button" class="orbita-btn" id="orbitaClear">비우기</button>
              </div>

              <div class="orbita-panel">
                <label>COLOR = PITCH</label>
                <div class="orbita-swatches" id="orbitaSwatches"></div>
                <label for="orbitaVel">세기</label>
                <input type="range" id="orbitaVel" min="15" max="100" step="5" aria-label="찍을 음의 세기">
              </div>

              <div class="orbita-rings" id="orbitaRings"></div>

              <div class="orbita-panel">
                <label for="orbitaMidi">MIDI OUT</label>
                <select id="orbitaMidi" aria-label="MIDI 출력 장치"></select>
                <span class="orbita-midi" id="orbitaMidiNote">브라우저 신스로 소리가 납니다. 장비를 고르면 그쪽으로도 보냅니다.</span>
              </div>
            </div>
          `;

          const $ = <T extends HTMLElement>(sel: string): T => container.querySelector(sel) as T;
          const canvas = $<HTMLCanvasElement>('#orbitaCanvas');
          const c2d = canvas.getContext('2d');
          if (!c2d) return;
          const ctx2d = c2d;

          const playBtn = $<HTMLButtonElement>('#orbitaPlay');
          const bpmEl = $<HTMLInputElement>('#orbitaBpm');
          const bpmOut = $<HTMLSpanElement>('#orbitaBpmOut');
          const rootEl = $<HTMLSelectElement>('#orbitaRoot');
          const scaleEl = $<HTMLSelectElement>('#orbitaScale');
          const velEl = $<HTMLInputElement>('#orbitaVel');
          const swatchEl = $<HTMLDivElement>('#orbitaSwatches');
          const ringsEl = $<HTMLDivElement>('#orbitaRings');
          const midiEl = $<HTMLSelectElement>('#orbitaMidi');
          const midiNoteEl = $<HTMLSpanElement>('#orbitaMidiNote');

          bpmEl.value = String(song.bpm);
          bpmOut.textContent = `${song.bpm}`;
          velEl.value = String(Math.round(brushVel * 100));
          rootEl.innerHTML = ROOTS.map((n, i) => `<option value="${i}">${n}</option>`).join('');
          rootEl.value = String(song.root);
          scaleEl.innerHTML = SCALES.map((s) => `<option value="${s.id}">${s.label}</option>`).join('');
          scaleEl.value = song.scale;

          function renderSwatches(): void {
            swatchEl.innerHTML = scaleSteps
              .map(
                (_, i) =>
                  `<button type="button" class="orbita-sw" data-deg="${i}" aria-pressed="${i === brushDeg}"
                     style="background:${colorOf(i)}" aria-label="${i + 1}번째 음 고르기"
                     title="${ROOTS[(song.root + scaleSteps[i]) % 12]}"></button>`
              )
              .join('');
          }

          function renderRings(): void {
            ringsEl.innerHTML = song.rings
              .map((r, i) => {
                const opt = (vals: Array<string | number>, cur: string | number, lbl: (v: string | number) => string): string =>
                  vals.map((v) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${lbl(v)}</option>`).join('');
                return `<div class="orbita-ring-row">
                  <span class="orbita-ring-dot" style="background:hsl(${(i * 47) % 360} 20% 70%)"></span>
                  <span class="orbita-ring-name">궤도 ${i + 1}</span>
                  <label for="orbitaSteps${i}">칸</label>
                  <select id="orbitaSteps${i}" data-ring="${i}" data-k="steps" aria-label="궤도 ${i + 1} 칸 수">
                    ${opt([3, 4, 5, 6, 7, 8, 9, 12, 16, 24], r.steps, (v) => `${v}`)}
                  </select>
                  <label for="orbitaRate${i}">속도</label>
                  <select id="orbitaRate${i}" data-ring="${i}" data-k="rate" aria-label="궤도 ${i + 1} 회전 속도">
                    ${opt([0.25, 0.5, 1, 1.5, 2, 3], r.rate, (v) => `×${v}`)}
                  </select>
                  <label for="orbitaOct${i}">옥타브</label>
                  <select id="orbitaOct${i}" data-ring="${i}" data-k="octave" aria-label="궤도 ${i + 1} 옥타브">
                    ${opt([1, 2, 3, 4, 5, 6, 7], r.octave, (v) => `${v}`)}
                  </select>
                  <label for="orbitaWave${i}">음색</label>
                  <select id="orbitaWave${i}" data-ring="${i}" data-k="wave" aria-label="궤도 ${i + 1} 음색">
                    ${opt(WAVES as unknown as string[], r.wave, (v) => WAVE_LABEL[String(v)] || String(v))}
                  </select>
                  <label for="orbitaCh${i}">CH</label>
                  <select id="orbitaCh${i}" data-ring="${i}" data-k="channel" aria-label="궤도 ${i + 1} MIDI 채널">
                    ${opt(Array.from({ length: 16 }, (_, k) => k + 1), r.channel, (v) => `${v}`)}
                  </select>
                  <button type="button" class="orbita-btn${r.muted ? '' : ' is-on'}" data-ring="${i}" data-act="mute">${r.muted ? '음소거' : '소리남'}</button>
                  <button type="button" class="orbita-btn" data-ring="${i}" data-act="wipe">비우기</button>
                </div>`;
              })
              .join('');
          }

          renderSwatches();
          renderRings();

          /* ── 소리 ───────────────────────────────────────────────────────── */
          let audio: AudioContext | null = null;
          let master: GainNode | null = null;
          function ensureAudio(): AudioContext {
            if (audio) return audio;
            const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            const a = new AC();
            const g = a.createGain();
            g.gain.value = 0.22;
            // 공간감 — 궤도라는 말에 맞게 소리도 넓게 번지게 둔다 (짧은 피드백 딜레이)
            const delay = a.createDelay(1.5);
            delay.delayTime.value = 0.28;
            const fb = a.createGain();
            fb.gain.value = 0.26;
            const wet = a.createGain();
            wet.gain.value = 0.3;
            g.connect(a.destination);
            g.connect(delay);
            delay.connect(fb);
            fb.connect(delay);
            delay.connect(wet);
            wet.connect(a.destination);
            audio = a;
            master = g;
            return a;
          }

          function synth(r: Ring, note: number, vel: number, at: number): void {
            const a = audio;
            const out = master;
            if (!a || !out) return;
            const freq = 440 * Math.pow(2, (note - 69) / 12);
            const osc = a.createOscillator();
            osc.type = r.wave;
            osc.frequency.value = freq;
            const filt = a.createBiquadFilter();
            filt.type = 'lowpass';
            filt.frequency.setValueAtTime(Math.min(9000, freq * 6 + 400), at);
            filt.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 1.6), at + 0.35);
            const env = a.createGain();
            const peak = 0.35 * vel;
            const dur = Math.min(0.9, 0.12 + vel * 0.5);
            env.gain.setValueAtTime(0.0001, at);
            env.gain.exponentialRampToValueAtTime(peak, at + 0.008);
            env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
            osc.connect(filt);
            filt.connect(env);
            env.connect(out);
            osc.start(at);
            osc.stop(at + dur + 0.05);
          }

          /* ── MIDI 출력 ──────────────────────────────────────────────────── */
          let midiAccess: MidiAccessLike | null = null;
          let midiOut: MidiPortLike | null = null;

          function fillMidiDevices(): void {
            const outs = midiAccess ? Array.from(midiAccess.outputs.values()) : [];
            midiEl.innerHTML =
              '<option value="">(브라우저 신스만)</option>' +
              outs.map((o) => `<option value="${o.id}">${o.name || o.id}</option>`).join('');
            if (midiOut && outs.some((o) => o.id === midiOut?.id)) midiEl.value = midiOut.id;
            else midiOut = null;
          }

          const nav = navigator as NavigatorWithMidi;
          if (typeof nav.requestMIDIAccess === 'function') {
            nav
              .requestMIDIAccess()
              .then((acc) => {
                midiAccess = acc;
                acc.onstatechange = () => fillMidiDevices();
                fillMidiDevices();
              })
              .catch(() => {
                midiEl.innerHTML = '<option value="">(MIDI 권한 없음)</option>';
                midiNoteEl.textContent = 'MIDI 접근이 거부됐습니다 — 브라우저 신스로만 납니다.';
              });
          } else {
            midiEl.innerHTML = '<option value="">(이 브라우저는 MIDI 미지원)</option>';
            midiEl.disabled = true;
            midiNoteEl.textContent = 'Web MIDI 를 지원하지 않는 브라우저입니다 — 브라우저 신스로만 납니다.';
          }

          /**
           * 오디오 시계로 잡은 시각을 MIDI 시계(performance.now 기준)로 옮긴다.
           * 두 시계는 원점이 다르므로 **차이**만 쓴다.
           */
          function sendMidi(r: Ring, note: number, vel: number, at: number): void {
            const a = audio;
            if (!midiOut || !a) return;
            const ms = performance.now() + Math.max(0, (at - a.currentTime) * 1000);
            const ch = Math.max(0, Math.min(15, r.channel - 1));
            const v = Math.max(1, Math.min(127, Math.round(vel * 127)));
            try {
              midiOut.send([0x90 | ch, note, v], ms);
              midiOut.send([0x80 | ch, note, 0], ms + Math.min(600, 120 + vel * 400));
            } catch (_) {
              /* 장비가 뽑히는 순간 send 가 던진다 — 연주를 세울 이유는 아니다 */
            }
          }

          /* ── 스케줄러 (lookahead) ───────────────────────────────────────── */
          interface Flash {
            ring: number;
            slot: number;
            at: number;
            deg: number;
            vel: number;
          }
          let flashes: Flash[] = [];
          let songTime = 0; // 곡 안에서 흐른 초
          let originAudioTime = 0; // songTime 0 에 대응하는 audio.currentTime
          let counters: number[] = []; // 고리별 다음 이벤트 번호
          let ticker: number | undefined;

          const stepDur = (r: Ring): number => barDur() / (r.rate * r.steps);

          function resetCounters(): void {
            counters = song.rings.map((r) => Math.ceil(songTime / stepDur(r) - 1e-9));
          }

          function schedule(): void {
            const a = audio;
            if (!a || !playing) return;
            const horizon = a.currentTime - originAudioTime + 0.12; // songTime 기준 예약 지평선
            song.rings.forEach((r, ri) => {
              const sd = stepDur(r);
              let guard = 0;
              while (counters[ri] * sd < horizon && guard++ < 256) {
                const m = counters[ri]++;
                const t = m * sd;
                // 12시를 지나는 칸: 각도 A_i(t) = i/steps + t·rate/bar 가 0 이 되는 i
                const idx = ((r.steps - (m % r.steps)) % r.steps + r.steps) % r.steps;
                const slot = r.slots[idx];
                if (!slot || r.muted) continue;
                const at = originAudioTime + t;
                const note = midiNote(r, slot.deg);
                synth(r, note, slot.vel, at);
                sendMidi(r, note, slot.vel, at);
                flashes.push({ ring: ri, slot: idx, at, deg: slot.deg, vel: slot.vel });
              }
            });
            if (flashes.length > 240) flashes = flashes.slice(-160);
          }

          function start(): void {
            const a = ensureAudio();
            if (a.state === 'suspended') void a.resume();
            playing = true;
            originAudioTime = a.currentTime - songTime;
            resetCounters();
            if (ticker === undefined) ticker = window.setInterval(schedule, 25);
            schedule();
            playBtn.textContent = '■ STOP';
            playBtn.classList.add('is-on');
            Mdd.linePreset('tool_run', { mood: 'happy', msg: '궤도가 돌기 시작했어요' });
          }

          function stop(): void {
            playing = false;
            if (ticker !== undefined) {
              clearInterval(ticker);
              ticker = undefined;
            }
            playBtn.textContent = '▶ PLAY';
            playBtn.classList.remove('is-on');
          }

          /** 템포·칸 수·속도가 바뀌면 예약해 둔 미래가 틀어진다 — 지금 시점으로 다시 건다. */
          function reflow(): void {
            if (!playing || !audio) return;
            songTime = audio.currentTime - originAudioTime;
            resetCounters();
          }

          /* ── 그리기 ─────────────────────────────────────────────────────── */
          let dpr = 1;
          let cw = 0;
          let chh = 0;
          function resize(): void {
            const rect = canvas.getBoundingClientRect();
            dpr = Math.min(2, window.devicePixelRatio || 1);
            cw = Math.max(1, Math.round(rect.width));
            chh = Math.max(1, Math.round(rect.height));
            canvas.width = Math.round(cw * dpr);
            canvas.height = Math.round(chh * dpr);
            ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
          }

          const geom = (): { cx: number; cy: number; rMax: number; gap: number } => {
            const cx = cw / 2;
            const cy = chh / 2;
            const rMax = Math.min(cw, chh) * 0.44;
            const gap = rMax / (song.rings.length + 0.6);
            return { cx, cy, rMax, gap };
          };
          const ringRadius = (i: number): number => {
            const { rMax, gap } = geom();
            return rMax - i * gap;
          };
          const ringPhase = (r: Ring, t: number): number => {
            const p = (t * r.rate) / barDur();
            return p - Math.floor(p);
          };
          const slotAngle = (r: Ring, i: number, t: number): number => {
            const turns = i / r.steps + ringPhase(r, t);
            return -Math.PI / 2 + 2 * Math.PI * turns;
          };

          function draw(): void {
            const a = audio;
            const now = a ? a.currentTime : 0;
            if (playing && a) songTime = now - originAudioTime;
            const t = songTime;
            const { cx, cy } = geom();

            ctx2d.clearRect(0, 0, cw, chh);

            // 자오선 — 여기를 지나면 소리가 난다
            const rOuter = ringRadius(0) + 22;
            const grad = ctx2d.createLinearGradient(cx, cy - rOuter, cx, cy);
            grad.addColorStop(0, 'rgba(242,242,238,0.55)');
            grad.addColorStop(1, 'rgba(242,242,238,0.03)');
            ctx2d.strokeStyle = grad;
            ctx2d.lineWidth = 1.5;
            ctx2d.beginPath();
            ctx2d.moveTo(cx, cy - rOuter);
            ctx2d.lineTo(cx, cy);
            ctx2d.stroke();

            song.rings.forEach((r, ri) => {
              const rad = ringRadius(ri);
              if (rad < 6) return;

              // 궤도 선
              ctx2d.strokeStyle = r.muted ? 'rgba(242,242,238,0.045)' : 'rgba(210,205,245,0.11)';
              ctx2d.lineWidth = 1;
              ctx2d.beginPath();
              ctx2d.arc(cx, cy, rad, 0, Math.PI * 2);
              ctx2d.stroke();

              // 빈 칸 표시 — 어디에 찍을 수 있는지 보인다
              for (let i = 0; i < r.steps; i++) {
                const ang = slotAngle(r, i, t);
                const x = cx + Math.cos(ang) * rad;
                const y = cy + Math.sin(ang) * rad;
                const slot = r.slots[i];
                if (!slot) {
                  ctx2d.fillStyle = 'rgba(210,205,245,0.16)';
                  ctx2d.beginPath();
                  ctx2d.arc(x, y, 1.6, 0, Math.PI * 2);
                  ctx2d.fill();
                  continue;
                }

                // 방금 울렸으면 커지고 번진다
                let pulse = 0;
                for (const f of flashes) {
                  if (f.ring !== ri || f.slot !== i) continue;
                  const age = now - f.at;
                  if (age >= 0 && age < 0.5) pulse = Math.max(pulse, 1 - age / 0.5);
                }

                const base = 3.5 + slot.vel * 6;
                const size = base * (1 + pulse * 0.9);
                ctx2d.save();
                ctx2d.shadowColor = colorOf(slot.deg, 0.9);
                ctx2d.shadowBlur = 10 + pulse * 26;
                ctx2d.fillStyle = colorOf(slot.deg, r.muted ? 0.3 : 1);
                ctx2d.beginPath();
                ctx2d.arc(x, y, size, 0, Math.PI * 2);
                ctx2d.fill();
                ctx2d.restore();

                if (pulse > 0) {
                  ctx2d.strokeStyle = colorOf(slot.deg, pulse * 0.55);
                  ctx2d.lineWidth = 1.5;
                  ctx2d.beginPath();
                  ctx2d.arc(x, y, size + (1 - pulse) * 34, 0, Math.PI * 2);
                  ctx2d.stroke();
                }
              }
            });

            // 가운데 — 지금 무슨 박인지
            const beat = ((t / (60 / song.bpm)) % BEATS_PER_BAR + BEATS_PER_BAR) % BEATS_PER_BAR;
            ctx2d.fillStyle = 'rgba(242,242,238,0.35)';
            ctx2d.font = '600 11px var(--font-mono, monospace)';
            ctx2d.textAlign = 'center';
            ctx2d.textBaseline = 'middle';
            ctx2d.fillText(`${Math.floor(beat) + 1} / ${BEATS_PER_BAR}`, cx, cy);

            flashes = flashes.filter((f) => now - f.at < 0.6);
          }

          let raf: number | undefined;
          function loop(): void {
            if (!canvas.isConnected) return;
            draw();
            raf = requestAnimationFrame(loop);
          }

          /* ── 입력 ───────────────────────────────────────────────────────── */
          /** 화면 좌표 → 어느 궤도의 몇 번째 칸인가 (회전을 되돌려 계산한다) */
          function hit(px: number, py: number): { ring: number; slot: number } | null {
            const { cx, cy, gap } = geom();
            const dx = px - cx;
            const dy = py - cy;
            const dist = Math.hypot(dx, dy);
            let best = -1;
            let bestD = Infinity;
            song.rings.forEach((_, i) => {
              const d = Math.abs(dist - ringRadius(i));
              if (d < bestD) {
                bestD = d;
                best = i;
              }
            });
            if (best < 0 || bestD > Math.max(14, gap * 0.42)) return null;
            const r = song.rings[best];
            const ang = Math.atan2(dy, dx) + Math.PI / 2; // 12시 기준
            let turns = ang / (2 * Math.PI) - ringPhase(r, songTime);
            turns -= Math.floor(turns);
            const slot = Math.round(turns * r.steps) % r.steps;
            return { ring: best, slot };
          }

          function pointFromEvent(e: PointerEvent | WheelEvent): { x: number; y: number } {
            const rect = canvas.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
          }

          let drag: { ring: number; slot: number; startY: number; startDeg: number } | null = null;

          canvas.addEventListener('pointerdown', (e: PointerEvent) => {
            const { x, y } = pointFromEvent(e);
            const h = hit(x, y);
            if (!h) return;
            e.preventDefault();
            ensureAudio();
            const r = song.rings[h.ring];
            const existing = r.slots[h.slot];

            if (e.shiftKey || e.button === 2) {
              r.slots[h.slot] = null;
              save();
              return;
            }
            if (existing) {
              brushDeg = existing.deg;
              renderSwatches();
              drag = { ring: h.ring, slot: h.slot, startY: e.clientY, startDeg: existing.deg };
              canvas.setPointerCapture(e.pointerId);
              return;
            }
            r.slots[h.slot] = { deg: brushDeg, vel: brushVel };
            save();
            // 찍는 순간 그 음을 한 번 들려준다 — 안 그러면 색만 보고 찍게 된다
            const a = ensureAudio();
            if (a.state === 'suspended') void a.resume();
            synth(r, midiNote(r, brushDeg), brushVel, a.currentTime + 0.01);
            drag = { ring: h.ring, slot: h.slot, startY: e.clientY, startDeg: brushDeg };
            canvas.setPointerCapture(e.pointerId);
          });

          canvas.addEventListener('pointermove', (e: PointerEvent) => {
            if (!drag) return;
            const r = song.rings[drag.ring];
            const slot = r.slots[drag.slot];
            if (!slot) return;
            const shift = Math.round((drag.startY - e.clientY) / 14);
            const deg = Math.max(0, Math.min(scaleSteps.length * 2 - 1, drag.startDeg + shift));
            if (deg !== slot.deg) {
              slot.deg = deg;
              brushDeg = Math.min(scaleSteps.length - 1, deg);
              renderSwatches();
            }
          });

          const endDrag = (): void => {
            if (drag) save();
            drag = null;
          };
          canvas.addEventListener('pointerup', endDrag);
          canvas.addEventListener('pointercancel', endDrag);
          canvas.addEventListener('contextmenu', (e) => e.preventDefault());

          canvas.addEventListener(
            'wheel',
            (e: WheelEvent) => {
              const { x, y } = pointFromEvent(e);
              const h = hit(x, y);
              if (!h) return;
              const slot = song.rings[h.ring].slots[h.slot];
              if (!slot) return;
              e.preventDefault();
              slot.vel = Math.max(0.15, Math.min(1, slot.vel + (e.deltaY < 0 ? 0.1 : -0.1)));
              save();
            },
            { passive: false }
          );

          /* ── 조작 패널 ──────────────────────────────────────────────────── */
          playBtn.onclick = () => (playing ? stop() : start());

          bpmEl.oninput = () => {
            song.bpm = Number(bpmEl.value);
            bpmOut.textContent = `${song.bpm}`;
            reflow();
            save();
          };
          rootEl.onchange = () => {
            song.root = Number(rootEl.value);
            renderSwatches();
            save();
          };
          scaleEl.onchange = () => {
            song.scale = scaleEl.value;
            scaleSteps = (SCALES.find((s) => s.id === song.scale) || SCALES[0]).steps;
            brushDeg = Math.min(brushDeg, scaleSteps.length - 1);
            renderSwatches();
            save();
          };
          velEl.oninput = () => {
            brushVel = Number(velEl.value) / 100;
          };

          swatchEl.addEventListener('click', (e) => {
            const btn = (e.target as HTMLElement).closest('.orbita-sw') as HTMLElement | null;
            if (!btn) return;
            brushDeg = Number(btn.dataset.deg);
            renderSwatches();
          });

          ringsEl.addEventListener('change', (e) => {
            const el = e.target as HTMLSelectElement;
            const ri = Number(el.dataset.ring);
            const k = el.dataset.k;
            if (Number.isNaN(ri) || !k) return;
            const r = song.rings[ri];
            if (k === 'steps') {
              const next = Number(el.value);
              const old = r.slots;
              r.slots = new Array(next).fill(null);
              // 칸 수가 바뀌어도 찍어 둔 것을 **비율대로** 옮긴다 (다 날리면 실험을 안 하게 된다)
              old.forEach((s, i) => {
                if (!s) return;
                const to = Math.round((i / r.steps) * next) % next;
                r.slots[to] = s;
              });
              r.steps = next;
            } else if (k === 'rate') r.rate = Number(el.value);
            else if (k === 'octave') r.octave = Number(el.value);
            else if (k === 'wave') r.wave = el.value as OscillatorType;
            else if (k === 'channel') r.channel = Number(el.value);
            reflow();
            save();
          });

          ringsEl.addEventListener('click', (e) => {
            const btn = (e.target as HTMLElement).closest('button[data-act]') as HTMLButtonElement | null;
            if (!btn) return;
            const r = song.rings[Number(btn.dataset.ring)];
            if (btn.dataset.act === 'mute') r.muted = !r.muted;
            else r.slots = new Array(r.steps).fill(null);
            renderRings();
            save();
          });

          midiEl.onchange = () => {
            const id = midiEl.value;
            midiOut = id && midiAccess ? midiAccess.outputs.get(id) || null : null;
            midiNoteEl.textContent = midiOut
              ? `${midiOut.name || midiOut.id} 로 보냅니다 — 궤도 번호 = MIDI 채널.`
              : '브라우저 신스로 소리가 납니다. 장비를 고르면 그쪽으로도 보냅니다.';
          };

          $<HTMLButtonElement>('#orbitaClear').onclick = () => {
            song.rings.forEach((r) => (r.slots = new Array(r.steps).fill(null)));
            save();
          };

          $<HTMLButtonElement>('#orbitaRandom').onclick = () => {
            song.rings.forEach((r, ri) => {
              r.slots = new Array(r.steps).fill(null);
              const density = 0.42 - ri * 0.05;
              for (let i = 0; i < r.steps; i++) {
                if (Math.random() > density) continue;
                r.slots[i] = {
                  deg: Math.floor(Math.random() * scaleSteps.length),
                  vel: 0.4 + Math.random() * 0.6
                };
              }
            });
            save();
            Mdd.linePreset('idle_wake', { msg: '별을 뿌렸어요' });
            Mdd.bounce();
          };

          /* ── 수명 관리 ──────────────────────────────────────────────────── */
          resize();
          const ro = new ResizeObserver(() => resize());
          ro.observe(canvas);

          const eye = new IntersectionObserver(
            (entries) => {
              const vis = entries[0]?.isIntersecting;
              if (vis) {
                resize();
                if (raf === undefined) loop();
              } else if (raf !== undefined) {
                cancelAnimationFrame(raf);
                raf = undefined;
                stop(); // 안 보이는 화면이 소리를 내고 있으면 안 된다
              }
            },
            { threshold: 0.05 }
          );
          eye.observe(canvas);

          Toolbox.onDispose?.(() => {
            stop();
            if (raf !== undefined) cancelAnimationFrame(raf);
            ro.disconnect();
            eye.disconnect();
            if (audio) void audio.close();
            audio = null;
            master = null;
          });

          Mdd.linePreset('tool_run', { mood: 'idle', msg: '궤도에 색을 찍어 보세요' });
        }
      }
    ]
  });
})();
