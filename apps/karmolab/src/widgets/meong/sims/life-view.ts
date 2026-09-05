/**
 * 생명 격자. 손대지 않는 것을 켜 두고 구경한다 (TASK-KL-211, 멍으로 병합)
 *
 * 사용자: "관찰 방향으로 가자. 그 9칸 랜덤으로 매치된거 규칙이랑 배열에 따라 자동으로 막 움직이고
 * 되는거지" (→ 세포 자동자 정원)
 *
 * 격자에 씨앗을 뿌리고 규칙 하나만 정해 준다. 그 뒤로는 **아무도 안 건드린다.**
 * 9칸(무어 이웃)이 읽는 한 줄짜리 규칙에서 도시가 자라고, 길이 뚫리고, 무언가 흘러간다.
 *
 * 무슨 일이 일어났는지는 **문장**으로 흘려보낸다. 37세대에 무언가 흘러가기 시작했다.
 * 규칙은 **날짜로 뽑는다**. 같은 날 연 사람은 같은 세계를 본다(`rules.ts`).
 *
 * 껍데기(판, 재생, 손잡이)는 멍이 짓는다. 여기는 판에 무엇을 그릴지만 안다 (`sim-host.ts`).
 */
import { t } from '../../../lib/i18n';
import { gloop, type GardenLoop } from '../../../lib/gloop';
import { ruleForDay, ruleTable, rng, type Rule } from './rules';
import { Life, Watcher, quality, type Stats, type Event } from './life';
import { findObjects, type Found, type Kind } from './dex';
import { GardenSound } from './gsound';
import { simCanvas, stageSize, type SimHandle, type SimHost } from './sim-host';

const STORE_KEY = 'karmolab_garden_v1';
const DEX_KEY = 'karmolab_garden_dex_v1';
/* 셀 한 칸을 화면 몇 px 로 볼 것인가. 너무 작으면 무늬가 안 보이고, 너무 크면
   격자가 좁아 아무 일도 안 일어난다. 사이를 본다. */
const CELL = 6;
/** 초당 몇 세대. 너무 빠르면 무늬가 안 읽히고, 느리면 안 자란다 */
const GPS = 18;

/** 도감 한 줄. 찾아낸 개체를 지문으로 모은다. 이름은 사람이 붙이고, 그 이름이 남는다 */
interface DexEntry {
  fp: string;
  kind: Kind;
  period: number;
  dx: number;
  dy: number;
  size: number;
  w: number;
  h: number;
  cells: number[];
  /** 사람이 붙인 이름 (없으면 빈 문자열) */
  name: string;
  /** 처음 본 날, 그때의 규칙 */
  day: string;
  rule: string;
  seen: number;
}

function injectStyles(): void {
  if (document.getElementById('gd-style')) return;
  const el = document.createElement('style');
  el.id = 'gd-style';
  el.textContent = `
.gd-dex{display:flex;flex-direction:column;gap:9px;max-height:46vh;overflow:auto;}
.gd-dex h4{margin:0;font-size:var(--font-size-2xs);color:rgba(220,215,255,.7);font-weight:600;}
.gd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;}
.gd-card{display:flex;gap:8px;align-items:center;background:rgba(255,255,255,.05);border-radius:var(--radius-md,10px);padding:7px;}
.gd-card canvas{width:40px;height:40px;image-rendering:pixelated;border-radius:var(--radius-sm,6px);background:#0a0b12;flex:none;}
.gd-meta{min-width:0;}
.gd-name{display:block;width:100%;background:transparent;border:0;border-bottom:1px dashed rgba(255,255,255,.18);
  color:#e9e4ff;font-size:var(--font-size-2xs);padding:1px 0;outline:none;}
.gd-name:focus{border-bottom-color:rgba(170,150,255,.7);}
.gd-what{display:block;margin-top:3px;color:rgba(200,195,235,.45);font-size:var(--font-size-3xs);
  font-family:var(--font-mono,ui-monospace,monospace);}
.gd-toggle{display:flex;gap:5px;}
.gd-toggle > button{flex:1 1 auto;padding:5px 4px;font-size:var(--font-size-3xs);cursor:pointer;
  border-radius:var(--radius-sm,6px);border:1px solid rgba(255,255,255,.10);
  background:rgba(255,255,255,.04);color:rgba(255,255,255,.6);}
.gd-toggle > button[aria-pressed="true"]{background:rgba(170,150,255,.22);border-color:rgba(170,150,255,.55);color:#fff;}
`;
  document.head.appendChild(el);
}

