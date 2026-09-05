/**
 * 관찰물이 껍데기에게 말하는 자리 (TASK-KL-247, 정원 병합)
 *
 * 정원 갈래 열 개는 각자 자기 머리글, 단추줄, 사건 로그를 지었다. 같은 것을 열 벌 지으니
 * 갈래마다 단추 자리와 색이 달랐고, 고칠 일이 생기면 열 군데를 고쳐야 했다.
 *
 * 여기를 지나면 껍데기는 하나다. 멍(`widgets/meong`)이 판과 손잡이를 짓고, 관찰물은
 * **무엇을 그릴지와 무슨 일이 일어났는지**만 말한다.
 *
 * 멈춤과 속도는 관찰물이 안 갖는다. 껍데기가 정하고 관찰물은 물어본다 (`running`, `speed`).
 * 그래야 어느 갈래로 가든 재생 단추가 같은 자리에 있다.
 */

/** 관찰물이 쓰는 껍데기. 멍이 준다 */
export interface SimHost {
  /** 캔버스를 붙일 자리. 이미 크기가 정해져 있다 */
  stage: HTMLElement;
  /** 위에 뜨는 이름과 수치 (`R 13, μ 0.15`) */
  setName(name: string, code?: string): void;
  /** 오른쪽 위 걸음 수 */
  setStep(text: string): void;
  /** 아래 사건 문장. `hint` 는 그 밑 작은 줄 */
  say(line: string, hint?: string): void;
  /** dock 단추 한 개 (재파종, 상처). 라벨은 부르는 쪽이 옮긴 말로 준다 */
  action(key: string, glyph: string, label: string, fn: () => void): void;
  /** 손잡이 패널에 얹을 것 (도감, 소리 끄기 같은 갈래 고유 손잡이) */
  panel(el: HTMLElement): void;
  /** 껍데기의 재생 상태. false 면 시각이 안 흐른다 */
  running(): boolean;
  /** 0.5, 1, 2, 4 */
  speed(): number;
}

/** 갈래 하나가 껍데기에게 돌려주는 것 */
export interface SimHandle {
  /** 다른 갈래로 갈 때. 루프, 관찰자, 소리를 여기서 끊는다 */
  dispose(): void;
}

export type SimBuilder = (host: SimHost) => SimHandle;

/**
 * 속도 배수를 걸음 수로 바꾸는 것. 갈래마다 따로 세던 누적을 한 자리로
 *
 * 반 배속에서도 첫 판은 한 걸음 그린다. 안 그러면 처음 연 화면이 빈 채로 한 프레임 뜬다.
 */
export function pacer(): (host: SimHost, baseSteps: number, step: () => void) => number {
  let budget = 1;
  return (host, baseSteps, step) => {
    budget += baseSteps * host.speed();
    let count = 0;
    while (budget >= 1 && count < 12) {
      step();
      budget -= 1;
      count++;
    }
    return count;
  };
}

/** 판을 채우는 캔버스 한 장. 갈래마다 같은 줄을 열 번 쓰던 자리 */
export function simCanvas(host: SimHost, pixelated = false): HTMLCanvasElement {
  if (!document.getElementById('gsim-style')) {
    const style = document.createElement('style');
    style.id = 'gsim-style';
    style.textContent =
      '.gsim-canvas{position:absolute;inset:0;display:block;width:100%;height:100%}' +
      '.gsim-canvas.is-pixel{image-rendering:pixelated}';
    document.head.appendChild(style);
  }
  const canvas = document.createElement('canvas');
  canvas.className = 'gsim-canvas' + (pixelated ? ' is-pixel' : '');
  host.stage.appendChild(canvas);
  return canvas;
}

/** 판의 CSS 픽셀 크기. 아직 안 눕혀졌으면 420 을 기본으로 */
export function stageSize(host: SimHost): { w: number; h: number } {
  const rect = host.stage.getBoundingClientRect();
  return { w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height || 420)) };
}
