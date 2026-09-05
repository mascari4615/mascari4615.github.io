export interface LeniaPreset { id: string; radius: number; mu: number; sigma: number; dt: number; rle: string; }
export const LENIA_PRESETS: LeniaPreset[] = [
  { id: 'orbium', radius: 13, mu: 0.150, sigma: 0.017, dt: 0.1, rle: '7.MD6.qL$6.pKqEqFURpApBRAqQ$5.VqTrSsBrOpXpWpTpWpUpCrQ$4.CQrQsTsWsApITNPpGqGvL$3.IpIpWrOsGsBqXpJ4.LsFrL$A.DpKpSpJpDqOqUqSqE5.ExD$qL.pBpTT2.qCrGrVrWqM5.sTpP$.pGpWpD3.qUsMtItQtJ6.tL$.uFqGH3.pXtOuR2vFsK5.sM$.tUqL4.GuNwAwVxBwNpC4.qXpA$2.uH5.vBxGyEyMyHtW4.qIpL$2.wV5.tIyG3yOxQqW2.FqHpJ$2.tUS4.rM2yOyJyOyHtVpPMpFqNV$2.HsR4.pUxAyOxLxDxEuVrMqBqGqKJ$3.sLpE3.pEuNxHwRwGvUuLsHrCqTpR$3.TrMS2.pFsLvDvPvEuPtNsGrGqIP$4.pRqRpNpFpTrNtGtVtStGsMrNqNpF$5.pMqKqLqRrIsCsLsIrTrFqJpHE$6.RpSqJqPqVqWqRqKpRXE$8.OpBpIpJpFTK!' },
  { id: 'ignis', radius: 13, mu: 0.110, sigma: 0.012, dt: 0.1, rle: '10.IPQMF$8.pKpRpSpTpWpUpQpBM$6.XqGV2DSpSqNqQqKpPSB$5.qBpX5.pOrHrSrMqSpTS$4.qCpQ6.rAtAtDsPrSqTpRP$4.rD6.pUuDuQtWtLsPrNqMpHA$3.uG7.uGwQvCuFuAtFrSqQpTN$2.vAL6.rKyFxLvIvBuTsXqWqFqAU$.tXqB7.wGyOyLxHwVuPqWpEpCpTpA$rDMpO6.sOxFyL2yOwDqR2.EpJpD$.WpH5.pIvNwSxQxXvEpD4.pFW$.pApM5.tUvCvUwEsI6.pOM$.TpPU3.sHtOuJuQqC7.qH$.HpJpPXIrKsFsStBpV7.pApH$2.MpGpMsStHsSrXqU8.rP$3.GrJtPuHtHrD8.sH$3.GrOsXtLsSU7.sC$4.pPrQrJpHpOQ5.qXT$5.pK.JpHpOWOQpMqHqG$8.KpEpMpQpLVqU$13.qD$12.pB!' },
  { id: 'scutium', radius: 13, mu: 0.290, sigma: 0.045, dt: 0.1, rle: '5.pGQ$6.sUsDqRR$4.VpXrJwKvNtXrW$2.ApVrGrWsIwKyOyDwTuNO$2.qArOrIqIpPpTxH2yOyIvKqG$rVpIrNrJpH4.xP3yOvFqWA$sKvNsKqE5.pI4yOuHqPC$sNxBuMpD5.JuN3yOwXsUpN$sGxFyOT5.pCtIyF3yOuKqUH$rPwXyOxT5.qKtSxS3yOvIrQT$pQwK2yOtWXJXqHsGuWxW3yOvPsApC$.vQ3yOuVsLsGsXuMwOyK3yOvHrVpC$.rKyK3yOxEwBwCwXyE3yOxQuMrJU$.WvC5yOyM5yOwFtJqOL$2.rVwO9yOwWuMsApOC$2.pLtBwK6yOyJwQuTsQqLP$3.qHsWvEwUxTyCxRwWvRuGsNqSpA$3.HqBrUtHuGuPuLtVsXrSqIXB$4.DpDqEqW2rIqWqGpJN$6.ENTUPHA!' },
  { id: 'valvatus', radius: 13, mu: 0.282, sigma: 0.0448, dt: 0.1, rle: '6.H$7.qTpSF$7.pTtGrWqGL$5.UpOqDwRvSuDsGpK$3.JpVqSrCrJsAyNxUwGuJqND$pI2.pXqWqLpMpCpIsX2yOxTvOrOpJ$pRtGpKrCqLN4.wA2yOyMvGsBpR$pUtSuKrNpE6.4yOuOrQpD$pSuAxRrQI6.tW3yOwStIqME$pQuAxWyOB6.sIyG2yOyHuOrNV$pFtUxVyOrN5.pBsQxH3yOvIsEpK$.tSxQ2yOpP4.qOtPxE3yOvNsKpQB$.sAxI2yOxCrSqIqFqVsSvAxQ2yOyJvGsHpPB$.qPwB3yOxEuMtRtXvAwQyI2yOxHuNrTpI$.pVtR4yOyFxDwUxIyF2yOyEvXtMrAU$.pDsEvQ9yOyBwMuLsHqBI$.BqRtLwG7yOxOwHuRsVqVpB$2.pCrJtPvRxJyJyOyIxPwRvPuIsUrFpMF$3.pJrGsWuHvFvQvNvDuKtLsHqWpNI$3.BpBqIrMsHsSsUsNsArFqFpDG$5.KpDpSqCqFqCpQpCMA$7.CGHGD!' }
];
export function leniaPresetForDay(day: string): LeniaPreset { let hash = 2166136261; for (let i = 0; i < day.length; i++) hash = Math.imul(hash ^ day.charCodeAt(i), 16777619); return LENIA_PRESETS[(hash >>> 0) % LENIA_PRESETS.length]; }