export function buildLife(host: SimHost): SimHandle {
  injectStyles();
  const canvas = simCanvas(host, true);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dispose(): void {} };

  const day = new Date().toISOString().slice(0, 10);
  const rule: Rule = ruleForDay(day);
  const table = ruleTable(rule);
  const watcher = new Watcher();
  const sound = new GardenSound();
  const gridCv = document.createElement('canvas');
  const gridCtx = gridCv.getContext('2d');

  let life = new Life(1, 1);
  let img: ImageData | null = null;
  let loop: GardenLoop | undefined;
  let alive = true;
  let seedNo = 0;
  let last: Stats | null = null;
  /* 죽은 자리에 남는 잔상. 켜고 끄는 두 색만 쓰면 화면이 잡음으로 보인다.
     방금까지 살아 있던 자리가 천천히 식으면, 같은 격자가 무늬로 읽힌다. */
  let heat: Uint8Array = new Uint8Array(0);

  /* 카메라. 격자 전체를 늘려 보여 주면 개체 하나하나는 점이 된다. 하나를 골라
     따라가며 크게 보면, 같은 판이 무늬에서 살고 있는 것으로 바뀐다.
     `scale` = 격자 한 칸이 화면 몇 px 인가. `x,y` = 화면 한가운데가 보는 격자 좌표. */
  const cam = { x: 0, y: 0, scale: 0, want: { x: 0, y: 0, scale: 0 } };
  let follow = false;
  /** 지금 따라가는 개체. 지문, 자리, 예상 속도 */
  let target: { fp: string; x: number; y: number; vx: number; vy: number; lostAt: number } | null = null;
  /** 지금 판에 있는 진동자, 우주선의 주기. 이게 그대로 박자가 된다 */
  let livePeriods: number[] = [];
  /** 개체가 마지막으로 있던 자리 (fp → 격자 좌표) */
  const lastSeenAt = new Map<string, { x: number; y: number }>();

  let dex: Record<string, DexEntry> = {};
  try {
    const raw = localStorage.getItem(DEX_KEY);
    if (raw) dex = JSON.parse(raw) as Record<string, DexEntry>;
  } catch (_) {
    dex = {};
  }
  function saveDex(): void {
    try {
      localStorage.setItem(DEX_KEY, JSON.stringify(dex));
    } catch (_) {
      /* 못 적어도 정원은 돈다 */
    }
  }

  const hint = t('garden.hint.' + (rule.id === 'wild' ? 'wild' : 'named'));
  function say(text: string): void {
    host.say(text, hint);
  }

  /* ── 손잡이 (도감, 따라가기, 소리) ─────────────────────────────── */

  const panel = document.createElement('div');
  const toggles = document.createElement('div');
  toggles.className = 'gd-toggle';
  const followBtn = document.createElement('button');
  followBtn.type = 'button';
  followBtn.textContent = t('garden.follow');
  followBtn.setAttribute('aria-pressed', 'false');
  const soundBtn = document.createElement('button');
  soundBtn.type = 'button';
  soundBtn.textContent = t('garden.sound');
  soundBtn.setAttribute('aria-pressed', 'false');
  toggles.append(followBtn, soundBtn);
  const dexPanel = document.createElement('div');
  dexPanel.className = 'gd-dex';
  const dexTitle = document.createElement('h4');
  const dexGrid = document.createElement('div');
  dexGrid.className = 'gd-grid';
  dexPanel.append(dexTitle, dexGrid);
  panel.append(toggles, dexPanel);
  host.panel(panel);

  followBtn.onclick = () => {
    follow = !follow;
    followBtn.setAttribute('aria-pressed', String(follow));
    if (!follow) target = null;
  };
  soundBtn.onclick = () => {
    // **이 클릭 안에서** 시작해야 한다. 브라우저가 제스처 밖의 소리를 막는다
    if (sound.running) sound.stop();
    else sound.start();
    soundBtn.setAttribute('aria-pressed', String(sound.running));
  };

  /* ── 판 ───────────────────────────────────────────────────────── */

  function build(): void {
    const { w: cw, h: ch } = stageSize(host);
    const w = Math.max(40, Math.floor(cw / CELL));
    const h = Math.max(30, Math.floor(ch / CELL));
    canvas.width = cw;
    canvas.height = ch;
    gridCv.width = w;
    gridCv.height = h;
    life = new Life(w, h);
    heat = new Uint8Array(w * h);
    img = gridCtx!.createImageData(w, h);
    // 카메라 기본 자리 = 판 전체
    cam.scale = canvas.width / w;
    cam.x = w / 2;
    cam.y = h / 2;
    cam.want = { x: cam.x, y: cam.y, scale: cam.scale };
    reseed();
  }

  function reseed(): void {
    seedNo++;
    // 씨앗도 날짜에서 뽑는다. 다시 심기를 누른 횟수만 더한다
    const seed = (day.charCodeAt(8) * 7919 + day.charCodeAt(9) * 104729 + seedNo * 2654435761) >>> 0;
    const rand = rng(seed);
    if (rule.seed === 'point') life.seedPoint(rand, rule.density);
    else life.seed(rand, rule.density);
    watcher.reset();
    last = null;
    say(t('garden.line.seeded', { n: seedNo }));
  }

  /** 나이로 칠한다. 갓 태어난 것은 밝고 차갑게, 오래 버틴 것은 깊고 따뜻하게 */
  function draw(): void {
    if (!img) return;
    const d = img.data;
    const cells = life.cells;
    const age = life.age;
    for (let i = 0, k = 0; i < cells.length; i++, k += 4) {
      if (!cells[i]) {
        const q = heat[i];
        if (q > 2) heat[i] = q * 0.87;
        else heat[i] = 0;
        const g = heat[i] / 255;
        d[k] = 7 + g * 40;
        d[k + 1] = 8 + g * 70;
        d[k + 2] = 12 + g * 96;
        d[k + 3] = 255;
        continue;
      }
      heat[i] = 255;
      /* 갓 태어난 것은 **차고 밝게**, 오래 버틴 것은 **깊고 붉게**. 이 대비가 없으면
         화면이 그냥 잡음으로 보인다. 무엇이 새것인지가 안 보이기 때문이다. */
      const a = age[i];
      const old = a > 90 ? 1 : a / 90;
      const o2 = old * old;
      d[k] = 96 + o2 * 150;
      d[k + 1] = 214 - old * 150;
      d[k + 2] = 255 - old * 190;
      d[k + 3] = 255;
    }
    gridCtx!.putImageData(img, 0, 0);

    /* 카메라를 부드럽게 따라가게 한다. 순간이동하면 어디서 어디로 갔는지 안 보인다 */
    cam.x += (cam.want.x - cam.x) * 0.06;
    cam.y += (cam.want.y - cam.y) * 0.06;
    cam.scale += (cam.want.scale - cam.scale) * 0.05;

    const c = ctx!;
    const sw = canvas.width / cam.scale;
    const sh = canvas.height / cam.scale;
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#07080c';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.drawImage(gridCv, cam.x - sw / 2, cam.y - sh / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  }

  /* ── 도감 ─────────────────────────────────────────────────────── */

  function whatText(e: DexEntry): string {
    if (e.kind === 'still') return t('garden.dex.still', { n: e.size });
    if (e.kind === 'oscillator') return t('garden.dex.osc', { n: e.size, p: e.period });
    return t('garden.dex.ship', { n: e.size, p: e.period, d: Math.max(Math.abs(e.dx), Math.abs(e.dy)) });
  }

  /** 개체 하나를 작은 판에 그린다. 도감은 글자만으로는 안 된다 */
  function drawThumb(cv: HTMLCanvasElement, e: DexEntry): void {
    cv.width = e.w;
    cv.height = e.h;
    const c2 = cv.getContext('2d');
    if (!c2) return;
    const im = c2.createImageData(e.w, e.h);
    for (let i = 0, k = 0; i < e.w * e.h; i++, k += 4) {
      im.data[k] = 10;
      im.data[k + 1] = 11;
      im.data[k + 2] = 18;
      im.data[k + 3] = 255;
    }
    for (const idx of e.cells) {
      const k = idx * 4;
      im.data[k] = 150;
      im.data[k + 1] = 220;
      im.data[k + 2] = 255;
    }
    c2.putImageData(im, 0, 0);
  }

  function renderDex(): void {
    const rows = Object.values(dex).sort((a, b) => b.seen - a.seen);
    dexTitle.textContent = t('garden.dex.title', { n: rows.length });
    dexGrid.textContent = '';
    for (const e of rows) {
      const card = document.createElement('div');
      card.className = 'gd-card';
      const cv = document.createElement('canvas');
      drawThumb(cv, e);
      const meta = document.createElement('div');
      meta.className = 'gd-meta';
      const name = document.createElement('input');
      name.className = 'gd-name';
      name.value = e.name;
      name.placeholder = t('garden.dex.namePlaceholder');
      name.onchange = () => {
        e.name = name.value.trim().slice(0, 24);
        saveDex();
      };
      const what = document.createElement('span');
      what.className = 'gd-what';
      what.textContent = whatText(e);
      meta.append(name, what);
      card.append(cv, meta);
      dexGrid.appendChild(card);
    }
  }

  /** 판을 훑어 개체를 찾고, 처음 보는 것이면 도감에 넣는다 */
  function scanDex(gen: number): void {
    // 자리는 매번 새로 적는다. 지난번 자리를 남겨 두면 이미 사라진 것을 따라가게 된다
    lastSeenAt.clear();
    const found: Found[] = findObjects(life, table.born, table.stay, 8, lastSeenAt);
    let fresh: DexEntry | null = null;
    for (const f of found) {
      const cur = dex[f.fp];
      if (cur) {
        cur.seen++;
        continue;
      }
      const e: DexEntry = {
        fp: f.fp,
        kind: f.kind,
        period: f.period,
        dx: f.dx,
        dy: f.dy,
        size: f.size,
        w: f.w,
        h: f.h,
        cells: f.cells,
        name: '',
        day,
        rule: rule.name || rule.code,
        seen: 1
      };
      dex[f.fp] = e;
      if (!fresh) fresh = e;
    }
    if (fresh) {
      saveDex();
      renderDex();
      say(t('garden.line.found', { gen, what: whatText(fresh) }));
    } else if (found.length) {
      saveDex();
    }
    /* 지금 판에 있는 박자를 모은다. 도감에 이미 있는 것도 지금 울리고 있는 것이다 */
    livePeriods = found.filter((f) => f.kind !== 'still').map((f) => f.period);
    if (sound.running && found.some((f) => f.kind === 'ship')) sound.swoosh();

    // 따라가던 것을 다시 찾았으면 자리를 바로잡고, 없으면 새로 고른다
    if (follow) {
      const at = target && lastSeenAt.get(target.fp);
      if (at && target) {
        target.x = at.x;
        target.y = at.y;
        target.lostAt = gen;
      } else {
        target = null;
        pickTarget(found, gen);
      }
    }
  }

  /**
   * 볼만한 것을 하나 고른다. **움직이는 것**이 제일 볼만하고(우주선), 없으면 진동자,
   * 그것도 없으면 안 고른다. 가만히 있는 것을 확대해 봐야 정지 화면이다.
   */
  function pickTarget(found: Found[], gen: number): void {
    const ship = found.find((f) => f.kind === 'ship');
    const osc = found.find((f) => f.kind === 'oscillator');
    const pick = ship || osc;
    if (!pick) return;
    const at = lastSeenAt.get(pick.fp);
    if (!at) return;
    target = {
      fp: pick.fp,
      x: at.x,
      y: at.y,
      // 한 주기에 (dx,dy) 만큼 가므로, 세대당 속도는 그걸 주기로 나눈 값
      vx: pick.kind === 'ship' ? pick.dx / pick.period : 0,
      vy: pick.kind === 'ship' ? pick.dy / pick.period : 0,
      lostAt: gen
    };
  }

  function stepFollow(gen: number): void {
    if (!follow || !target) {
      cam.want = { x: life.w / 2, y: life.h / 2, scale: canvas.width / life.w };
      return;
    }
    // 예측으로 따라간다. 매 세대 판 전체를 훑는 것은 너무 비싸다
    target.x += target.vx;
    target.y += target.vy;
    // 가장자리를 넘어가면 이어 붙인 판이므로 좌표도 감는다
    target.x = ((target.x % life.w) + life.w) % life.w;
    target.y = ((target.y % life.h) + life.h) % life.h;
    /* 예측만으로 오래 끌지 않는다. 개체는 부딪히면 그냥 사라진다.
       60세대(=다시 훑는 25세대의 두 번 이상) 안에 못 찾으면 놓아 주고 다른 것을 고른다.
       안 그러면 카메라가 빈 자리를 확대한 채 멎어 있다(실측: 화면이 한 색이 됐다). */
    if (gen - target.lostAt > 60) target = null;
    else cam.want = { x: target.x, y: target.y, scale: Math.min(18, Math.max(6, canvas.width / 90)) };
  }

  function sentence(ev: Event): string {
    const vars: Record<string, string | number> = { gen: ev.gen, v: ev.value ?? 0 };
    return t('garden.event.' + ev.kind, vars);
  }

  /* ── 돌리기 ───────────────────────────────────────────────────── */

  let acc = 0;
  let prev = performance.now();

  function frame(): void {
    const now = performance.now();
    const dt = Math.min(120, now - prev);
    prev = now;
    if (!host.running()) return;
    acc += dt * host.speed();
    /* 오래 굴리면 어떤 규칙이든 판을 다 채우고 그때부터는 잡음이다.
       언제 그렇게 되는지는 규칙마다 다르므로 **화면을 직접 재서** 판단한다
       (30세대에 한 번, `quality()`). 그래도 안 걸리는 경우를 위해 상한도 둔다. */
    /* 개체 찾기는 판 전체를 훑고 후보마다 따로 굴려 보므로 싸지 않다.
       25세대에 한 번이면 놓치는 것도 거의 없고 프레임도 안 튄다. */
    if (last && last.gen % 25 === 0 && last.gen > 30) scanDex(last.gen);
    if (last && last.gen % 30 === 0 && last.gen > 60) {
      const ev = watcher.judge(quality(life), last.gen);
      if (ev) {
        say(sentence(ev));
        if (sound.running) sound.toll(ev.kind === 'extinct' || ev.kind === 'frozen');
        window.setTimeout(() => alive && reseed(), 3200);
      }
    }
    if (last && last.gen >= 1500) reseed();
    const stepMs = 1000 / GPS;
    let steps = 0;
    while (acc >= stepMs && steps < 4) {
      acc -= stepMs;
      steps++;
      last = life.step(table.born, table.stay);
      const ev = watcher.observe(last);
      if (ev) {
        say(sentence(ev));
        /* 다 죽었거나 굳었으면 잠시 뒤 다시 심는다. 아무 일도 안 일어나는 화면을
           계속 보여 줄 이유가 없다. 굳은 그림은 잠깐 더 보여 준다(그것도 결과다). */
        if (ev.kind === 'extinct') window.setTimeout(() => alive && reseed(), 2600);
        else if (ev.kind === 'frozen') window.setTimeout(() => alive && reseed(), 6000);
      }
    }
    stepFollow(last ? last.gen : 0);

    /* 소리. 판에 있는 주기를 그대로 친다. 세대 수가 그 주기의 배수일 때가 돌아온 순간이다 */
    if (sound.running && last) {
      for (const p of livePeriods) {
        if (last.gen % p === 0) sound.tick(p, now);
      }
      if (last.gen % 15 === 0) {
        sound.update(last.pop / (life.w * life.h), (last.born + last.died) / (life.w * life.h));
      }
    }
    if (steps) {
      draw();
      host.setStep(t('garden.gen', { gen: last!.gen, pop: last!.pop }));
    }
  }

  host.setName(rule.name || t('garden.rule.wild'), rule.code);
  host.action('reseed', '✧', t('garden.reseed'), reseed);
  build();
  renderDex();
  say(t('garden.line.today', { rule: rule.name || t('garden.rule.wild'), code: rule.code }));
  loop = gloop(frame, host.stage);

  /* 크기가 **실제로** 바뀐 때만 다시 짓는다. 그냥 다시 지으면 관찰 중이던 세계가
     지워진다. 열자마자 씨앗이 두 번 뿌려지고 있었다(실측). */
  const ro = new ResizeObserver(() => {
    if (!img) return;
    const { w: cw, h: ch } = stageSize(host);
    const w = Math.max(40, Math.floor(cw / CELL));
    const h = Math.max(30, Math.floor(ch / CELL));
    if (w === life.w && h === life.h) return;
    build();
  });
  ro.observe(host.stage);

  return {
    dispose(): void {
      alive = false;
      sound.stop();
      loop?.stop();
      ro.disconnect();
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ day, seenGen: last?.gen ?? 0 }));
      } catch (_) {
        /* 못 적어도 정원은 돈다 */
      }
    }
  };
}
