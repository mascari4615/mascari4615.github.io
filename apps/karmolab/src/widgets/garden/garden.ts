/**
 * 정원 — 손대지 않는 것을 켜 두고 구경한다 (TASK-KL-211)
 *
 * 사용자: "관찰 방향으로 가자. 그 9칸 랜덤으로 매치된거 규칙이랑 배열에 따라 자동으로 막 움직이고
 * 되는거지" (→ 세포 자동자 정원)
 *
 * 격자에 씨앗을 뿌리고 규칙 하나만 정해 준다. 그 뒤로는 **아무도 안 건드린다.**
 * 9칸(무어 이웃)이 읽는 한 줄짜리 규칙에서 도시가 자라고, 길이 뚫리고, 무언가 흘러간다.
 *
 * 앞선 관찰물들(Sandspiel·Lenia·Physarum·Langton)은 전부 아름다운데, **무슨 일이 일어났는지는
 * 말해 주지 않는다** — 관찰자가 혼자 알아채야 한다. 여기서는 블루마블(TASK-KL-206)에서 통한 것을
 * 그대로 쓴다: 사건을 **문장**으로 흘려보낸다. 「37세대에 무언가 흘러가기 시작했다.」
 *
 * 규칙은 **날짜로 뽑는다** — 같은 날 연 사람은 같은 세계를 본다(`rules.ts`).
 */
import { t, loadNamespace } from '../../lib/i18n';
import { ruleForDay, ruleTable, rng, type Rule } from './rules';
import { Life, Watcher, type Stats, type Event } from './life';