export interface LeniaStats { step: number; mass: number; occupied: number; cx: number; cy: number; components: number; activity: number; }

/** Decode the compact continuous RLE used by the official Chakazul/Lenia species catalogue. */
function decodePattern(rle: string): number[][] {
  const rows: number[][] = [];
  let row: number[] = [], count = '', prefix = '';
  const append = (value: number): void => { const repeats = count ? Number(count) : 1; for (let i = 0; i < repeats; i++) row.push(value); count = ''; prefix = ''; };
  for (const character of rle.replace(/!$/, '') + '$') {
    if (character >= '0' && character <= '9') { count += character; continue; }
    if ('pqrstuvwxy@'.includes(character)) { prefix = character; continue; }
    if (character === '$') {
      rows.push(row); const repeats = count ? Number(count) : 1; for (let i = 1; i < repeats; i++) rows.push([]);
      row = []; count = ''; prefix = ''; continue;
    }
    let value = 0;
    if (character === 'o') value = 255;
    else if (character !== '.' && character !== 'b') value = prefix ? (prefix.charCodeAt(0) - 112) * 24 + character.charCodeAt(0) - 40 : character.charCodeAt(0) - 64;
    append(value / 255);
  }
  return rows;
}

export class Lenia {
  readonly w: number; readonly h: number; readonly preset: LeniaPreset;
  cells: Float32Array; private next: Float32Array; private offsets: Int16Array; private weights: Float32Array;
  stepNo = 0;

