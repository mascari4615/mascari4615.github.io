/**
 * 코드 사진의 **껍데기** (TASK-KL-245)
 *
 * carbon.now.sh 도 ray.so 도 「둥근 창 + 신호등 세 개」 하나뿐이다. 우리는 껍데기를 하나로
 * 정하지 않는다 — 고르는 것은 쓰는 사람이고, 그러니 껍데기는 **갈아 끼우는 부품**이어야 한다.
 * 껍데기 하나 = 이 파일의 표에 한 줄. 새 껍데기를 더하는 일이 그 이상으로 커지면 안 된다.
 *
 * 껍데기는 **코드를 모른다.** 테두리를 어떻게 그리고 안쪽을 얼마나 비우는지만 안다.
 * 반대로 코드를 그리는 쪽은 껍데기를 모른다. 그래서 「종이 껍데기 + 어두운 색칠」 같은
 * 조합도 따로 만들 것 없이 그냥 된다.
 */

export interface FrameMeta {
  /** 언어 이름 (라벨에 쓴다) */
  lang: string;
  /** 줄 수 */
  lines: number;
  /** 파일 이름 — 비어 있을 수 있다 */
  file: string;
  /** 오늘 날짜 `YYYY-MM-DD` */
  today: string;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 껍데기가 정하는 색 한 벌. 코드 글자색은 여기 얹혀 정해진다. */
export interface FramePalette {
  /** 껍데기 바깥(여백) 바탕 */
  outer: string;
  /** 코드가 앉는 바닥 */
  inner: string;
  /** 기본 글자색 */
  text: string;
  /** 줄 번호·라벨처럼 물러나야 하는 것 */
  faint: string;
  /** 어두운 바탕인가 — 문법 색을 고를 때 쓴다 */
  dark: boolean;
}

export interface Frame {
  id: string;
  /** 코드가 들어갈 안쪽 여백 */
  pad: { top: number; right: number; bottom: number; left: number };
  palette: FramePalette;
  /** 코드 **뒤**에 깔 것 (창틀·라벨·종이결) */
  back(c: CanvasRenderingContext2D, box: Box, meta: FrameMeta): void;
  /** 코드 **위**에 얹을 것 (테두리 마감) */
  front?(c: CanvasRenderingContext2D, box: Box, meta: FrameMeta): void;
}

const UI = '600 13px KarmoSans, ui-sans-serif, system-ui, sans-serif';

/** 모서리가 둥근 네모 — `roundRect` 가 없는 자리를 위해 직접 그린다. */
function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.lineTo(x + w - rr, y);
  c.quadraticCurveTo(x + w, y, x + w, y + rr);
  c.lineTo(x + w, y + h - rr);
  c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  c.lineTo(x + rr, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - rr);
  c.lineTo(x, y + rr);
  c.quadraticCurveTo(x, y, x + rr, y);
  c.closePath();
}

/* ── 껍데기들 ─────────────────────────────────────────────────────────── */

/** 실험실 표본 — 라벨이 붙은 유리판. KarmoLab 것으로 보이는 기본값. */
const specimen: Frame = {
  id: 'specimen',
  pad: { top: 52, right: 22, bottom: 22, left: 18 },
  palette: { outer: '#0d1017', inner: '#141922', text: '#e8eef8', faint: '#7b8798', dark: true },
  back(c, b, m) {
    roundRect(c, b.x, b.y, b.w, b.h, 14);
    c.fillStyle = this.palette.inner;
    c.fill();

    /* 밑에 깔린 모눈 — 실험 노트의 결. 아주 옅게, 코드를 방해하지 않을 만큼만. */
    c.save();
    roundRect(c, b.x, b.y, b.w, b.h, 14);
    c.clip();
    c.strokeStyle = 'rgba(255,255,255,.035)';
    c.lineWidth = 1;
    for (let x = b.x; x < b.x + b.w; x += 22) {
      c.beginPath();
      c.moveTo(Math.round(x) + 0.5, b.y);
      c.lineTo(Math.round(x) + 0.5, b.y + b.h);
      c.stroke();
    }
    for (let y = b.y; y < b.y + b.h; y += 22) {
      c.beginPath();
      c.moveTo(b.x, Math.round(y) + 0.5);
      c.lineTo(b.x + b.w, Math.round(y) + 0.5);
      c.stroke();
    }
    c.restore();

    /* 표본 라벨 — 무엇을, 얼마나, 언제. */
    c.save();
    c.font = UI;
    c.textBaseline = 'middle';
    c.fillStyle = '#9fe0c8';
    c.fillText(m.lang.toUpperCase(), b.x + 18, b.y + 26);
    const w1 = c.measureText(m.lang.toUpperCase()).width;
    c.fillStyle = this.palette.faint;
    const tail = `· ${m.lines}줄 · ${m.today}`;
    c.fillText(tail, b.x + 18 + w1 + 8, b.y + 26);
    if (m.file) {
      const fw = c.measureText(m.file).width;
      c.fillText(m.file, b.x + b.w - 18 - fw, b.y + 26);
    }
    // 라벨과 코드를 가르는 줄
    c.strokeStyle = 'rgba(255,255,255,.09)';
    c.beginPath();
    c.moveTo(b.x + 14, b.y + 44.5);
    c.lineTo(b.x + b.w - 14, b.y + 44.5);
    c.stroke();
    c.restore();
  },
  front(c, b) {
    roundRect(c, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 14);
    c.strokeStyle = 'rgba(255,255,255,.12)';
    c.lineWidth = 1;
    c.stroke();
  }
};