(function (): void {
  if (typeof Toolbox === 'undefined') return;

  const NS = 'garden';
  const STORE_KEY = 'karmolab_garden_v1';

  function injectStyles(): void {
    if (document.getElementById('gd-style')) return;
    const el = document.createElement('style');
    el.id = 'gd-style';
    el.textContent = `
.gd-wrap{position:relative;width:100%;height:100%;min-height:420px;display:flex;flex-direction:column;
  border-radius:var(--radius-md,12px);overflow:hidden;background:#07080c;}
.gd-canvas{flex:1;display:block;width:100%;height:100%;image-rendering:pixelated;}
.gd-top{position:absolute;top:0;left:0;right:0;padding:12px 14px 22px;display:flex;align-items:baseline;gap:10px;
  z-index:2;pointer-events:none;background:linear-gradient(to bottom,rgba(4,5,10,.88),rgba(4,5,10,0));}
.gd-rule{color:#e9e4ff;font-size:13px;letter-spacing:-.01em;text-shadow:0 1px 10px rgba(0,0,0,.9);}
.gd-code{color:rgba(200,195,235,.5);font-size:11px;font-family:var(--font-mono,ui-monospace,monospace);}
.gd-gen{margin-left:auto;color:rgba(200,195,235,.45);font-size:11px;
  font-family:var(--font-mono,ui-monospace,monospace);}
.gd-log{position:absolute;left:0;right:0;bottom:0;padding:14px 16px 16px;z-index:2;pointer-events:none;
  background:linear-gradient(to top,rgba(4,5,10,.9),rgba(4,5,10,0));}
.gd-line{display:block;color:#ded8ff;font-size:14px;line-height:1.5;opacity:0;transition:opacity .7s ease;
  text-shadow:0 1px 12px rgba(0,0,0,.9);}
.gd-line.gd-show{opacity:1;}
.gd-sub{display:block;margin-top:3px;color:rgba(190,185,225,.42);font-size:11px;
  font-family:var(--font-mono,ui-monospace,monospace);}
.gd-btns{position:absolute;top:44px;right:12px;display:flex;gap:6px;z-index:3;}
.gd-btn{appearance:none;border:1px solid rgba(255,255,255,.16);background:rgba(10,10,20,.55);
  color:rgba(255,255,255,.6);font-size:11px;line-height:1;padding:6px 9px;border-radius:999px;cursor:pointer;
  backdrop-filter:blur(6px);font-family:var(--font-mono,ui-monospace,monospace);}
.gd-btn[aria-pressed="true"]{color:#eae6ff;border-color:rgba(170,150,255,.55);background:rgba(48,36,96,.55);}
@media (prefers-reduced-motion:reduce){.gd-line{transition:none}}
`;
    document.head.appendChild(el);
  }

  Toolbox.register({
    id: 'garden',
    title: 'Garden',
    category: 'lab',
    layout: 'full',
    icon: '<rect x="3" y="3" width="6" height="6" rx="1" fill="currentColor" opacity=".85"/><rect x="15" y="3" width="6" height="6" rx="1" fill="currentColor" opacity=".35"/><rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" opacity=".85"/><rect x="3" y="15" width="6" height="6" rx="1" fill="currentColor" opacity=".35"/><rect x="15" y="15" width="6" height="6" rx="1" fill="currentColor" opacity=".85"/>',
    ...(Toolbox.getLazyWidgetPublicMeta ? Toolbox.getLazyWidgetPublicMeta('garden') : {}),
    tabs: [
      {
        id: 'garden',
        label: 'Garden',
        build: function (container: HTMLElement): void {
          injectStyles();

          const wrap = document.createElement('div');
          wrap.className = 'gd-wrap';
          const canvas = document.createElement('canvas');
          canvas.className = 'gd-canvas';
          const top = document.createElement('div');
          top.className = 'gd-top';
          const ruleEl = document.createElement('span');
          ruleEl.className = 'gd-rule';
          const codeEl = document.createElement('span');
          codeEl.className = 'gd-code';
          const genEl = document.createElement('span');
          genEl.className = 'gd-gen';
          top.append(ruleEl, codeEl, genEl);
          const btns = document.createElement('div');
          btns.className = 'gd-btns';
          const seedBtn = document.createElement('button');
          seedBtn.type = 'button';
          seedBtn.className = 'gd-btn';
          const pauseBtn = document.createElement('button');
          pauseBtn.type = 'button';
          pauseBtn.className = 'gd-btn';
          btns.append(seedBtn, pauseBtn);
          const log = document.createElement('div');
          log.className = 'gd-log';
          const line = document.createElement('span');
          line.className = 'gd-line';
          const sub = document.createElement('span');
          sub.className = 'gd-sub';
          log.append(line, sub);
          wrap.append(canvas, top, btns, log);
          container.appendChild(wrap);

          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          /* ── 상태 ─────────────────────────────────────────────────────── */
          const day = new Date().toISOString().slice(0, 10);
          const rule: Rule = ruleForDay(day);
          const table = ruleTable(rule);
          let life = new Life(1, 1);
          const watcher = new Watcher();
          let img: ImageData | null = null;
          let raf: number | undefined;
          let alive = true;
          let paused = false;
          let seedNo = 0;
          let last: Stats | null = null;
          /* 죽은 자리에 남는 잔상. 켜고 끄는 두 색만 쓰면 화면이 잡음으로 보인다 —
             방금까지 살아 있던 자리가 천천히 식으면, 같은 격자가 「무늬」로 읽힌다. */
          let heat: Uint8Array = new Uint8Array(0);

          /* 셀 한 칸을 화면 몇 px 로 볼 것인가. 너무 작으면 무늬가 안 보이고, 너무 크면
             격자가 좁아 아무 일도 안 일어난다 — 사이를 본다. */
          const CELL = 6;

          function build(): void {
            const r = wrap.getBoundingClientRect();
            const w = Math.max(40, Math.floor(r.width / CELL));
            const h = Math.max(30, Math.floor((r.height || 420) / CELL));
            canvas.width = w;
            canvas.height = h;
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            life = new Life(w, h);
            heat = new Uint8Array(w * h);
            img = ctx!.createImageData(w, h);
            reseed();
          }

          function reseed(): void {
            seedNo++;
            // 씨앗도 날짜에서 뽑는다 — 「다시 심기」를 누른 횟수만 더한다
            const seed = (day.charCodeAt(8) * 7919 + day.charCodeAt(9) * 104729 + seedNo * 2654435761) >>> 0;
            const rand = rng(seed);
            if (rule.seed === 'point') life.seedPoint(rand, rule.density);
            else life.seed(rand, rule.density);
            watcher.reset();
            last = null;
            say(t('garden.line.seeded', { n: seedNo }));
          }

          /* ── 그리기 ───────────────────────────────────────────────────── */

          /** 나이로 칠한다 — 갓 태어난 것은 밝고 차갑게, 오래 버틴 것은 깊고 따뜻하게. */
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
                 화면이 그냥 잡음으로 보인다 — 무엇이 새것인지가 안 보이기 때문이다. */
              const a = age[i];
              const old = a > 90 ? 1 : a / 90;
              const o2 = old * old;
              d[k] = 96 + o2 * 150;
              d[k + 1] = 214 - old * 150;
              d[k + 2] = 255 - old * 190;
              d[k + 3] = 255;
            }
            ctx!.putImageData(img, 0, 0);
          }

          /* ── 관찰 일지 ────────────────────────────────────────────────── */
          function say(text: string): void {
            line.classList.remove('gd-show');
            window.setTimeout(() => {
              if (!alive) return;
              line.textContent = text;
              line.classList.add('gd-show');
            }, 220);
          }

          function sentence(ev: Event): string {
            const vars: Record<string, string | number> = { gen: ev.gen, v: ev.value ?? 0 };
            return t('garden.event.' + ev.kind, vars);
          }

          /* ── 돌리기 ───────────────────────────────────────────────────── */
          let acc = 0;
          let prev = performance.now();
          /** 초당 몇 세대. 너무 빠르면 무늬가 안 읽히고, 느리면 안 자란다. */
          const GPS = 18;

          function loop(now: number): void {
            raf = requestAnimationFrame(loop);
            const dt = Math.min(120, now - prev);
            prev = now;
            if (paused) return;
            acc += dt;
            /* 오래 굴리면 어떤 규칙이든 판을 다 채우고 그때부터는 잡음이다.
               600세대쯤에서 새로 심는다 — 볼거리는 「자라는 동안」에 있다. */
            if (last && last.gen >= 600) reseed();
            const stepMs = 1000 / GPS;
            let steps = 0;
            while (acc >= stepMs && steps < 4) {
              acc -= stepMs;
              steps++;
              last = life.step(table.born, table.stay);
              const ev = watcher.observe(last);
              if (ev) {
                say(sentence(ev));
                // 다 죽었으면 잠시 뒤 다시 심는다 — 빈 화면을 계속 보여 줄 이유가 없다
                /* 다 죽었거나 굳었으면 잠시 뒤 다시 심는다 — 아무 일도 안 일어나는 화면을
                   계속 보여 줄 이유가 없다. 굳은 그림은 잠깐 더 보여 준다(그것도 결과다). */
                if (ev.kind === 'extinct') window.setTimeout(() => alive && reseed(), 2600);
                else if (ev.kind === 'frozen') window.setTimeout(() => alive && reseed(), 6000);
              }
            }
            if (steps) {
              draw();
              genEl.textContent = t('garden.gen', { gen: last!.gen, pop: last!.pop });
            }
          }

          function start(): void {
            if (raf === undefined) {
              prev = performance.now();
              raf = requestAnimationFrame(loop);
            }
          }
          function stop(): void {
            if (raf !== undefined) cancelAnimationFrame(raf);
            raf = undefined;
          }

          /* ── 단추 ─────────────────────────────────────────────────────── */
          seedBtn.onclick = () => reseed();
          pauseBtn.onclick = () => {
            paused = !paused;
            pauseBtn.setAttribute('aria-pressed', String(paused));
            pauseBtn.textContent = paused ? t('garden.resume') : t('garden.pause');
          };

          void (async () => {
            await loadNamespace(NS);
            if (!alive) return;
            ruleEl.textContent = rule.name || t('garden.rule.wild');
            codeEl.textContent = rule.code;
            seedBtn.textContent = t('garden.reseed');
            pauseBtn.textContent = t('garden.pause');
            sub.textContent = t('garden.hint.' + (rule.id === 'wild' ? 'wild' : 'named'));
            build();
            start();
            say(t('garden.line.today', { rule: rule.name || t('garden.rule.wild'), code: rule.code }));
          })();

          /* 크기가 **실제로** 바뀐 때만 다시 짓는다. 그냥 다시 지으면 관찰 중이던 세계가
             지워진다 — 열자마자 씨앗이 두 번 뿌려지고 있었다(실측). */
          const ro = new ResizeObserver(() => {
            if (!img) return;
            const r = wrap.getBoundingClientRect();
            const w = Math.max(40, Math.floor(r.width / CELL));
            const h = Math.max(30, Math.floor((r.height || 420) / CELL));
            if (w === life.w && h === life.h) return;
            build();
          });
          ro.observe(wrap);

          const eye = new IntersectionObserver(
            (entries) => {
              if (entries[0]?.isIntersecting) start();
              else stop();
            },
            { threshold: 0.02 }
          );
          eye.observe(wrap);

          Toolbox.onDispose?.(() => {
            alive = false;
            stop();
            ro.disconnect();
            eye.disconnect();
            try {
              localStorage.setItem(STORE_KEY, JSON.stringify({ day, seenGen: last?.gen ?? 0 }));
            } catch (_) {
              /* 못 적어도 정원은 돈다 */
            }
          });
        }
      }
    ]
  });
})();