  constructor(w: number, h: number, preset: LeniaPreset) {
    this.w = w; this.h = h; this.preset = preset; this.cells = new Float32Array(w * h); this.next = new Float32Array(w * h);
    const offsets: number[] = [], weights: number[] = []; let sum = 0;
    const r = preset.radius;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const distance = Math.hypot(x, y) / r; if (distance <= 0.05 || distance > 1) continue;
      // Original Lenia catalogue default (kn=1): compact polynomial kernel core.
      const weight = (4 * distance * (1 - distance)) ** 4;
      offsets.push(x, y); weights.push(weight); sum += weight;
    }
    this.offsets = Int16Array.from(offsets); this.weights = Float32Array.from(weights.map(weight => weight / sum));
  }

  seed(random: () => number): void {
    this.cells.fill(0); this.stepNo = 0;
    const pattern = decodePattern(this.preset.rle);
    const patternW = Math.max(...pattern.map(row => row.length));
    const mirror = random() < 0.5;
    const offsetX = Math.floor((this.w - patternW) / 2), offsetY = Math.floor((this.h - pattern.length) / 2);
    for (let y = 0; y < pattern.length; y++) for (let x = 0; x < pattern[y].length; x++) {
      const sourceX = mirror ? pattern[y].length - 1 - x : x;
      const px = (offsetX + x + this.w) % this.w, py = (offsetY + y + this.h) % this.h;
      this.cells[py * this.w + px] = pattern[y][sourceX];
    }
  }

  step(): LeniaStats {
    const { w, h, cells, next, offsets, weights, preset } = this; let activity = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let potential = 0;
      for (let k = 0, q = 0; k < weights.length; k++, q += 2) {
        const nx = (x + offsets[q] + w) % w, ny = (y + offsets[q + 1] + h) % h;
        potential += cells[ny * w + nx] * weights[k];
      }
      // Original catalogue default (gn=1), paired with the stored species seeds above.
      const band = Math.max(0, 1 - (potential - preset.mu) ** 2 / (9 * preset.sigma ** 2));
      const growth = 2 * band ** 4 - 1;
      const i = y * w + x; const value = Math.max(0, Math.min(1, cells[i] + growth * preset.dt));
      next[i] = value; activity += Math.abs(value - cells[i]);
    }
    this.cells = next; this.next = cells; this.stepNo++;
    return this.measure(activity / cells.length);
  }

  private measure(activity: number): LeniaStats {
    let mass = 0, occupied = 0, xCos = 0, xSin = 0, yCos = 0, ySin = 0;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const value = this.cells[y * this.w + x]; mass += value; if (value >= 0.1) occupied++; const ax = x / this.w * Math.PI * 2, ay = y / this.h * Math.PI * 2; xCos += Math.cos(ax) * value; xSin += Math.sin(ax) * value; yCos += Math.cos(ay) * value; ySin += Math.sin(ay) * value; }
    const cx = (Math.atan2(xSin, xCos) / (Math.PI * 2) + 1) % 1, cy = (Math.atan2(ySin, yCos) / (Math.PI * 2) + 1) % 1;
    return { step: this.stepNo, mass: mass / this.cells.length, occupied: occupied / this.cells.length, cx, cy, components: this.countComponents(0.18), activity };
  }

  private countComponents(threshold: number): number {
    const seen = new Uint8Array(this.cells.length), queue = new Int32Array(this.cells.length); let components = 0;
    for (let start = 0; start < this.cells.length; start++) {
      if (seen[start] || this.cells[start] < threshold) continue; components++;
      let head = 0, tail = 0; queue[tail++] = start; seen[start] = 1;
      while (head < tail) { const i = queue[head++], x = i % this.w, y = Math.floor(i / this.w); const around = [y * this.w + (x + 1) % this.w, y * this.w + (x - 1 + this.w) % this.w, ((y + 1) % this.h) * this.w + x, ((y - 1 + this.h) % this.h) * this.w + x]; for (const j of around) if (!seen[j] && this.cells[j] >= threshold) { seen[j] = 1; queue[tail++] = j; } }
    }
    return components;
  }
}

export type LeniaEvent = 'emerged' | 'moving' | 'split' | 'collapse' | 'steady';
export class LeniaWatcher {
  private lastEvent = -1000; private peakMass = 0; private lastCx = 0.5; private lastCy = 0.5; private travel = 0; private emerged = false; private split = false; private announcedSteady = false;
  reset(): void { this.lastEvent = -1000; this.peakMass = 0; this.lastCx = 0.5; this.lastCy = 0.5; this.travel = 0; this.emerged = false; this.split = false; this.announcedSteady = false; }
  observe(stats: LeniaStats): LeniaEvent | null {
    let dx = Math.abs(stats.cx - this.lastCx), dy = Math.abs(stats.cy - this.lastCy); dx = Math.min(dx, 1 - dx); dy = Math.min(dy, 1 - dy); if (stats.mass > 0.002) this.travel += Math.hypot(dx, dy); this.lastCx = stats.cx; this.lastCy = stats.cy;
    this.peakMass = Math.max(this.peakMass, stats.mass);
    if (stats.step - this.lastEvent < 100) return null;
    let event: LeniaEvent | null = null;
    if (!this.emerged && stats.step > 35 && stats.mass > 0.008 && stats.components > 0 && stats.components <= 8) { event = 'emerged'; this.emerged = true; }
    else if (this.travel > 0.16) { event = 'moving'; this.travel = 0; }
    else if (!this.split && stats.components >= 2 && stats.components <= 6 && stats.step > 100) { event = 'split'; this.split = true; }
    else if (this.peakMass > 0.01 && stats.mass < this.peakMass * 0.45) event = 'collapse';
    else if (!this.announcedSteady && stats.step > 400 && stats.activity < 0.00005 && stats.mass > 0.004) { event = 'steady'; this.announcedSteady = true; }
    if (event) this.lastEvent = stats.step; return event;
  }
}