/** 터미널 창 — 경로가 제목이고, 맨 위에 프롬프트 한 줄. */
const terminal: Frame = {
  id: 'terminal',
  pad: { top: 46, right: 20, bottom: 20, left: 16 },
  palette: { outer: '#0b0d12', inner: '#10141b', text: '#dfe7f2', faint: '#6f7c8f', dark: true },
  back(c, b, m) {
    roundRect(c, b.x, b.y, b.w, b.h, 12);
    c.fillStyle = this.palette.inner;
    c.fill();
    // 제목 띠
    c.save();
    roundRect(c, b.x, b.y, b.w, b.h, 12);
    c.clip();
    c.fillStyle = 'rgba(255,255,255,.045)';
    c.fillRect(b.x, b.y, b.w, 38);
    c.restore();
    /* 신호등 대신 우리 표식 — 남의 운영체제 흉내를 낼 이유가 없다. */
    c.save();
    const cy = b.y + 19;
    const marks = ['#5c6b7f', '#5c6b7f', '#9fe0c8'];
    marks.forEach((col, i) => {
      c.fillStyle = col;
      c.beginPath();
      c.arc(b.x + 20 + i * 15, cy, 4, 0, Math.PI * 2);
      c.fill();
    });
    c.font = UI;
    c.textBaseline = 'middle';
    c.fillStyle = this.palette.faint;
    const title = m.file || `${m.lang} · ${m.lines}줄`;
    const tw = c.measureText(title).width;
    c.fillText(title, b.x + (b.w - tw) / 2, cy);
    c.restore();
  },
  front(c, b) {
    roundRect(c, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 12);
    c.strokeStyle = 'rgba(255,255,255,.1)';
    c.lineWidth = 1;
    c.stroke();
  }
};

/** 인쇄된 종이 — 틀이 없다. 종이결과 줄 번호만. */
const paper: Frame = {
  id: 'paper',
  pad: { top: 34, right: 26, bottom: 30, left: 20 },
  palette: { outer: '#e7e2d6', inner: '#f7f4ec', text: '#2b2b2b', faint: '#a8a191', dark: false },
  back(c, b, m) {
    c.fillStyle = this.palette.inner;
    c.fillRect(b.x, b.y, b.w, b.h);
    /* 종이결 — 규칙적인 점을 아주 옅게. 무늬가 보이면 종이가 아니라 벽지가 된다. */
    c.save();
    c.fillStyle = 'rgba(120,105,80,.05)';
    for (let y = b.y + 3; y < b.y + b.h; y += 4) {
      for (let x = b.x + ((y % 8) / 4) * 2; x < b.x + b.w; x += 4) {
        c.fillRect(x, y, 1, 1);
      }
    }
    c.restore();
    if (m.file) {
      c.save();
      c.font = UI;
      c.textBaseline = 'middle';
      c.fillStyle = this.palette.faint;
      c.fillText(m.file, b.x + 20, b.y + 18);
      c.restore();
    }
  }
};

/** 민짜 — 껍데기 없음. 남의 문서에 끼워 넣을 때. */
const bare: Frame = {
  id: 'bare',
  pad: { top: 16, right: 16, bottom: 16, left: 14 },
  palette: { outer: '#0f1217', inner: '#0f1217', text: '#e6ecf5', faint: '#6f7c8f', dark: true },
  back(c, b) {
    c.fillStyle = this.palette.inner;
    c.fillRect(b.x, b.y, b.w, b.h);
  }
};

export const FRAMES: Frame[] = [specimen, terminal, paper, bare];

export function frameById(id: string): Frame {
  return FRAMES.find((f) => f.id === id) || FRAMES[0];
}
